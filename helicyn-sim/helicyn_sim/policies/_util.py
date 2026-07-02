"""Shared helpers used by more than one policy, so capacity-check/allocate
logic and deadline-vs-queue-vs-reject logic live in exactly one place.
"""
from __future__ import annotations

import math
from typing import Callable, Optional

from helicyn_sim.models.server import Server
from helicyn_sim.policies.base import PolicyDecision
from helicyn_sim.schemas.workload import Job
from helicyn_sim.simulation.state import SimState


def default_server_order(state: SimState) -> list[Server]:
    """Fixed site -> rack -> server insertion order, the same order every
    call. This is the ordering BaselineFirstFitPolicy uses; other policies
    reuse it as a starting point and re-sort/re-filter it.
    """
    return [
        server
        for site in state.sites.values()
        for rack_id in site.rack_ids
        for server in state.servers_in_rack(rack_id)
    ]


def attempt_place(state: SimState, job: Job, server_order: list[Server]) -> Optional[Server]:
    """Try each server in `server_order` in turn; place `job` on the first
    one with capacity, mutating `state`/`job`/`server`. Returns the server
    placed on, or None if none fit.
    """
    for server in server_order:
        if server.can_fit(job.cpu_demand_units, job.memory_demand_gb):
            server.allocate(job.cpu_demand_units, job.memory_demand_gb, job.job_id)
            job.site_id = server.site_id
            job.rack_id = server.rack_id
            job.server_id = server.server_id
            job.start_time = state.step
            state.running_job_ids.add(job.job_id)
            return server
    return None


def handle_unplaced(state: SimState, job: Job, reason: str = "no_capacity_available") -> PolicyDecision:
    """A job that couldn't be placed this step: reject it if its deadline
    has passed, otherwise leave it queued. Callers are responsible for
    keeping `job.job_id` in the policy's `still_queued` list when this
    returns a "queue" decision.
    """
    if job.deadline_time is not None and state.step > job.deadline_time:
        job.rejected = True
        job.deadline_missed = True
        state.rejected_job_ids.add(job.job_id)
        return PolicyDecision(job_id=job.job_id, action="reject", reason="deadline_passed_no_capacity")
    return PolicyDecision(job_id=job.job_id, action="queue", reason=reason)


def remaining_slack_steps(job: Job, state: SimState) -> int:
    """How many more steps until `job`'s deadline. A very large number if
    the job has no deadline.
    """
    if job.deadline_time is None:
        return 1_000_000
    return job.deadline_time - state.step


def signal_aware_place_jobs(
    state: SimState,
    flexible_attr: str,
    current_signal_key: str,
    profile_attr: str,
    forecast_fn: Callable[[str, float], float],
    delay_reason: str,
    place_reason: str,
    forced_reason: str,
    lookahead_improvement_threshold: float = 0.10,
    lookahead_sample_steps: int = 6,
) -> list[PolicyDecision]:
    """Shared implementation behind CarbonAwarePolicy and PriceAwarePolicy:
    both "delay a flexible job if a meaningfully better signal window is
    coming within its slack, otherwise place it now at whichever site
    currently has the best signal and has capacity" -- differing only in
    which signal (carbon vs price) and which per-site profile attribute
    they read. See docs/model_assumptions.md.

    `flexible_attr`: "carbon_flexible" or "price_flexible" on Job.
    `current_signal_key`: key into `state.current_site_signals[site_id]`.
    `profile_attr`: "carbon_profile" or "price_profile" on Site.
    `forecast_fn`: noise-free forecast function from models/grid.py.
    """
    from helicyn_sim.simulation.clock import hour_of_day as step_hour_of_day

    decisions: list[PolicyDecision] = []
    still_queued: list[str] = []
    dt_minutes = state.config.simulation.timestep_minutes
    all_servers = default_server_order(state)

    for job_id in state.job_queue:
        job = state.all_jobs[job_id]

        # Latency-sensitive jobs are placed immediately and never delayed
        # for signal optimization.
        if job.latency_sensitive or not getattr(job, flexible_attr):
            target = attempt_place(state, job, all_servers)
            if target is not None:
                decisions.append(
                    PolicyDecision(
                        job_id=job.job_id,
                        action="place",
                        target_site_id=target.site_id,
                        target_rack_id=target.rack_id,
                        target_server_id=target.server_id,
                        reason="not_flexible_placed_first_fit",
                    )
                )
            else:
                decision = handle_unplaced(state, job)
                if decision.action == "queue":
                    still_queued.append(job_id)
                decisions.append(decision)
            continue

        slack = remaining_slack_steps(job, state)
        current_best_site = None
        current_best_value = None
        sites_with_capacity: list[str] = []
        for site in state.sites.values():
            site_servers = [s for rid in site.rack_ids for s in state.servers_in_rack(rid)]
            has_capacity = any(s.can_fit(job.cpu_demand_units, job.memory_demand_gb) for s in site_servers)
            value = state.current_site_signals.get(site.site_id, {}).get(current_signal_key)
            if has_capacity and value is not None:
                sites_with_capacity.append(site.site_id)
                if current_best_value is None or value < current_best_value:
                    current_best_value = value
                    current_best_site = site.site_id

        if not sites_with_capacity:
            decision = handle_unplaced(state, job)
            if decision.action == "queue":
                still_queued.append(job_id)
            decisions.append(decision)
            continue

        # A queued job still needs `work_steps_needed` more steps to run
        # once placed -- it is not enough to have *any* slack left, there
        # must be enough slack left to both place now AND finish by the
        # deadline. Force placement as soon as delaying one more step would
        # make that impossible.
        work_steps_needed = max(1, math.ceil(job.remaining_work_units / dt_minutes))

        # If we're at (or past) the last safe moment to place without
        # risking the deadline, place now regardless of signal.
        if slack <= work_steps_needed:
            target = attempt_place(state, job, all_servers)
            if target is not None:
                decisions.append(
                    PolicyDecision(
                        job_id=job.job_id,
                        action="place",
                        target_site_id=target.site_id,
                        target_rack_id=target.rack_id,
                        target_server_id=target.server_id,
                        reason=forced_reason,
                    )
                )
            else:
                decision = handle_unplaced(state, job)
                if decision.action == "queue":
                    still_queued.append(job_id)
                decisions.append(decision)
            continue

        # Forecast the best (lowest) signal value across all sites within
        # this job's remaining slack window.
        max_delay_steps = (
            int(job.max_delay_minutes / dt_minutes) if job.max_delay_minutes is not None else slack
        )
        latest_safe_delay_steps = slack - work_steps_needed  # never consider delaying past this
        horizon_steps = max(1, min(latest_safe_delay_steps, max_delay_steps))
        sample_stride = max(1, horizon_steps // lookahead_sample_steps)
        best_forecast_value = None
        for future_step in range(state.step + 1, state.step + horizon_steps + 1, sample_stride):
            future_hour = step_hour_of_day(future_step, dt_minutes)
            for site in state.sites.values():
                forecast_value = forecast_fn(getattr(site, profile_attr), future_hour)
                if best_forecast_value is None or forecast_value < best_forecast_value:
                    best_forecast_value = forecast_value

        meaningfully_better = (
            best_forecast_value is not None
            and current_best_value is not None
            and best_forecast_value <= current_best_value * (1.0 - lookahead_improvement_threshold)
        )

        if meaningfully_better:
            still_queued.append(job_id)
            decisions.append(PolicyDecision(job_id=job.job_id, action="delay", reason=delay_reason))
            continue

        # Place now at the site with the best current signal that has capacity.
        best_site_servers = [
            s for rid in state.sites[current_best_site].rack_ids for s in state.servers_in_rack(rid)
        ]
        target = attempt_place(state, job, best_site_servers)
        if target is not None:
            decisions.append(
                PolicyDecision(
                    job_id=job.job_id,
                    action="place",
                    target_site_id=target.site_id,
                    target_rack_id=target.rack_id,
                    target_server_id=target.server_id,
                    reason=place_reason,
                )
            )
        else:
            decision = handle_unplaced(state, job)
            if decision.action == "queue":
                still_queued.append(job_id)
            decisions.append(decision)

    state.job_queue = still_queued
    return decisions

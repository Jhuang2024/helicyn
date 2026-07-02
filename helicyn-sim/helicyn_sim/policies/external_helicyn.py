"""ExternalHelicynPolicy: the Phase 2 AFTER policy. Builds a `FleetState`
from the current `SimState`, POSTs it to a running `helicyn-ml serve`
process, validates every action in the response against this simulator's
actual physical constraints, applies whatever validates, and falls back to
safe first-fit placement for anything it doesn't. See
docs/phase2_external_helicyn.md for the full contract.

`helicyn-ml`'s `policy_ranker` is teacher-imitation only (see
docs/ml_integration_plan.md) -- this adapter does not assume the
recommendation is good, only that it might be, and never trusts it over
the simulator's own capacity/state invariants. If Helicyn performs worse
than the baseline in a given run, that is reported as-is; nothing here
nudges the comparison in Helicyn's favor.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Optional

import requests

from helicyn_sim.models.dvfs import DVFS_STATES
from helicyn_sim.policies._util import attempt_place, default_server_order, handle_unplaced
from helicyn_sim.policies.base import Policy, PolicyDecision
from helicyn_sim.schemas.action import ActionType, CandidateAction
from helicyn_sim.schemas.fleet_state import (
    FleetState,
    GridSignal,
    HelicynWorkloadType,
    QueuedJob,
    Rack as FleetRack,
    RunningJob,
    Server as FleetServer,
    Site as FleetSite,
    WeatherSignal,
)
from helicyn_sim.schemas.recommendation import Recommendation
from helicyn_sim.schemas.workload import WorkloadType
from helicyn_sim.simulation.clock import step_timestamp
from helicyn_sim.simulation.state import SimState

DEFAULT_HELICYN_URL = "http://127.0.0.1:8765/recommend"
DEFAULT_TIMEOUT_SECONDS = 10.0

# This simulator's internal WorkloadType (schemas/workload.py, 4 values) is
# not the same enum as helicyn_ml's real WorkloadType (10 values, no
# "maintenance" concept) -- see HelicynWorkloadType's docstring. Map before
# building a FleetState so a maintenance job doesn't 422 the /recommend call.
_WORKLOAD_TYPE_TO_HELICYN = {
    WorkloadType.LLM_INFERENCE: HelicynWorkloadType.LLM_INFERENCE,
    WorkloadType.BATCH: HelicynWorkloadType.BATCH,
    WorkloadType.ONLINE_SERVICE: HelicynWorkloadType.ONLINE_SERVICE,
    WorkloadType.MAINTENANCE: HelicynWorkloadType.UNKNOWN,
}


def _to_helicyn_workload_type(workload_type: WorkloadType) -> HelicynWorkloadType:
    return _WORKLOAD_TYPE_TO_HELICYN[workload_type]

# Phase 2 only implements these action types. MIGRATE exists in the shared
# ActionType enum (mirrored from helicyn_ml) but is out of scope here.
SUPPORTED_ACTION_TYPES = {
    ActionType.PLACE,
    ActionType.DELAY,
    ActionType.CHANGE_DVFS,
    ActionType.SLEEP_SERVER,
    ActionType.WAKE_SERVER,
    ActionType.REJECT,
}

SAFE_FALLBACK_REASON = "external recommendation not directly actionable; used validated safe fallback"


class ExternalHelicynUnavailableError(RuntimeError):
    """The helicyn-ml /recommend server could not be reached or returned an
    unusable response. Callers decide what "unavailable" means for them: a
    single `run` should exit cleanly with this message; a `before-after`
    batch should skip external_helicyn and continue the built-in policies.
    """


class ExternalHelicynPolicy(Policy):
    name = "external_helicyn"

    def __init__(self, url: str = DEFAULT_HELICYN_URL, timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS):
        self.url = url
        self.timeout_seconds = timeout_seconds

    def health_url(self) -> str:
        if self.url.endswith("/recommend"):
            return self.url[: -len("/recommend")] + "/health"
        return self.url

    def check_available(self) -> None:
        """Fast pre-flight check, meant to be called once before a run so
        callers can fail (or skip) before spending time simulating.
        """
        try:
            response = requests.get(self.health_url(), timeout=self.timeout_seconds)
            response.raise_for_status()
        except requests.RequestException as exc:
            raise ExternalHelicynUnavailableError(
                f"Helicyn ML server unavailable at {self.url} ({self.health_url()} health check failed): {exc}"
            ) from exc

    def place_jobs(self, state: SimState) -> list[PolicyDecision]:
        fleet_state = build_fleet_state(state)
        try:
            response = requests.post(
                self.url, json=fleet_state.model_dump(mode="json"), timeout=self.timeout_seconds
            )
            response.raise_for_status()
            recommendation = Recommendation.model_validate(response.json())
        except (requests.RequestException, ValueError) as exc:
            raise ExternalHelicynUnavailableError(f"Helicyn ML /recommend call failed at {self.url}: {exc}") from exc

        decisions: list[PolicyDecision] = []
        successfully_handled: set[str] = set()

        for action in recommendation.selected_actions:
            accepted, decision = _validate_and_apply(state, action)
            decisions.append(decision)
            if accepted and action.job_id:
                successfully_handled.add(action.job_id)

        original_queue = list(state.job_queue)
        still_queued: list[str] = []
        server_order = default_server_order(state)

        for job_id in original_queue:
            job = state.all_jobs[job_id]
            if job_id in successfully_handled:
                if not job.completed and not job.rejected and job_id not in state.running_job_ids:
                    still_queued.append(job_id)  # was validly delayed
                continue

            # No usable recommendation for this job: safe fallback.
            target = attempt_place(state, job, server_order)
            if target is not None:
                decisions.append(
                    PolicyDecision(
                        job_id=job_id,
                        action="place",
                        target_site_id=target.site_id,
                        target_rack_id=target.rack_id,
                        target_server_id=target.server_id,
                        reason=SAFE_FALLBACK_REASON,
                    )
                )
            else:
                decision = handle_unplaced(state, job, reason=SAFE_FALLBACK_REASON)
                if decision.action == "queue":
                    still_queued.append(job_id)
                decisions.append(decision)

        state.job_queue = still_queued
        return decisions


def _validate_and_apply(state: SimState, action: CandidateAction) -> tuple[bool, PolicyDecision]:
    """Validate one recommended action against the simulator's actual
    state. Returns (accepted, decision). Rejected actions get
    action="rejected_external_action" with `reason` set to the exact
    validation failure, per docs/phase2_external_helicyn.md.
    """

    def rejected(reason: str) -> tuple[bool, PolicyDecision]:
        return False, PolicyDecision(job_id=action.job_id or "", action="rejected_external_action", reason=reason)

    if action.action_type not in SUPPORTED_ACTION_TYPES:
        return rejected(f"unsupported_action_type:{action.action_type.value}")

    if action.action_type in (ActionType.PLACE, ActionType.DELAY, ActionType.REJECT):
        job = state.all_jobs.get(action.job_id) if action.job_id else None
        if job is None:
            return rejected("unknown_job_id")
        if job.completed or job.rejected or job.job_id in state.running_job_ids:
            return rejected("cannot_assign_completed_rejected_or_running_job")
        if job.job_id not in state.job_queue:
            return rejected("job_not_currently_queued")

        if action.action_type == ActionType.PLACE:
            if job.gpu_demand_units and job.gpu_demand_units > 0:
                return rejected("gpu_based_optimization_not_supported_no_gpu_labels")

            reason = "external_recommendation_validated_and_applied"
            server = state.servers.get(action.target_server_id) if action.target_server_id else None

            if server is None:
                # helicyn-ml's real HelicynPolicy currently recommends a
                # site (not a specific server) for `place` actions -- it
                # has no server-level bin-packing model. Conservative
                # adapter behavior: honor the recommended site/rack by
                # picking the first server there with capacity, in this
                # simulator's own fixed order, rather than rejecting a
                # recommendation that is directionally valid but
                # under-specified for this simulator's finer-grained model.
                if action.target_rack_id and action.target_rack_id in state.racks:
                    candidates = state.servers_in_rack(action.target_rack_id)
                    reason = "external_recommendation_rack_level_only_used_first_fit_within_recommended_rack"
                elif action.target_site_id and action.target_site_id in state.sites:
                    candidates = [
                        s
                        for rid in state.sites[action.target_site_id].rack_ids
                        for s in state.servers_in_rack(rid)
                    ]
                    reason = "external_recommendation_site_level_only_used_first_fit_within_recommended_site"
                else:
                    return rejected("target_server_does_not_exist")

                server = next(
                    (s for s in candidates if s.can_fit(job.cpu_demand_units, job.memory_demand_gb)), None
                )
                if server is None:
                    return rejected("recommended_site_or_rack_has_no_capacity")
            else:
                if action.target_rack_id and action.target_rack_id != server.rack_id:
                    return rejected("target_rack_does_not_match_target_server")
                if action.target_site_id and action.target_site_id != server.site_id:
                    return rejected("target_site_does_not_match_target_server")
                if not server.can_fit(job.cpu_demand_units, job.memory_demand_gb):
                    return rejected("exceeds_cpu_or_memory_capacity")

            server.allocate(job.cpu_demand_units, job.memory_demand_gb, job.job_id)
            job.site_id = server.site_id
            job.rack_id = server.rack_id
            job.server_id = server.server_id
            job.start_time = state.step
            state.running_job_ids.add(job.job_id)
            return True, PolicyDecision(
                job_id=job.job_id,
                action="place",
                target_site_id=server.site_id,
                target_rack_id=server.rack_id,
                target_server_id=server.server_id,
                reason=reason,
            )

        if action.action_type == ActionType.DELAY:
            if job.latency_sensitive:
                return rejected("cannot_delay_non_delayable_latency_sensitive_job")
            return True, PolicyDecision(job_id=job.job_id, action="delay", reason="external_recommended_delay_validated")

        # REJECT
        job.rejected = True
        if job.deadline_time is not None and state.step > job.deadline_time:
            job.deadline_missed = True
        state.rejected_job_ids.add(job.job_id)
        return True, PolicyDecision(job_id=job.job_id, action="reject", reason="external_recommended_reject_validated")

    if action.action_type == ActionType.CHANGE_DVFS:
        server = state.servers.get(action.target_server_id) if action.target_server_id else None
        if server is None:
            return rejected("target_server_does_not_exist")
        if action.dvfs_state not in DVFS_STATES:
            return rejected("unknown_dvfs_state")
        server.dvfs_state = action.dvfs_state
        return True, PolicyDecision(
            job_id=action.job_id or "",
            action="change_dvfs",
            target_site_id=server.site_id,
            target_rack_id=server.rack_id,
            target_server_id=server.server_id,
            reason="external_recommendation_validated_and_applied",
        )

    if action.action_type == ActionType.SLEEP_SERVER:
        server = state.servers.get(action.target_server_id) if action.target_server_id else None
        if server is None:
            return rejected("target_server_does_not_exist")
        if server.running_job_ids:
            return rejected("cannot_sleep_server_with_running_jobs")
        server.asleep = True
        return True, PolicyDecision(
            job_id=action.job_id or "",
            action="sleep_server",
            target_site_id=server.site_id,
            target_rack_id=server.rack_id,
            target_server_id=server.server_id,
            reason="external_recommendation_validated_and_applied",
        )

    if action.action_type == ActionType.WAKE_SERVER:
        server = state.servers.get(action.target_server_id) if action.target_server_id else None
        if server is None:
            return rejected("target_server_does_not_exist")
        server.asleep = False
        return True, PolicyDecision(
            job_id=action.job_id or "",
            action="wake_server",
            target_site_id=server.site_id,
            target_rack_id=server.rack_id,
            target_server_id=server.server_id,
            reason="external_recommendation_validated_and_applied",
        )

    return rejected(f"unsupported_action_type:{action.action_type}")  # pragma: no cover - defensive


def build_fleet_state(state: SimState) -> FleetState:
    dt_minutes = state.config.simulation.timestep_minutes
    timestamp = step_timestamp(state.step, dt_minutes)

    sites = [
        FleetSite(site_id=site.site_id, region=site.region, rack_ids=list(site.rack_ids), migratable=True)
        for site in state.sites.values()
    ]
    racks = [
        FleetRack(
            rack_id=rack.rack_id,
            site_id=rack.site_id,
            server_ids=list(rack.server_ids),
            ambient_temp_c=state.current_site_signals.get(rack.site_id, {}).get("ambient_temp_c"),
            thermal_headroom_c=None,
        )
        for rack in state.racks.values()
    ]
    servers = [
        FleetServer(
            server_id=server.server_id,
            rack_id=server.rack_id,
            cpu_capacity=server.cpu_capacity_units,
            cpu_used=server.cpu_allocated_units,
            memory_capacity_gb=server.memory_capacity_gb,
            memory_used_gb=server.memory_allocated_gb,
            gpu_capacity=server.gpu_capacity_units,
            gpu_used=server.gpu_allocated_units,
            gpu_memory_capacity_gb=0,
            gpu_memory_used_gb=0,
            dvfs_state=server.dvfs_state,
            asleep=server.asleep,
            running_job_ids=list(server.running_job_ids),
        )
        for server in state.servers.values()
    ]

    queued_jobs = []
    for job_id in state.job_queue:
        job = state.all_jobs[job_id]
        queued_jobs.append(
            QueuedJob(
                job_id=job.job_id,
                workload_type=_to_helicyn_workload_type(job.workload_type),
                arrival_time=step_timestamp(job.arrival_time, dt_minutes),
                cpu_request=job.cpu_demand_units,
                memory_request_gb=job.memory_demand_gb,
                gpu_request=job.gpu_demand_units,
                priority=None,
                preemptible=job.preemptible,
                latency_sensitive=job.latency_sensitive,
                delayable=not job.latency_sensitive,
                max_delay_minutes=job.max_delay_minutes,
                migratable=job.migratable,
                site_affinity=None,
                deadline=step_timestamp(job.deadline_time, dt_minutes) if job.deadline_time is not None else None,
            )
        )

    running_jobs = []
    for job_id in state.running_job_ids:
        job = state.all_jobs[job_id]
        running_jobs.append(
            RunningJob(
                job_id=job.job_id,
                server_id=job.server_id,
                workload_type=_to_helicyn_workload_type(job.workload_type),
                start_time=step_timestamp(job.start_time, dt_minutes) if job.start_time is not None else timestamp,
                expected_end_time=timestamp + timedelta(minutes=max(0.0, job.remaining_work_units)),
                cpu_usage=job.cpu_demand_units,
                memory_usage_gb=job.memory_demand_gb,
                gpu_usage=job.gpu_demand_units,
                migratable=job.migratable,
            )
        )

    grid_signals = []
    weather_signals = []
    for site in state.sites.values():
        signal = state.current_site_signals.get(site.site_id, {})
        grid_signals.append(
            GridSignal(
                region=site.region,
                timestamp=timestamp,
                carbon_intensity_gco2e_per_kwh=signal.get("carbon_intensity_gco2e_per_kwh"),
                electricity_price_usd_per_mwh=signal.get("electricity_price_usd_per_mwh"),
                grid_load_mw=None,
                forecast_carbon_intensity_1h=None,
                forecast_price_1h=None,
            )
        )
        weather_signals.append(
            WeatherSignal(
                region=site.region,
                timestamp=timestamp,
                ambient_temp_c=signal.get("ambient_temp_c", 20.0),
                relative_humidity=None,
                wet_bulb_temp_c=None,
            )
        )

    return FleetState(
        timestamp=timestamp,
        sites=sites,
        racks=racks,
        servers=servers,
        queued_jobs=queued_jobs,
        running_jobs=running_jobs,
        grid_signals=grid_signals,
        weather_signals=weather_signals,
        current_power_metrics=None,
        current_thermal_metrics=None,
    )

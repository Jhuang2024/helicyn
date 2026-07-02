"""IntegratedCoordinationPolicy ("integrated coordination policy", a
simulator-native Helicyn-style policy / coordination-layer heuristic).

This is the simulator's own explicit, hand-written stand-in for the
Helicyn thesis -- coordinate consolidation, thermal awareness, carbon
awareness, price awareness, DVFS, and SLA/deadline protection in one
scoring function, instead of running five separate single-objective
heuristics. It is:

- NOT the same thing as `external_helicyn` (`policies/external_helicyn.py`),
  which calls a real trained/fallback `helicyn-ml` HTTP service and
  validates whatever comes back.
- NOT trained ML of any kind. It is an explicit, deterministic,
  inspectable scoring function with hand-set weights -- a coordination-layer
  heuristic, exactly like `consolidation`/`thermal_aware`/etc., just scoring
  every objective together instead of one at a time.
- NOT a production Helicyn controller, a validated AI optimizer, or a
  real-world controller of any kind. See docs/limitations.md.

Candidate placements are scored (lower is better) as:

    score = w_sla * sla_risk
          + w_power * incremental_power_kw
          + w_carbon * normalized_carbon_intensity
          + w_price * normalized_price
          + w_thermal * thermal_risk
          + w_fragmentation * fragmentation
          + w_delay * delay_penalty
          - w_utilization * useful_utilization
          - w_consolidation * consolidation_benefit

See docs/experimental_methodology.md for exactly how each term is computed
and why these weights, not others.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

from helicyn_sim.models import thermal as thermal_model
from helicyn_sim.models.dvfs import get_dvfs_state
from helicyn_sim.models.grid import forecast_carbon_intensity_gco2e_per_kwh, forecast_electricity_price_usd_per_mwh
from helicyn_sim.models.power import MEMORY_POWER_COEFFICIENT_W, fan_factor
from helicyn_sim.models.server import Server
from helicyn_sim.policies._util import default_server_order, handle_unplaced, remaining_slack_steps
from helicyn_sim.policies.base import Policy, PolicyDecision
from helicyn_sim.schemas.workload import Job
from helicyn_sim.simulation.clock import hour_of_day as step_hour_of_day
from helicyn_sim.simulation.state import SimState

DEFAULT_WEIGHTS = dict(
    w_sla=100.0,
    w_power=2.0,
    w_carbon=6.0,
    w_price=4.0,
    w_thermal=12.0,
    w_fragmentation=2.0,
    w_delay=8.0,
    w_utilization=2.0,
    w_consolidation=3.0,
)

# Reference scales used only to squash raw carbon (gCO2e/kWh) and price
# ($/MWh) onto a roughly-[0, 2] range so they're comparable in magnitude to
# the other (already ~[0, 1]-ish) terms. Not a claim about "typical" grid
# values -- see docs/model_assumptions.md.
CARBON_REFERENCE_GCO2E_PER_KWH = 300.0
PRICE_REFERENCE_USD_PER_MWH = 150.0

MIN_SLACK_STEPS_FOR_POWER_SAVER = 6
DELAY_IMPROVEMENT_THRESHOLD = 0.10
CANDIDATE_POOL_SIZE = 8


@dataclass
class _ScoredCandidate:
    server: Server
    total_score: float
    breakdown: dict = field(default_factory=dict)
    category: str = ""


def _normalized_carbon(value: float) -> float:
    return max(0.0, value / CARBON_REFERENCE_GCO2E_PER_KWH)


def _normalized_price(value: float) -> float:
    return max(0.0, value / PRICE_REFERENCE_USD_PER_MWH)


def _thermal_risk(rack_temp_c: float) -> float:
    """0 below `warm` (27C), ramps 0->1 between warm and hot (32C), 1->2.5
    between hot and critical (38C), and keeps climbing past critical.
    """
    if rack_temp_c <= thermal_model.WARM_THRESHOLD_C:
        return 0.0
    if rack_temp_c <= thermal_model.HOT_THRESHOLD_C:
        span = thermal_model.HOT_THRESHOLD_C - thermal_model.WARM_THRESHOLD_C
        return (rack_temp_c - thermal_model.WARM_THRESHOLD_C) / span
    if rack_temp_c <= thermal_model.CRITICAL_THRESHOLD_C:
        span = thermal_model.CRITICAL_THRESHOLD_C - thermal_model.HOT_THRESHOLD_C
        return 1.0 + 1.5 * (rack_temp_c - thermal_model.HOT_THRESHOLD_C) / span
    return 2.5 + 0.2 * (rack_temp_c - thermal_model.CRITICAL_THRESHOLD_C)


def _server_power_w(
    server: Server, rack_temp_c: float, cpu_units: float, memory_gb: float, force_awake: bool = False
) -> float:
    """Same shape as models/power.py's server_power_w, but takes explicit
    hypothetical allocation instead of reading server.cpu_allocated_units,
    so candidate scoring can ask "what would power look like after
    placing this job" without mutating state. `force_awake` computes the
    power as if the server were awake even if `server.asleep` is currently
    True -- used for the "after placement" side of a fallback candidate
    that scoring is considering waking up.
    """
    if server.asleep and not force_awake:
        return server.sleep_power_w
    cpu_utilization = min(1.0, max(0.0, cpu_units / server.cpu_capacity_units)) if server.cpu_capacity_units else 0.0
    memory_utilization = (
        min(1.0, max(0.0, memory_gb / server.memory_capacity_gb)) if server.memory_capacity_gb else 0.0
    )
    dvfs = get_dvfs_state(server.dvfs_state)
    cpu_dynamic = server.max_cpu_dynamic_power_w * (cpu_utilization**1.4) * dvfs.power_multiplier
    memory_dynamic = MEMORY_POWER_COEFFICIENT_W * memory_utilization
    fan = fan_factor(rack_temp_c)
    return server.idle_power_w + cpu_dynamic + memory_dynamic + server.fan_overhead_w * fan


def _score_candidate(job: Job, server: Server, state: SimState, weights: dict, sla_risk: float) -> _ScoredCandidate:
    rack_temp_c = state.racks[server.rack_id].rack_temp_c
    signal = state.current_site_signals.get(server.site_id, {})

    power_before = _server_power_w(server, rack_temp_c, server.cpu_allocated_units, server.memory_allocated_gb)
    power_after = _server_power_w(
        server, rack_temp_c, server.cpu_allocated_units + job.cpu_demand_units,
        server.memory_allocated_gb + job.memory_demand_gb, force_awake=True,
    )
    incremental_power_kw = max(0.0, power_after - power_before) / 1000.0

    normalized_carbon = _normalized_carbon(signal.get("carbon_intensity_gco2e_per_kwh", 0.0))
    normalized_price = _normalized_price(signal.get("electricity_price_usd_per_mwh", 0.0))
    thermal_risk = _thermal_risk(rack_temp_c)

    cpu_util_after = min(1.0, (server.cpu_allocated_units + job.cpu_demand_units) / server.cpu_capacity_units)
    mem_util_after = min(1.0, (server.memory_allocated_gb + job.memory_demand_gb) / server.memory_capacity_gb)
    fragmentation = abs(cpu_util_after - mem_util_after)
    useful_utilization = (cpu_util_after + mem_util_after) / 2.0
    consolidation_benefit = 1.0 if server.running_job_ids else 0.0

    breakdown = {
        "sla_term": weights["w_sla"] * sla_risk,
        "power_term": weights["w_power"] * incremental_power_kw,
        "carbon_term": weights["w_carbon"] * normalized_carbon,
        "price_term": weights["w_price"] * normalized_price,
        "thermal_term": weights["w_thermal"] * thermal_risk,
        "fragmentation_term": weights["w_fragmentation"] * fragmentation,
        "delay_term": 0.0,  # this is a placement candidate, not a delay
        "utilization_term": -weights["w_utilization"] * useful_utilization,
        "consolidation_term": -weights["w_consolidation"] * consolidation_benefit,
    }
    total = sum(breakdown.values())

    if consolidation_benefit and thermal_risk < 1.0:
        category = "active_server_low_thermal_risk"
    elif consolidation_benefit:
        category = "active_server_despite_thermal_risk"
    elif server.asleep:
        category = "newly_woken_server"
    else:
        category = "idle_awake_server"

    return _ScoredCandidate(server=server, total_score=total, breakdown=breakdown, category=category)


def _take_candidates(servers: list[Server], job: Job, limit: int, allow_asleep: bool = False) -> list[Server]:
    """Scan `servers` (already priority-ordered) for up to `limit` that can
    actually fit `job`, skipping over ones that are already full. Static
    slicing (`servers[:limit]`) would keep re-offering the same leading
    servers even after they fill up within a single step, starving every
    later job in the queue of the other, still-idle servers further down
    the list -- this scans past exhausted ones instead.

    `Server.can_fit` always returns False for a sleeping server regardless
    of its capacity (see models/server.py), so a fallback scan that needs
    to consider waking a sleeping server must check its raw capacity
    directly (`allow_asleep=True`) rather than `can_fit`, or every sleeping
    server would look "full" and never be offered as a fallback.
    """
    candidates = []
    for server in servers:
        if server.asleep and allow_asleep:
            fits = job.cpu_demand_units <= server.cpu_capacity_units and job.memory_demand_gb <= server.memory_capacity_gb
        else:
            fits = server.can_fit(job.cpu_demand_units, job.memory_demand_gb)
        if fits:
            candidates.append(server)
            if len(candidates) >= limit:
                break
    return candidates


def _explain(chosen: _ScoredCandidate, runner_up: Optional[_ScoredCandidate]) -> str:
    b = chosen.breakdown
    dominant_penalty = max(
        (k for k in ("power_term", "carbon_term", "price_term", "thermal_term", "fragmentation_term")),
        key=lambda k: b[k],
    )
    dominant_reward = min(("utilization_term", "consolidation_term"), key=lambda k: b[k])

    if chosen.category in ("active_server_low_thermal_risk", "active_server_despite_thermal_risk"):
        base = "placed on active server because consolidation benefit outweighed thermal risk"
    elif chosen.category == "newly_woken_server":
        base = "woke a sleeping server because no active or idle-awake server was safe/available"
    else:
        base = f"placed on idle-awake server (dominant cost: {dominant_penalty}, dominant reward: {dominant_reward})"

    detail = (
        f"score={chosen.total_score:.3f} "
        f"[sla={b['sla_term']:.2f} power={b['power_term']:.2f} carbon={b['carbon_term']:.2f} "
        f"price={b['price_term']:.2f} thermal={b['thermal_term']:.2f} frag={b['fragmentation_term']:.2f} "
        f"util={b['utilization_term']:.2f} consolidation={b['consolidation_term']:.2f}]"
    )
    if runner_up is not None:
        detail += f"; runner_up_score={runner_up.total_score:.3f}"
    return f"{base}; {detail}"


class IntegratedCoordinationPolicy(Policy):
    """Simulator-native Helicyn-style policy: an explicit, weighted,
    multi-objective coordination-layer heuristic. See module docstring.
    """

    name = "integrated_coordination"

    def __init__(self, weights: Optional[dict] = None):
        self.weights = dict(DEFAULT_WEIGHTS)
        if weights:
            self.weights.update(weights)

    def place_jobs(self, state: SimState) -> list[PolicyDecision]:
        decisions: list[PolicyDecision] = []
        still_queued: list[str] = []
        dt_minutes = state.config.simulation.timestep_minutes

        all_servers = default_server_order(state)
        cool_servers = [
            s for s in all_servers if not s.asleep and state.racks[s.rack_id].rack_temp_c < thermal_model.HOT_THRESHOLD_C
        ]
        hot_awake_servers = [
            s
            for s in all_servers
            if not s.asleep and state.racks[s.rack_id].rack_temp_c >= thermal_model.HOT_THRESHOLD_C
        ]
        asleep_servers = [s for s in all_servers if s.asleep]

        cool_active = sorted((s for s in cool_servers if s.running_job_ids), key=lambda s: -s.cpu_utilization())
        cool_idle = [s for s in cool_servers if not s.running_job_ids]
        fallback_servers = hot_awake_servers + asleep_servers

        for job_id in state.job_queue:
            job = state.all_jobs[job_id]
            sla_risk = 1.0 if job.latency_sensitive else (0.3 if remaining_slack_steps(job, state) < 6 else 0.0)

            should_delay, delay_reason = self._should_delay(job, state, dt_minutes)
            if should_delay:
                still_queued.append(job_id)
                decisions.append(
                    PolicyDecision(job_id=job.job_id, action="delay", reason=delay_reason)
                )
                continue

            candidates = _take_candidates(
                cool_active, job, CANDIDATE_POOL_SIZE
            ) + _take_candidates(cool_idle, job, CANDIDATE_POOL_SIZE)
            used_fallback = False
            if not candidates:
                used_fallback = True
                candidates = _take_candidates(fallback_servers, job, CANDIDATE_POOL_SIZE * 2, allow_asleep=True)

            if not candidates:
                decision = handle_unplaced(state, job, reason="no_safe_or_fallback_capacity_available")
                if decision.action == "queue":
                    still_queued.append(job_id)
                decisions.append(decision)
                continue

            scored = sorted(
                (_score_candidate(job, s, state, self.weights, sla_risk) for s in candidates),
                key=lambda c: c.total_score,
            )
            chosen = scored[0]
            runner_up = scored[1] if len(scored) > 1 else None
            server = chosen.server

            was_asleep = server.asleep
            server.asleep = False
            freshly_active = not server.running_job_ids
            server.allocate(job.cpu_demand_units, job.memory_demand_gb, job.job_id)
            job.site_id = server.site_id
            job.rack_id = server.rack_id
            job.server_id = server.server_id
            job.start_time = state.step
            state.running_job_ids.add(job.job_id)

            if was_asleep:
                decisions.append(
                    PolicyDecision(
                        job_id=job.job_id,
                        action="wake_server",
                        target_site_id=server.site_id,
                        target_rack_id=server.rack_id,
                        target_server_id=server.server_id,
                        reason="coordination_woke_server_no_safer_capacity_available",
                    )
                )

            desired_dvfs = self._desired_dvfs(job, state, freshly_active)
            before_dvfs = server.dvfs_state
            if desired_dvfs == "high_performance":
                server.dvfs_state = "high_performance"
            elif desired_dvfs == "power_saver" and freshly_active:
                server.dvfs_state = "power_saver"
            elif desired_dvfs == "balanced" and freshly_active and server.dvfs_state == "power_saver":
                server.dvfs_state = "balanced"
            if server.dvfs_state != before_dvfs:
                dvfs_reason = (
                    "used high_performance DVFS because deadline slack was low"
                    if server.dvfs_state == "high_performance"
                    else "used power_saver DVFS because job is flexible and slack is sufficient"
                )
                decisions.append(
                    PolicyDecision(
                        job_id=job.job_id,
                        action="change_dvfs",
                        target_site_id=server.site_id,
                        target_rack_id=server.rack_id,
                        target_server_id=server.server_id,
                        reason=dvfs_reason,
                    )
                )

            reason = _explain(chosen, runner_up)
            if used_fallback:
                reason = "avoided rack because predicted thermal risk exceeded threshold; " + reason
            decisions.append(
                PolicyDecision(
                    job_id=job.job_id,
                    action="place",
                    target_site_id=server.site_id,
                    target_rack_id=server.rack_id,
                    target_server_id=server.server_id,
                    reason=reason,
                )
            )

        state.job_queue = still_queued

        # Idle-awake servers left untouched this step go back to sleep,
        # same policy as ConsolidationPolicy (the "consolidation" side of
        # coordination), so a server the scoring function didn't need stays
        # cheap rather than idling at idle_power_w.
        for server in cool_idle:
            if not server.running_job_ids and not server.asleep:
                server.asleep = True
                decisions.append(
                    PolicyDecision(
                        job_id="",
                        action="sleep_server",
                        target_site_id=server.site_id,
                        target_rack_id=server.rack_id,
                        target_server_id=server.server_id,
                        reason="coordination_idle_server_sleep",
                    )
                )

        return decisions

    def _should_delay(self, job: Job, state: SimState, dt_minutes: float) -> tuple[bool, str]:
        if job.latency_sensitive:
            return False, ""
        if not (job.carbon_flexible or job.price_flexible):
            return False, ""

        work_steps_needed = max(1, math.ceil(job.remaining_work_units / dt_minutes))
        slack = remaining_slack_steps(job, state)
        if slack <= work_steps_needed:
            return False, ""

        w_carbon, w_price = self.weights["w_carbon"], self.weights["w_price"]

        def combined_signal(carbon: float, price: float) -> float:
            terms = []
            if job.carbon_flexible:
                terms.append(w_carbon * _normalized_carbon(carbon))
            if job.price_flexible:
                terms.append(w_price * _normalized_price(price))
            return sum(terms)

        def _site_servers(site):
            return [s for rid in site.rack_ids for s in state.servers_in_rack(rid)]

        sites_with_capacity = [
            site
            for site in state.sites.values()
            if any(s.can_fit(job.cpu_demand_units, job.memory_demand_gb) for s in _site_servers(site))
        ]
        if not sites_with_capacity:
            return False, ""

        current_best = min(
            combined_signal(
                state.current_site_signals.get(site.site_id, {}).get("carbon_intensity_gco2e_per_kwh", 0.0),
                state.current_site_signals.get(site.site_id, {}).get("electricity_price_usd_per_mwh", 0.0),
            )
            for site in sites_with_capacity
        )

        max_delay_steps = int(job.max_delay_minutes / dt_minutes) if job.max_delay_minutes is not None else slack
        horizon_steps = max(1, min(slack - work_steps_needed, max_delay_steps))
        sample_stride = max(1, horizon_steps // 6)

        best_forecast = None
        for future_step in range(state.step + 1, state.step + horizon_steps + 1, sample_stride):
            future_hour = step_hour_of_day(future_step, dt_minutes)
            for site in state.sites.values():
                forecast_carbon = forecast_carbon_intensity_gco2e_per_kwh(site.carbon_profile, future_hour)
                forecast_price = forecast_electricity_price_usd_per_mwh(site.price_profile, future_hour)
                value = combined_signal(forecast_carbon, forecast_price)
                if best_forecast is None or value < best_forecast:
                    best_forecast = value

        if best_forecast is not None and best_forecast <= current_best * (1.0 - DELAY_IMPROVEMENT_THRESHOLD):
            return True, "delayed flexible job because carbon/price intensity drops within deadline window"
        return False, ""

    @staticmethod
    def _desired_dvfs(job: Job, state: SimState, freshly_active: bool) -> str:
        if job.latency_sensitive or remaining_slack_steps(job, state) < MIN_SLACK_STEPS_FOR_POWER_SAVER:
            return "high_performance" if job.latency_sensitive else "balanced"
        if (job.carbon_flexible or job.price_flexible) and remaining_slack_steps(
            job, state
        ) >= MIN_SLACK_STEPS_FOR_POWER_SAVER:
            return "power_saver"
        return "balanced"

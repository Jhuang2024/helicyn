"""ThermalAwarePolicy: prefer racks with the most thermal headroom (lowest
current `rack_temp_c`) and actively avoid racks at/above the hot threshold
when a cooler rack has capacity. No carbon/price optimization. Spreading
load across more, cooler racks to avoid hotspots means this policy may end
up using more distinct servers than a consolidation-style policy would --
that's the intended tradeoff (thermal headroom over server-count).
"""
from __future__ import annotations

from helicyn_sim.models.thermal import HOT_THRESHOLD_C
from helicyn_sim.policies._util import attempt_place, handle_unplaced
from helicyn_sim.policies.base import Policy, PolicyDecision
from helicyn_sim.simulation.state import SimState


class ThermalAwarePolicy(Policy):
    name = "thermal_aware"

    def place_jobs(self, state: SimState) -> list[PolicyDecision]:
        decisions: list[PolicyDecision] = []
        still_queued: list[str] = []

        racks = list(state.racks.values())
        cool_racks = sorted((r for r in racks if r.rack_temp_c < HOT_THRESHOLD_C), key=lambda r: r.rack_temp_c)
        hot_racks = sorted((r for r in racks if r.rack_temp_c >= HOT_THRESHOLD_C), key=lambda r: r.rack_temp_c)

        cool_servers = [s for rack in cool_racks for s in state.servers_in_rack(rack.rack_id)]
        hot_servers = [s for rack in hot_racks for s in state.servers_in_rack(rack.rack_id)]

        for job_id in state.job_queue:
            job = state.all_jobs[job_id]

            target = attempt_place(state, job, cool_servers)
            reason = "thermal_aware_placed_on_cooler_rack"

            if target is None and hot_servers:
                target = attempt_place(state, job, hot_servers)
                reason = "thermal_aware_no_cooler_rack_available_forced_placement"

            if target is not None:
                decisions.append(
                    PolicyDecision(
                        job_id=job.job_id,
                        action="place",
                        target_site_id=target.site_id,
                        target_rack_id=target.rack_id,
                        target_server_id=target.server_id,
                        reason=reason,
                    )
                )
                continue

            decision = handle_unplaced(state, job)
            if decision.action == "queue":
                still_queued.append(job_id)
            decisions.append(decision)

        state.job_queue = still_queued
        return decisions

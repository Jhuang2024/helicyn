"""ConsolidationPolicy: pack jobs onto already-active servers and let idle
servers sleep. No carbon/price awareness, no external ML. This deliberately
trades thermal spread for server-hours: packing more work onto fewer
servers can raise utilization (and therefore power/temperature) on those
servers even as it reduces the total count of active servers, so it may
increase thermal concentration relative to a policy that spreads load out
(see thermal_aware.py for the opposite tradeoff).
"""
from __future__ import annotations

from helicyn_sim.policies._util import attempt_place, default_server_order, handle_unplaced
from helicyn_sim.policies.base import Policy, PolicyDecision
from helicyn_sim.simulation.state import SimState


class ConsolidationPolicy(Policy):
    name = "consolidation"

    def place_jobs(self, state: SimState) -> list[PolicyDecision]:
        decisions: list[PolicyDecision] = []
        still_queued: list[str] = []

        all_servers = default_server_order(state)
        active_awake = sorted(
            (s for s in all_servers if not s.asleep and s.running_job_ids),
            key=lambda s: -s.cpu_utilization(),
        )
        idle_awake = [s for s in all_servers if not s.asleep and not s.running_job_ids]
        asleep_servers = [s for s in all_servers if s.asleep]

        for job_id in state.job_queue:
            job = state.all_jobs[job_id]

            target = attempt_place(state, job, active_awake)
            reason = "consolidation_packed_onto_active_server"

            if target is None:
                target = attempt_place(state, job, idle_awake)
                reason = "consolidation_used_idle_awake_server"

            if target is None:
                for server in asleep_servers:
                    server.asleep = False
                    if server.can_fit(job.cpu_demand_units, job.memory_demand_gb):
                        decisions.append(
                            PolicyDecision(
                                job_id=job.job_id,
                                action="wake_server",
                                target_site_id=server.site_id,
                                target_rack_id=server.rack_id,
                                target_server_id=server.server_id,
                                reason="consolidation_no_active_or_idle_capacity",
                            )
                        )
                        target = attempt_place(state, job, [server])
                        reason = "consolidation_placed_on_newly_woken_server"
                        break
                    server.asleep = True  # didn't fit even fully idle; put it back to sleep

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

        # Let any server that started this step idle and awake, and is
        # still idle after placement, go to sleep.
        for server in idle_awake:
            if not server.running_job_ids and not server.asleep:
                server.asleep = True
                decisions.append(
                    PolicyDecision(
                        job_id="",
                        action="sleep_server",
                        target_site_id=server.site_id,
                        target_rack_id=server.rack_id,
                        target_server_id=server.server_id,
                        reason="consolidation_idle_server_sleep",
                    )
                )

        return decisions

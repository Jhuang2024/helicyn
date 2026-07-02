"""The BEFORE-HELICYN baseline: fixed-order first-fit bin packing.

Deliberately dumb by design, so later Helicyn-style policies have a fair,
well-understood point of comparison:
- Fixed site -> rack -> server iteration order (insertion order from the
  fleet config), the same order every timestep.
- Places a job on the first server with enough free CPU and memory.
- No carbon awareness, no price awareness, no thermal awareness, no
  migration, no predictive placement, no DVFS tuning (every server stays at
  whatever `policy.dvfs_state` the config set at fleet-build time).
- If no server fits, the job stays queued until its deadline passes, at
  which point it is rejected and marked as a deadline miss.
"""
from __future__ import annotations

from helicyn_sim.policies.base import Policy, PolicyDecision
from helicyn_sim.simulation.state import SimState


class BaselineFirstFitPolicy(Policy):
    name = "baseline_first_fit"

    def place_jobs(self, state: SimState) -> list[PolicyDecision]:
        decisions: list[PolicyDecision] = []
        still_queued: list[str] = []

        for job_id in state.job_queue:
            job = state.all_jobs[job_id]
            placed = False

            for site in state.sites.values():
                if placed:
                    break
                for rack_id in site.rack_ids:
                    if placed:
                        break
                    for server in state.servers_in_rack(rack_id):
                        if server.can_fit(job.cpu_demand_units, job.memory_demand_gb):
                            server.allocate(job.cpu_demand_units, job.memory_demand_gb, job.job_id)
                            job.site_id = site.site_id
                            job.rack_id = rack_id
                            job.server_id = server.server_id
                            job.start_time = state.step
                            state.running_job_ids.add(job.job_id)
                            decisions.append(
                                PolicyDecision(
                                    job_id=job.job_id,
                                    action="place",
                                    target_site_id=site.site_id,
                                    target_rack_id=rack_id,
                                    target_server_id=server.server_id,
                                    reason="first_fit_capacity_available",
                                )
                            )
                            placed = True
                            break

            if placed:
                continue

            if job.deadline_time is not None and state.step > job.deadline_time:
                job.rejected = True
                job.deadline_missed = True
                state.rejected_job_ids.add(job.job_id)
                decisions.append(
                    PolicyDecision(
                        job_id=job.job_id,
                        action="reject",
                        reason="deadline_passed_no_capacity",
                    )
                )
            else:
                still_queued.append(job_id)
                decisions.append(
                    PolicyDecision(
                        job_id=job.job_id,
                        action="queue",
                        reason="no_capacity_available",
                    )
                )

        state.job_queue = still_queued
        return decisions

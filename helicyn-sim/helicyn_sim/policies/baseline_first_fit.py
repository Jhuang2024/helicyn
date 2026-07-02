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

from helicyn_sim.policies._util import attempt_place, default_server_order, handle_unplaced
from helicyn_sim.policies.base import Policy, PolicyDecision
from helicyn_sim.simulation.state import SimState


class BaselineFirstFitPolicy(Policy):
    name = "baseline_first_fit"

    def place_jobs(self, state: SimState) -> list[PolicyDecision]:
        decisions: list[PolicyDecision] = []
        still_queued: list[str] = []
        server_order = default_server_order(state)

        for job_id in state.job_queue:
            job = state.all_jobs[job_id]
            target = attempt_place(state, job, server_order)

            if target is not None:
                decisions.append(
                    PolicyDecision(
                        job_id=job.job_id,
                        action="place",
                        target_site_id=target.site_id,
                        target_rack_id=target.rack_id,
                        target_server_id=target.server_id,
                        reason="first_fit_capacity_available",
                    )
                )
                continue

            decision = handle_unplaced(state, job)
            if decision.action == "queue":
                still_queued.append(job_id)
            decisions.append(decision)

        state.job_queue = still_queued
        return decisions

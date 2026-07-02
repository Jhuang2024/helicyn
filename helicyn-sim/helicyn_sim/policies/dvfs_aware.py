"""DVFSAwarePolicy: first-fit placement identical to BaselineFirstFitPolicy,
but chooses each target server's DVFS state based on the job just placed
on it:

- latency-sensitive jobs always force the server to `high_performance`
  (never `power_saver`), even if that means upgrading a server another
  policy would have left in `balanced`/`power_saver`.
- carbon/price-flexible jobs with generous deadline slack (>= 6 steps,
  i.e. 30 minutes at the default 5-minute timestep) may drop a *freshly
  activated* (previously idle) server to `power_saver`.
- DVFS state is per-*server*, not per-job (see docs/model_assumptions.md),
  so this policy never downgrades a server that already has other jobs
  running on it -- only a server this job just activated.

Per docs/equations.md, DVFS only scales CPU dynamic power in this
simulator's power model; it does not change a job's progress rate, so
`power_saver` here is a genuine power reduction, not a
speed-for-power tradeoff, in Phase 2's model.
"""
from __future__ import annotations

from helicyn_sim.policies._util import attempt_place, default_server_order, handle_unplaced, remaining_slack_steps
from helicyn_sim.policies.base import Policy, PolicyDecision
from helicyn_sim.simulation.state import SimState

MIN_SLACK_STEPS_FOR_POWER_SAVER = 6


class DVFSAwarePolicy(Policy):
    name = "dvfs_aware"

    def place_jobs(self, state: SimState) -> list[PolicyDecision]:
        decisions: list[PolicyDecision] = []
        still_queued: list[str] = []
        server_order = default_server_order(state)

        for job_id in state.job_queue:
            job = state.all_jobs[job_id]
            target = attempt_place(state, job, server_order)

            if target is None:
                decision = handle_unplaced(state, job)
                if decision.action == "queue":
                    still_queued.append(job_id)
                decisions.append(decision)
                continue

            decisions.append(
                PolicyDecision(
                    job_id=job.job_id,
                    action="place",
                    target_site_id=target.site_id,
                    target_rack_id=target.rack_id,
                    target_server_id=target.server_id,
                    reason="dvfs_aware_first_fit",
                )
            )

            freshly_active = len(target.running_job_ids) == 1
            desired = self._desired_dvfs_state(job, state, freshly_active)
            before = target.dvfs_state
            if desired == "high_performance":
                target.dvfs_state = "high_performance"
            elif desired == "power_saver" and freshly_active:
                target.dvfs_state = "power_saver"
            elif desired == "balanced" and freshly_active and target.dvfs_state == "power_saver":
                target.dvfs_state = "balanced"

            if target.dvfs_state != before:
                decisions.append(
                    PolicyDecision(
                        job_id=job.job_id,
                        action="change_dvfs",
                        target_site_id=target.site_id,
                        target_rack_id=target.rack_id,
                        target_server_id=target.server_id,
                        reason=f"dvfs_aware_set_{target.dvfs_state}_for_job",
                    )
                )

        state.job_queue = still_queued
        return decisions

    @staticmethod
    def _desired_dvfs_state(job, state: SimState, freshly_active: bool) -> str:
        if job.latency_sensitive:
            return "high_performance"
        if (job.carbon_flexible or job.price_flexible) and remaining_slack_steps(job, state) >= (
            MIN_SLACK_STEPS_FOR_POWER_SAVER
        ):
            return "power_saver"
        return "balanced"

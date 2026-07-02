"""The discrete-time simulation loop. See README.md for the per-timestep
step list this function implements 1:1.

Site carbon/price/ambient signals are drawn once per site per step, before
the policy runs (step order below still matches the README's 12 steps --
this is just *when within a step* the otherwise-independent grid/weather
draw happens). This lets carbon-aware/price-aware/DVFS-aware/external
policies see this step's actual realized signal instead of only a
forecast, and guarantees the value a policy reasoned about is exactly the
value later billed in `run_summary`/`timeseries_metrics.csv` -- in the
original Phase 1 engine, ambient temperature was drawn twice per site per
step (once for rack thermal update, once for cooling), which was harmless
for outcomes but wasted a stateful rng draw; this also fixes that.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path

import numpy as np

from helicyn_sim.config import Config
from helicyn_sim.models import cooling as cooling_model
from helicyn_sim.models import grid as grid_model
from helicyn_sim.models import power as power_model
from helicyn_sim.models import thermal as thermal_model
from helicyn_sim.models import weather as weather_model
from helicyn_sim.policies.base import Policy
from helicyn_sim.simulation.accounting import SiteAccumulator
from helicyn_sim.simulation.clock import hour_of_day as step_hour_of_day
from helicyn_sim.simulation.clock import step_timestamp
from helicyn_sim.simulation.results import RunRecorder
from helicyn_sim.simulation.state import SimState, build_initial_state


def run_simulation(
    config: Config,
    policy: Policy,
    resource_trace_path: str | None = None,
) -> tuple[SimState, RunRecorder, dict[str, SiteAccumulator]]:
    state = build_initial_state(config, resource_trace_path=resource_trace_path)

    dt_minutes = config.simulation.timestep_minutes
    num_steps = int(round(config.simulation.duration_hours * 60.0 / dt_minutes))

    arrivals_by_step: dict[int, list[str]] = defaultdict(list)
    for job in state.all_jobs.values():
        arrivals_by_step[job.arrival_time].append(job.job_id)

    site_accumulators = {site_id: SiteAccumulator(site_id=site_id) for site_id in state.sites}
    site_rngs = {
        site_id: np.random.default_rng(config.simulation.seed + 1000 * (idx + 1))
        for idx, site_id in enumerate(state.sites)
    }

    recorder = RunRecorder(
        policy_name=policy.name,
        timestep_minutes=dt_minutes,
        duration_hours=config.simulation.duration_hours,
        seed=config.simulation.seed,
        resource_trace_used=resource_trace_path,
    )

    for step in range(num_steps):
        state.step = step
        timestamp = step_timestamp(step, dt_minutes).isoformat()
        hour_of_day = step_hour_of_day(step, dt_minutes)

        # Draw this step's realized carbon/price/ambient signal per site
        # up front (independent of jobs/servers) so both the policy and the
        # accounting below see/use the exact same values.
        state.current_site_signals = {}
        for site_id, site in state.sites.items():
            rng = site_rngs[site_id]
            state.current_site_signals[site_id] = {
                "carbon_intensity_gco2e_per_kwh": grid_model.carbon_intensity_gco2e_per_kwh(
                    site.carbon_profile, hour_of_day, rng
                ),
                "electricity_price_usd_per_mwh": grid_model.electricity_price_usd_per_mwh(
                    site.price_profile, hour_of_day, rng
                ),
                "ambient_temp_c": weather_model.ambient_temp_c(site.weather_profile, hour_of_day, rng),
            }

        # 1. Add newly arrived jobs to queue.
        state.job_queue.extend(arrivals_by_step.get(step, []))

        # 2 & 3. Ask policy for placement decisions; it places jobs in-place
        # when capacity exists and leaves the rest queued or rejected.
        decisions = policy.place_jobs(state)
        recorder.record_decisions(timestamp, decisions)
        newly_rejected = sum(1 for d in decisions if d.action == "reject")

        # 4 & 5. Progress running jobs; complete finished jobs.
        newly_completed = 0
        newly_deadline_missed_on_completion = 0
        for job_id in list(state.running_job_ids):
            job = state.all_jobs[job_id]
            job.remaining_work_units -= dt_minutes
            if job.remaining_work_units <= 0:
                server = state.servers[job.server_id]
                server.release(job.cpu_demand_units, job.memory_demand_gb, job.job_id)
                job.completed = True
                job.completion_time = step
                state.running_job_ids.discard(job_id)
                state.completed_job_ids.add(job_id)
                newly_completed += 1
                # 6. Count missed deadlines among jobs that just finished late.
                if job.deadline_time is not None and job.completion_time > job.deadline_time:
                    job.deadline_missed = True
                    newly_deadline_missed_on_completion += 1

        # 6 (cont.) Deadline misses from rejection are already flagged by the
        # policy (job.deadline_missed=True) when it rejects a queued job.
        newly_deadline_missed = newly_rejected + newly_deadline_missed_on_completion

        # 7 & 8. Server utilization is computed on demand by Server; server
        # power uses each server's *current* (pre-update) rack temperature.
        site_power: dict[str, dict] = {}

        for site_id, site in state.sites.items():
            ambient_temp_c = state.current_site_signals[site_id]["ambient_temp_c"]

            total_server_power_w = 0.0
            for rack_id in site.rack_ids:
                rack = state.racks[rack_id]
                rack_power_w = sum(
                    power_model.server_power_w(server, rack.rack_temp_c)
                    for server in state.servers_in_rack(rack_id)
                )
                total_server_power_w += rack_power_w

                # 9. Update rack temperatures based on the load just computed.
                rack.rack_temp_c = thermal_model.next_rack_temp_c(
                    rack_temp_c=rack.rack_temp_c,
                    rack_power_kw=rack_power_w / 1000.0,
                    ambient_temp_c=ambient_temp_c,
                    cooling_reference_temp_c=rack.cooling_reference_temp_c,
                    dt_minutes=dt_minutes,
                )

            # 10. Compute site PUE/cooling/facility power.
            cooling_result = cooling_model.compute_site_cooling(
                total_server_power_w=total_server_power_w,
                base_pue=site.base_pue,
                ambient_temp_c=ambient_temp_c,
                cooling_reference_temp_c=site.cooling_reference_temp_c,
                ambient_temp_coefficient=site.ambient_temp_coefficient,
            )
            site_power[site_id] = {
                "it_power_kw": cooling_result.it_power_kw,
                "facility_power_kw": cooling_result.facility_power_kw,
                "cooling_power_kw": cooling_result.cooling_power_kw,
                "dynamic_pue": cooling_result.dynamic_pue,
            }

        # 11 & 12. Compute energy/carbon/cost and log metrics for this step.
        recorder.record_timestep(
            state=state,
            timestamp=timestamp,
            site_power=site_power,
            site_signals=state.current_site_signals,
            site_accumulators=site_accumulators,
            newly_completed_this_step=newly_completed,
            newly_rejected_this_step=newly_rejected,
            newly_deadline_missed_this_step=newly_deadline_missed,
        )

    return state, recorder, site_accumulators


def run_and_write(
    config: Config,
    policy: Policy,
    out_dir: str | Path,
    resource_trace_path: str | None = None,
) -> dict:
    state, recorder, site_accumulators = run_simulation(config, policy, resource_trace_path=resource_trace_path)
    return recorder.write_outputs(state, site_accumulators, config, Path(out_dir))

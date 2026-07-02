"""Collects per-step metrics during the run and turns them into the four
output files described in README.md: run_summary.json,
timeseries_metrics.csv, job_results.csv, policy_decisions.csv.

Field-naming convention for the per-site timeseries rows: `queued_jobs` and
`running_jobs` are instantaneous snapshots (state *right now*);
`completed_jobs`, `rejected_jobs`, and `deadline_misses` are cumulative
counts to date. `queued_jobs`, `rejected_jobs`, and `deadline_misses` are
fleet-wide (a queued/rejected job has no site yet) and are repeated on every
site's row for that timestep; `running_jobs`/`completed_jobs` are scoped to
jobs placed at that site.
"""
from __future__ import annotations

import csv
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import yaml

from helicyn_sim.config import Config, write_resolved_config
from helicyn_sim.policies.base import PolicyDecision
from helicyn_sim.simulation.accounting import SiteAccumulator
from helicyn_sim.simulation.state import SimState

THERMAL_VIOLATION_THRESHOLD_C = 32.0
CRITICAL_THERMAL_VIOLATION_THRESHOLD_C = 38.0


@dataclass
class RunRecorder:
    policy_name: str
    timestep_minutes: float
    duration_hours: float
    seed: int
    resource_trace_used: str | None

    timeseries_rows: list[dict] = field(default_factory=list)
    decision_rows: list[dict] = field(default_factory=list)

    site_cumulative_completed: dict[str, int] = field(default_factory=dict)
    site_cumulative_thermal_violations: dict[str, int] = field(default_factory=dict)
    cumulative_rejected: int = 0
    cumulative_deadline_misses: int = 0

    all_rack_temp_samples: list[float] = field(default_factory=list)
    global_max_rack_temp_c: float = float("-inf")
    global_critical_thermal_violations: int = 0

    active_server_steps: int = 0
    sleeping_server_steps: int = 0
    cpu_util_step_means: list[float] = field(default_factory=list)
    mem_util_step_means: list[float] = field(default_factory=list)

    def record_decisions(self, timestamp: str, decisions: list[PolicyDecision]) -> None:
        for d in decisions:
            self.decision_rows.append(
                {
                    "timestamp": timestamp,
                    "policy_name": self.policy_name,
                    "job_id": d.job_id,
                    "action": d.action,
                    "target_site_id": d.target_site_id or "",
                    "target_rack_id": d.target_rack_id or "",
                    "target_server_id": d.target_server_id or "",
                    "reason": d.reason,
                }
            )

    def record_timestep(
        self,
        state: SimState,
        timestamp: str,
        site_power: dict[str, dict],
        site_signals: dict[str, dict],
        site_accumulators: dict[str, SiteAccumulator],
        newly_completed_this_step: int,
        newly_rejected_this_step: int,
        newly_deadline_missed_this_step: int,
    ) -> None:
        self.cumulative_rejected += newly_rejected_this_step
        self.cumulative_deadline_misses += newly_deadline_missed_this_step

        queued_jobs = len(state.job_queue)

        dt_hours = self.timestep_minutes / 60.0
        fleet_cpu_utils: list[float] = []
        fleet_mem_utils: list[float] = []

        for site_id, site in state.sites.items():
            servers = [s for rid in site.rack_ids for s in state.servers_in_rack(rid)]
            active = sum(1 for s in servers if not s.asleep)
            sleeping = sum(1 for s in servers if s.asleep)
            self.active_server_steps += active
            self.sleeping_server_steps += sleeping

            cpu_utils = [s.cpu_utilization() for s in servers]
            mem_utils = [s.memory_utilization() for s in servers]
            fleet_cpu_utils.extend(cpu_utils)
            fleet_mem_utils.extend(mem_utils)
            avg_cpu = float(np.mean(cpu_utils)) if cpu_utils else 0.0
            avg_mem = float(np.mean(mem_utils)) if mem_utils else 0.0

            rack_temps = [state.racks[rid].rack_temp_c for rid in site.rack_ids]
            self.all_rack_temp_samples.extend(rack_temps)
            site_max_temp = max(rack_temps) if rack_temps else float("nan")
            site_p95_temp = float(np.percentile(rack_temps, 95)) if rack_temps else float("nan")
            self.global_max_rack_temp_c = max(self.global_max_rack_temp_c, site_max_temp)

            step_violations = sum(1 for t in rack_temps if t > THERMAL_VIOLATION_THRESHOLD_C)
            step_critical = sum(1 for t in rack_temps if t > CRITICAL_THERMAL_VIOLATION_THRESHOLD_C)
            self.site_cumulative_thermal_violations[site_id] = (
                self.site_cumulative_thermal_violations.get(site_id, 0) + step_violations
            )
            self.global_critical_thermal_violations += step_critical

            site_running = sum(
                1 for jid in state.running_job_ids if state.all_jobs[jid].site_id == site_id
            )
            site_completed_this_step = sum(
                1
                for jid in state.completed_job_ids
                if state.all_jobs[jid].site_id == site_id
                and state.all_jobs[jid].completion_time == state.step
            )
            self.site_cumulative_completed[site_id] = (
                self.site_cumulative_completed.get(site_id, 0) + site_completed_this_step
            )

            acc = site_accumulators[site_id]
            power = site_power[site_id]
            signals = site_signals[site_id]

            acc.update(
                it_power_kw=power["it_power_kw"],
                facility_power_kw=power["facility_power_kw"],
                cooling_power_kw=power["cooling_power_kw"],
                carbon_intensity_gco2e_per_kwh=signals["carbon_intensity_gco2e_per_kwh"],
                electricity_price_usd_per_mwh=signals["electricity_price_usd_per_mwh"],
                dt_hours=dt_hours,
            )

            self.timeseries_rows.append(
                {
                    "timestamp": timestamp,
                    "site_id": site_id,
                    "policy_name": self.policy_name,
                    "it_power_kw": power["it_power_kw"],
                    "facility_power_kw": power["facility_power_kw"],
                    "cooling_power_kw": power["cooling_power_kw"],
                    "dynamic_pue": power["dynamic_pue"],
                    "cumulative_it_energy_kwh": acc.cumulative_it_energy_kwh,
                    "cumulative_facility_energy_kwh": acc.cumulative_facility_energy_kwh,
                    "cumulative_cooling_energy_kwh": acc.cumulative_cooling_energy_kwh,
                    "cumulative_carbon_kgco2e": acc.cumulative_carbon_kgco2e,
                    "cumulative_cost_usd": acc.cumulative_cost_usd,
                    "carbon_intensity_gco2e_per_kwh": signals["carbon_intensity_gco2e_per_kwh"],
                    "electricity_price_usd_per_mwh": signals["electricity_price_usd_per_mwh"],
                    "ambient_temp_c": signals["ambient_temp_c"],
                    "average_cpu_utilization": avg_cpu,
                    "average_memory_utilization": avg_mem,
                    "active_servers": active,
                    "sleeping_servers": sleeping,
                    "queued_jobs": queued_jobs,
                    "running_jobs": site_running,
                    "completed_jobs": self.site_cumulative_completed[site_id],
                    "rejected_jobs": self.cumulative_rejected,
                    "deadline_misses": self.cumulative_deadline_misses,
                    "max_rack_temp_c": site_max_temp,
                    "p95_rack_temp_c": site_p95_temp,
                    "thermal_violations": self.site_cumulative_thermal_violations[site_id],
                }
            )

        if fleet_cpu_utils:
            self.cpu_util_step_means.append(float(np.mean(fleet_cpu_utils)))
        if fleet_mem_utils:
            self.mem_util_step_means.append(float(np.mean(fleet_mem_utils)))

    def finalize(self, state: SimState, site_accumulators: dict[str, SiteAccumulator]) -> dict:
        total_jobs = len(state.all_jobs)
        completed_jobs = len(state.completed_job_ids)
        rejected_jobs = len(state.rejected_job_ids)
        deadline_misses = sum(1 for j in state.all_jobs.values() if j.deadline_missed)
        sla_violations = sum(
            1 for j in state.all_jobs.values() if j.deadline_missed and j.latency_sensitive
        )

        total_it_energy = sum(a.cumulative_it_energy_kwh for a in site_accumulators.values())
        total_facility_energy = sum(a.cumulative_facility_energy_kwh for a in site_accumulators.values())
        total_cooling_energy = sum(a.cumulative_cooling_energy_kwh for a in site_accumulators.values())
        total_carbon = sum(a.cumulative_carbon_kgco2e for a in site_accumulators.values())
        total_cost = sum(a.cumulative_cost_usd for a in site_accumulators.values())
        peak_facility_power_kw = (
            max((a.peak_facility_power_kw for a in site_accumulators.values()), default=0.0)
        )
        average_pue = (
            total_facility_energy / total_it_energy if total_it_energy > 0 else float("nan")
        )

        dt_hours = self.timestep_minutes / 60.0
        p95_rack_temp_c = (
            float(np.percentile(self.all_rack_temp_samples, 95)) if self.all_rack_temp_samples else float("nan")
        )
        max_rack_temp_c = (
            self.global_max_rack_temp_c if self.global_max_rack_temp_c != float("-inf") else float("nan")
        )
        thermal_violations = sum(self.site_cumulative_thermal_violations.values())

        return {
            "policy_name": self.policy_name,
            "duration_hours": self.duration_hours,
            "timestep_minutes": self.timestep_minutes,
            "total_jobs": total_jobs,
            "completed_jobs": completed_jobs,
            "rejected_jobs": rejected_jobs,
            "deadline_misses": deadline_misses,
            "sla_violations": sla_violations,
            "total_it_energy_kwh": total_it_energy,
            "total_facility_energy_kwh": total_facility_energy,
            "total_cooling_energy_kwh": total_cooling_energy,
            "total_carbon_kgco2e": total_carbon,
            "total_cost_usd": total_cost,
            "average_pue": average_pue,
            "peak_facility_power_kw": peak_facility_power_kw,
            "average_cpu_utilization": (
                float(np.mean(self.cpu_util_step_means)) if self.cpu_util_step_means else 0.0
            ),
            "average_memory_utilization": (
                float(np.mean(self.mem_util_step_means)) if self.mem_util_step_means else 0.0
            ),
            "active_server_hours": self.active_server_steps * dt_hours,
            "sleeping_server_hours": self.sleeping_server_steps * dt_hours,
            "max_rack_temp_c": max_rack_temp_c,
            "p95_rack_temp_c": p95_rack_temp_c,
            "thermal_violations": thermal_violations,
            "critical_thermal_violations": self.global_critical_thermal_violations,
            "resource_trace_used": self.resource_trace_used,
            "seed": self.seed,
        }

    def job_rows(self, state: SimState) -> list[dict]:
        rows = []
        for job in state.all_jobs.values():
            queued_minutes = None
            if job.start_time is not None:
                queued_minutes = (job.start_time - job.arrival_time) * self.timestep_minutes
            rows.append(
                {
                    "job_id": job.job_id,
                    "workload_type": job.workload_type.value,
                    "arrival_time": job.arrival_time,
                    "start_time": job.start_time if job.start_time is not None else "",
                    "completion_time": job.completion_time if job.completion_time is not None else "",
                    "deadline_time": job.deadline_time if job.deadline_time is not None else "",
                    "queued_minutes": queued_minutes if queued_minutes is not None else "",
                    "completed": job.completed,
                    "rejected": job.rejected,
                    "deadline_missed": job.deadline_missed,
                    "site_id": job.site_id or "",
                    "rack_id": job.rack_id or "",
                    "server_id": job.server_id or "",
                    "cpu_demand_units": job.cpu_demand_units,
                    "memory_demand_gb": job.memory_demand_gb,
                    "total_work_units": job.total_work_units,
                }
            )
        return rows

    def write_outputs(self, state: SimState, site_accumulators: dict[str, SiteAccumulator], config: Config, out_dir: Path) -> dict:
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        summary = self.finalize(state, site_accumulators)
        with (out_dir / "run_summary.json").open("w") as f:
            json.dump(summary, f, indent=2)

        _write_csv(out_dir / "timeseries_metrics.csv", self.timeseries_rows)
        _write_csv(out_dir / "job_results.csv", self.job_rows(state))
        _write_csv(out_dir / "policy_decisions.csv", self.decision_rows)

        write_resolved_config(config, out_dir / "config_resolved.yaml")

        return summary


def _write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        path.write_text("")
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

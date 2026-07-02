"""Synthetic fleet and workload generation.

Fleet generation is deterministic (structure comes straight from config).
Workload generation is stochastic but seeded (`simulation.seed`): job
arrivals are drawn from a Poisson process per workload type per timestep,
with rates that vary by time of day to produce bursty LLM/online-service
traffic during the day and heavier batch traffic overnight -- see
docs/model_assumptions.md for the exact rate table and why it's a modeling
choice, not a measured pattern.
"""
from __future__ import annotations

import math
from typing import Optional

import numpy as np

from helicyn_sim.config import Config, WorkloadConfig
from helicyn_sim.models.rack import Rack
from helicyn_sim.models.server import Server
from helicyn_sim.models.site import Site
from helicyn_sim.models.workload import WORKLOAD_DEFAULTS
from helicyn_sim.schemas.workload import Job, WorkloadType
from helicyn_sim.traces.resource_trace_loader import load_resource_trace_shape

DEADLINE_SLACK_MINUTES_LATENCY_SENSITIVE = 15.0


def generate_fleet(config: Config) -> tuple[dict[str, Site], dict[str, Rack], dict[str, Server]]:
    sites: dict[str, Site] = {}
    racks: dict[str, Rack] = {}
    servers: dict[str, Server] = {}

    profile = config.fleet.server_profile

    for site_cfg in config.fleet.sites:
        rack_ids: list[str] = []
        for rack_idx in range(site_cfg.racks):
            rack_id = f"{site_cfg.site_id}-rack{rack_idx:02d}"
            server_ids: list[str] = []
            for server_idx in range(site_cfg.servers_per_rack):
                server_id = f"{rack_id}-srv{server_idx:02d}"
                servers[server_id] = Server(
                    server_id=server_id,
                    rack_id=rack_id,
                    site_id=site_cfg.site_id,
                    cpu_capacity_units=profile.cpu_capacity_units,
                    memory_capacity_gb=profile.memory_capacity_gb,
                    gpu_capacity_units=profile.gpu_capacity_units,
                    idle_power_w=profile.idle_power_w,
                    max_cpu_dynamic_power_w=profile.max_cpu_dynamic_power_w,
                    fan_overhead_w=profile.fan_overhead_w,
                    sleep_power_w=profile.sleep_power_w,
                    dvfs_state=config.policy.dvfs_state,
                )
                server_ids.append(server_id)
            racks[rack_id] = Rack(
                rack_id=rack_id,
                site_id=site_cfg.site_id,
                server_ids=server_ids,
                cooling_reference_temp_c=site_cfg.cooling_reference_temp_c,
                rack_temp_c=site_cfg.cooling_reference_temp_c,
            )
            rack_ids.append(rack_id)
        sites[site_cfg.site_id] = Site(
            site_id=site_cfg.site_id,
            region=site_cfg.region,
            rack_ids=rack_ids,
            base_pue=site_cfg.base_pue,
            cooling_reference_temp_c=site_cfg.cooling_reference_temp_c,
            carbon_profile=site_cfg.carbon_profile,
            price_profile=site_cfg.price_profile,
            weather_profile=site_cfg.weather_profile,
            ambient_temp_coefficient=site_cfg.ambient_temp_coefficient,
        )

    return sites, racks, servers


def _num_steps(config: Config) -> int:
    return int(round(config.simulation.duration_hours * 60.0 / config.simulation.timestep_minutes))


def _arrival_rate_per_hour(workload_type: WorkloadType, hour_of_day: float, wc: WorkloadConfig) -> float:
    if workload_type == WorkloadType.LLM_INFERENCE:
        peak = 8.0 <= hour_of_day < 22.0
        return wc.llm_inference_jobs_per_hour_peak if peak else wc.llm_inference_jobs_per_hour_offpeak
    if workload_type == WorkloadType.BATCH:
        daytime = 8.0 <= hour_of_day < 20.0
        return wc.batch_jobs_per_hour_day if daytime else wc.batch_jobs_per_hour_night
    if workload_type == WorkloadType.ONLINE_SERVICE:
        return wc.online_service_jobs_per_hour
    if workload_type == WorkloadType.MAINTENANCE:
        return wc.maintenance_jobs_per_day / 24.0
    raise ValueError(f"Unknown workload_type: {workload_type}")


def _work_units_range(workload_type: WorkloadType, wc: WorkloadConfig) -> tuple[float, float]:
    return {
        WorkloadType.LLM_INFERENCE: (wc.llm_work_units_min, wc.llm_work_units_max),
        WorkloadType.BATCH: (wc.batch_work_units_min, wc.batch_work_units_max),
        WorkloadType.ONLINE_SERVICE: (wc.online_work_units_min, wc.online_work_units_max),
        WorkloadType.MAINTENANCE: (wc.maintenance_work_units_min, wc.maintenance_work_units_max),
    }[workload_type]


def generate_workload(
    config: Config,
    resource_trace_path: Optional[str] = None,
) -> list[Job]:
    wc = config.workload
    num_steps = _num_steps(config)
    dt_minutes = config.simulation.timestep_minutes
    rng = np.random.default_rng(config.simulation.seed)

    cpu_mult: Optional[np.ndarray] = None
    mem_mult: Optional[np.ndarray] = None
    if resource_trace_path:
        cpu_mult, mem_mult = load_resource_trace_shape(resource_trace_path, num_steps)

    jobs: list[Job] = []
    job_counter = 0

    for step in range(num_steps):
        hour_of_day = (step * dt_minutes / 60.0) % 24.0

        for workload_type in WorkloadType:
            rate_per_hour = _arrival_rate_per_hour(workload_type, hour_of_day, wc)
            expected_arrivals = rate_per_hour * (dt_minutes / 60.0)
            num_arrivals = rng.poisson(expected_arrivals)
            if num_arrivals <= 0:
                continue

            defaults = WORKLOAD_DEFAULTS[workload_type]
            work_min, work_max = _work_units_range(workload_type, wc)

            for _ in range(num_arrivals):
                if cpu_mult is not None and mem_mult is not None:
                    cpu_frac = float(np.clip(cpu_mult[step] + rng.normal(0, 0.05), 0.0, 1.0))
                    mem_frac = float(np.clip(mem_mult[step] + rng.normal(0, 0.05), 0.0, 1.0))
                else:
                    cpu_frac = rng.uniform(0.0, 1.0)
                    mem_frac = rng.uniform(0.0, 1.0)

                cpu_demand = wc.cpu_demand_min_units + cpu_frac * (wc.cpu_demand_max_units - wc.cpu_demand_min_units)
                memory_demand = wc.memory_demand_min_gb + mem_frac * (
                    wc.memory_demand_max_gb - wc.memory_demand_min_gb
                )
                total_work = rng.uniform(work_min, work_max)

                latency_sensitive = defaults["latency_sensitive"]
                if latency_sensitive:
                    max_delay = DEADLINE_SLACK_MINUTES_LATENCY_SENSITIVE
                else:
                    max_delay = wc.max_delay_minutes_flexible
                deadline_time = step + int(math.ceil((total_work + max_delay) / dt_minutes))

                job_counter += 1
                jobs.append(
                    Job(
                        job_id=f"job-{job_counter:06d}",
                        arrival_time=step,
                        workload_type=workload_type,
                        cpu_demand_units=cpu_demand,
                        memory_demand_gb=memory_demand,
                        gpu_demand_units=0.0,
                        total_work_units=total_work,
                        remaining_work_units=total_work,
                        deadline_time=deadline_time,
                        max_delay_minutes=max_delay,
                        latency_sensitive=latency_sensitive,
                        preemptible=defaults["preemptible"],
                        migratable=defaults["migratable"],
                        carbon_flexible=defaults["carbon_flexible"],
                        price_flexible=defaults["price_flexible"],
                    )
                )

    jobs.sort(key=lambda j: j.arrival_time)
    return jobs

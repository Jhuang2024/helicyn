"""Output schemas for run_summary.json and one row of timeseries_metrics.csv.

These are the canonical field lists; `simulation/results.py` is responsible
for actually computing and populating them.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict


class RunSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    policy_name: str
    duration_hours: float
    timestep_minutes: float
    total_jobs: int
    completed_jobs: int
    rejected_jobs: int
    deadline_misses: int
    sla_violations: int

    total_it_energy_kwh: float
    total_facility_energy_kwh: float
    total_cooling_energy_kwh: float
    total_carbon_kgco2e: float
    total_cost_usd: float

    average_pue: float
    peak_facility_power_kw: float
    average_cpu_utilization: float
    average_memory_utilization: float
    active_server_hours: float
    sleeping_server_hours: float

    max_rack_temp_c: float
    p95_rack_temp_c: float
    thermal_violations: int
    critical_thermal_violations: int

    resource_trace_used: Optional[str] = None
    seed: Optional[int] = None


class TimestepSiteMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timestamp: str
    site_id: str
    policy_name: str

    it_power_kw: float
    facility_power_kw: float
    cooling_power_kw: float
    dynamic_pue: float

    cumulative_it_energy_kwh: float
    cumulative_facility_energy_kwh: float
    cumulative_cooling_energy_kwh: float
    cumulative_carbon_kgco2e: float
    cumulative_cost_usd: float

    carbon_intensity_gco2e_per_kwh: float
    electricity_price_usd_per_mwh: float
    ambient_temp_c: float

    average_cpu_utilization: float
    average_memory_utilization: float
    active_servers: int
    sleeping_servers: int

    queued_jobs: int
    running_jobs: int
    completed_jobs: int
    rejected_jobs: int
    deadline_misses: int

    max_rack_temp_c: float
    p95_rack_temp_c: float
    thermal_violations: int

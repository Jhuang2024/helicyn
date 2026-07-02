"""Mirrors helicyn_ml.schemas.fleet_state field-for-field. This is the
payload shape the simulator will POST to `http://127.0.0.1:8765/recommend`
once the Phase 2 `external_helicyn` policy adapter exists. Not used by any
Phase 1 policy; kept here now so the schema is stable and testable early.
"""
from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from helicyn_sim.schemas.workload import WorkloadType


class Server(BaseModel):
    model_config = ConfigDict(extra="forbid")

    server_id: str
    rack_id: str
    cpu_capacity: float = Field(gt=0)
    cpu_used: float = Field(default=0, ge=0)
    memory_capacity_gb: float = Field(gt=0)
    memory_used_gb: float = Field(default=0, ge=0)
    gpu_capacity: float = Field(default=0, ge=0)
    gpu_used: float = Field(default=0, ge=0)
    gpu_memory_capacity_gb: float = Field(default=0, ge=0)
    gpu_memory_used_gb: float = Field(default=0, ge=0)
    dvfs_state: str = "balanced"
    asleep: bool = False
    running_job_ids: List[str] = Field(default_factory=list)


class Rack(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rack_id: str
    site_id: str
    server_ids: List[str] = Field(default_factory=list)
    ambient_temp_c: Optional[float] = None
    thermal_headroom_c: Optional[float] = None


class Site(BaseModel):
    model_config = ConfigDict(extra="forbid")

    site_id: str
    region: str
    rack_ids: List[str] = Field(default_factory=list)
    migratable: bool = True


class QueuedJob(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: str
    workload_type: WorkloadType = WorkloadType.BATCH
    arrival_time: datetime
    cpu_request: Optional[float] = Field(default=None, ge=0)
    memory_request_gb: Optional[float] = Field(default=None, ge=0)
    gpu_request: Optional[float] = Field(default=None, ge=0)
    gpu_memory_request_gb: Optional[float] = Field(default=None, ge=0)
    input_tokens: Optional[int] = Field(default=None, ge=0)
    output_tokens: Optional[int] = Field(default=None, ge=0)
    priority: Optional[float] = None
    preemptible: bool = False
    latency_sensitive: bool = False
    delayable: bool = True
    max_delay_minutes: Optional[float] = Field(default=None, ge=0)
    migratable: bool = True
    site_affinity: Optional[str] = None
    deadline: Optional[datetime] = None


class RunningJob(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: str
    server_id: str
    workload_type: WorkloadType = WorkloadType.BATCH
    start_time: datetime
    expected_end_time: Optional[datetime] = None
    cpu_usage: Optional[float] = Field(default=None, ge=0)
    memory_usage_gb: Optional[float] = Field(default=None, ge=0)
    gpu_usage: Optional[float] = Field(default=None, ge=0)
    migratable: bool = True


class GridSignal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    region: str
    timestamp: datetime
    carbon_intensity_gco2e_per_kwh: Optional[float] = None
    electricity_price_usd_per_mwh: Optional[float] = None
    grid_load_mw: Optional[float] = None
    forecast_carbon_intensity_1h: Optional[float] = None
    forecast_price_1h: Optional[float] = None


class WeatherSignal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    region: str
    timestamp: datetime
    ambient_temp_c: float
    relative_humidity: Optional[float] = None
    wet_bulb_temp_c: Optional[float] = None


class FleetState(BaseModel):
    """Output contract this simulator would send to Helicyn ML's
    `POST /recommend`. Field-for-field compatible with
    helicyn_ml.schemas.fleet_state.FleetState.
    """

    model_config = ConfigDict(extra="forbid")

    timestamp: datetime
    sites: List[Site] = Field(default_factory=list)
    racks: List[Rack] = Field(default_factory=list)
    servers: List[Server] = Field(default_factory=list)
    queued_jobs: List[QueuedJob] = Field(default_factory=list)
    running_jobs: List[RunningJob] = Field(default_factory=list)
    grid_signals: List[GridSignal] = Field(default_factory=list)
    weather_signals: List[WeatherSignal] = Field(default_factory=list)
    current_power_metrics: Optional[Dict[str, float]] = None
    current_thermal_metrics: Optional[Dict[str, float]] = None

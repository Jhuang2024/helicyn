"""Simulator-internal job representation.

This is deliberately richer than helicyn_ml's `QueuedJob`/`RunningJob`
(FleetState schemas) because the simulator owns full job lifecycle state
(remaining work, queueing time, completion) that the ML policy contract does
not need to see. `helicyn_sim.simulation.state` converts `Job` objects into
`FleetState` records when calling out to Helicyn ML (Phase 2).
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class WorkloadType(str, Enum):
    LLM_INFERENCE = "llm_inference"
    BATCH = "batch"
    ONLINE_SERVICE = "online_service"
    MAINTENANCE = "maintenance"


class Job(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: str
    arrival_time: int = Field(description="simulation step index at which the job arrives")
    workload_type: WorkloadType

    cpu_demand_units: float = Field(gt=0)
    memory_demand_gb: float = Field(gt=0)
    gpu_demand_units: float = Field(default=0, ge=0)

    total_work_units: float = Field(gt=0)
    remaining_work_units: float = Field(gt=0)

    deadline_time: Optional[int] = Field(default=None, description="simulation step index")
    max_delay_minutes: Optional[float] = Field(default=None, ge=0)

    latency_sensitive: bool = False
    preemptible: bool = False
    migratable: bool = False
    carbon_flexible: bool = False
    price_flexible: bool = False

    # lifecycle state, mutated by the simulation engine
    start_time: Optional[int] = None
    completion_time: Optional[int] = None
    completed: bool = False
    rejected: bool = False
    deadline_missed: bool = False
    site_id: Optional[str] = None
    rack_id: Optional[str] = None
    server_id: Optional[str] = None

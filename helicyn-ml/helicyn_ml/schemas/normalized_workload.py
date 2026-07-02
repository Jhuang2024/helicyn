from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class WorkloadType(str, Enum):
    BATCH = "batch"
    ONLINE_SERVICE = "online_service"
    VM = "vm"
    SERVERLESS = "serverless"
    LLM_INFERENCE = "llm_inference"
    LMM_INFERENCE = "lmm_inference"
    GPU_TRAINING = "gpu_training"
    GPU_INFERENCE = "gpu_inference"
    CPU_BATCH = "cpu_batch"
    UNKNOWN = "unknown"


class NormalizedWorkloadRecord(BaseModel):
    """A single job/task/request from any workload dataset, normalized to a
    common schema so models can be trained across heterogeneous sources.
    """

    model_config = ConfigDict(extra="forbid")

    source_dataset: str
    source_version: Optional[str] = None
    record_id: str
    job_id: str
    task_id: Optional[str] = None

    timestamp: datetime
    arrival_time: datetime
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_seconds: Optional[float] = Field(default=None, ge=0)

    workload_type: WorkloadType = WorkloadType.UNKNOWN

    cpu_request: Optional[float] = Field(default=None, ge=0)
    cpu_usage: Optional[float] = Field(default=None, ge=0)
    memory_request_gb: Optional[float] = Field(default=None, ge=0)
    memory_usage_gb: Optional[float] = Field(default=None, ge=0)
    gpu_request: Optional[float] = Field(default=None, ge=0)
    gpu_usage: Optional[float] = Field(default=None, ge=0)
    gpu_memory_request_gb: Optional[float] = Field(default=None, ge=0)
    gpu_memory_usage_gb: Optional[float] = Field(default=None, ge=0)

    input_tokens: Optional[int] = Field(default=None, ge=0)
    output_tokens: Optional[int] = Field(default=None, ge=0)
    estimated_work_units: Optional[float] = Field(default=None, ge=0)

    priority: Optional[float] = None
    scheduling_class: Optional[str] = None
    preemptible: Optional[bool] = None
    latency_sensitive: Optional[bool] = None

    region: Optional[str] = None
    machine_id: Optional[str] = None
    pod_id: Optional[str] = None
    owner_id_hash: Optional[str] = None

    raw_metadata_json: Optional[str] = None

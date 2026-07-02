from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class NormalizedResourceTimeseriesRecord(BaseModel):
    """A single time-step observation of measured resource utilization for
    one VM/trace, from a real or preprocessed-real public dataset (never
    synthetic unless source_dataset explicitly says so).

    This is deliberately a separate schema from NormalizedWorkloadRecord:
    workload records describe discrete job/task events, while these are
    dense regular-interval utilization time series (e.g. one row every 5
    minutes for a VM), which need different splitting and feature-engineering
    logic (see preprocessing/split.py resource handling and
    models/resource_predictor.py).

    GPU fields are intentionally NOT part of this schema. None of the
    datasets this schema currently normalizes (Google ClusterData-derived
    VM traces, Azure CPU aggregate traces) report GPU usage - inventing a
    gpu_usage_percent field here (even left null) would invite a future
    caller to fill it with a fabricated default. If a GPU-reporting resource
    dataset is added later, extend this schema explicitly at that point.
    """

    model_config = ConfigDict(extra="forbid")

    source_dataset: str
    source_repo: Optional[str] = None
    trace_id: Optional[str] = None
    vm_id: str

    timestamp: Optional[datetime] = None
    time_index: Optional[int] = Field(default=None, ge=0)
    timestamp_is_relative: bool
    interval_minutes: Optional[float] = Field(default=None, gt=0)

    cpu_usage_percent: Optional[float] = None
    memory_usage_percent: Optional[float] = None
    avg_cpu_usage_percent: Optional[float] = None
    min_cpu_usage_percent: Optional[float] = None
    max_cpu_usage_percent: Optional[float] = None

    cpu_request: Optional[float] = None
    memory_request: Optional[float] = None

    raw_file: Optional[str] = None

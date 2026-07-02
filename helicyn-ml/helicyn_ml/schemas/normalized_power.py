from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class NormalizedPowerRecord(BaseModel):
    """Measured power draw with concurrent utilization signals, used to
    train (or fall back from) the power predictor. Units: kW.
    """

    model_config = ConfigDict(extra="forbid")

    source_dataset: str
    timestamp: datetime
    site_id: Optional[str] = None
    server_id: Optional[str] = None

    cpu_usage: Optional[float] = Field(default=None, ge=0)
    gpu_usage: Optional[float] = Field(default=None, ge=0)
    memory_usage: Optional[float] = Field(default=None, ge=0)
    network_usage: Optional[float] = Field(default=None, ge=0)
    ambient_temp_c: Optional[float] = None

    power_kw: float = Field(ge=0)

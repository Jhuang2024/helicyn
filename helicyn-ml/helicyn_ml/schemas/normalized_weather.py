from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class NormalizedWeatherRecord(BaseModel):
    """Ambient weather signal used as a cooling-load proxy. Units: Celsius, %."""

    model_config = ConfigDict(extra="forbid")

    source_dataset: str
    timestamp: datetime
    region: str

    ambient_temp_c: float
    relative_humidity: Optional[float] = Field(default=None, ge=0, le=100)
    wet_bulb_temp_c: Optional[float] = None

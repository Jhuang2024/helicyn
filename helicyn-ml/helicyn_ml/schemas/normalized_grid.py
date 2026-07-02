from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class NormalizedGridRecord(BaseModel):
    """Carbon intensity / electricity price / grid load signal for a region
    at a point in time. Units: gCO2e/kWh, USD/MWh, MW.
    """

    model_config = ConfigDict(extra="forbid")

    source_dataset: str
    timestamp: datetime
    region: str

    carbon_intensity_gco2e_per_kwh: Optional[float] = Field(default=None, ge=0)
    renewable_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    carbon_free_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    electricity_price_usd_per_mwh: Optional[float] = None
    grid_load_mw: Optional[float] = Field(default=None, ge=0)

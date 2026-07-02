from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Site:
    site_id: str
    region: str
    rack_ids: list[str] = field(default_factory=list)

    base_pue: float = 1.3
    cooling_reference_temp_c: float = 20.0

    carbon_profile: str = "mixed_grid"
    price_profile: str = "moderate_price"
    weather_profile: str = "cool_weather"

    ambient_temp_coefficient: float = 0.008
    dynamic_pue_min: float = 1.05
    dynamic_pue_max: float = 2.20

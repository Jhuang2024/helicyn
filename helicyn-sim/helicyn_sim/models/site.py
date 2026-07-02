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

    # Added for Phase 3 sensitivity analysis (configs/sensitivity.yaml's
    # ambient_temperature_offset_c sweep) and the thermal_stress research
    # scenario: a flat degrees-C shift applied on top of the weather
    # profile's own daily curve, so scenarios can push a site warmer/cooler
    # without inventing a new named weather profile per offset.
    ambient_temp_offset_c: float = 0.0

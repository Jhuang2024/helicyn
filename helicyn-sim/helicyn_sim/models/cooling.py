"""Dynamic PUE / cooling model. A single scalar PUE per site per timestep,
driven by ambient temperature above the site's cooling reference temperature
plus an optional hotspot penalty derived from rack thermal state. This is a
simplified analytical proxy, not a facility cooling-plant simulation -- see
docs/model_assumptions.md.
"""
from __future__ import annotations

from dataclasses import dataclass

DYNAMIC_PUE_MIN = 1.05
DYNAMIC_PUE_MAX = 2.20


@dataclass
class CoolingResult:
    it_power_kw: float
    dynamic_pue: float
    facility_power_kw: float
    cooling_power_kw: float


def compute_dynamic_pue(
    base_pue: float,
    ambient_temp_c: float,
    cooling_reference_temp_c: float,
    ambient_temp_coefficient: float,
    hotspot_pue_penalty: float = 0.0,
) -> float:
    pue = base_pue + ambient_temp_coefficient * max(0.0, ambient_temp_c - cooling_reference_temp_c)
    pue += hotspot_pue_penalty
    return min(DYNAMIC_PUE_MAX, max(DYNAMIC_PUE_MIN, pue))


def compute_site_cooling(
    total_server_power_w: float,
    base_pue: float,
    ambient_temp_c: float,
    cooling_reference_temp_c: float,
    ambient_temp_coefficient: float = 0.008,
    hotspot_pue_penalty: float = 0.0,
) -> CoolingResult:
    it_power_kw = total_server_power_w / 1000.0
    dynamic_pue = compute_dynamic_pue(
        base_pue, ambient_temp_c, cooling_reference_temp_c, ambient_temp_coefficient, hotspot_pue_penalty
    )
    facility_power_kw = it_power_kw * dynamic_pue
    cooling_power_kw = facility_power_kw - it_power_kw
    return CoolingResult(
        it_power_kw=it_power_kw,
        dynamic_pue=dynamic_pue,
        facility_power_kw=facility_power_kw,
        cooling_power_kw=cooling_power_kw,
    )

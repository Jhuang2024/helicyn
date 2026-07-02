"""Pure energy/carbon/cost formulas, plus a per-site running accumulator.
See docs/equations.md.
"""
from __future__ import annotations

from dataclasses import dataclass


def energy_kwh(power_kw: float, dt_hours: float) -> float:
    return power_kw * dt_hours


def carbon_kgco2e(facility_energy_kwh: float, carbon_intensity_gco2e_per_kwh: float) -> float:
    return facility_energy_kwh * carbon_intensity_gco2e_per_kwh / 1000.0


def cost_usd(facility_energy_kwh: float, electricity_price_usd_per_mwh: float) -> float:
    return facility_energy_kwh * electricity_price_usd_per_mwh / 1000.0


@dataclass
class SiteAccumulator:
    site_id: str
    cumulative_it_energy_kwh: float = 0.0
    cumulative_facility_energy_kwh: float = 0.0
    cumulative_cooling_energy_kwh: float = 0.0
    cumulative_carbon_kgco2e: float = 0.0
    cumulative_cost_usd: float = 0.0
    peak_facility_power_kw: float = 0.0

    def update(
        self,
        it_power_kw: float,
        facility_power_kw: float,
        cooling_power_kw: float,
        carbon_intensity_gco2e_per_kwh: float,
        electricity_price_usd_per_mwh: float,
        dt_hours: float,
    ) -> None:
        it_energy = energy_kwh(it_power_kw, dt_hours)
        facility_energy = energy_kwh(facility_power_kw, dt_hours)
        cooling_energy = energy_kwh(cooling_power_kw, dt_hours)

        self.cumulative_it_energy_kwh += it_energy
        self.cumulative_facility_energy_kwh += facility_energy
        self.cumulative_cooling_energy_kwh += cooling_energy
        self.cumulative_carbon_kgco2e += carbon_kgco2e(facility_energy, carbon_intensity_gco2e_per_kwh)
        self.cumulative_cost_usd += cost_usd(facility_energy, electricity_price_usd_per_mwh)
        self.peak_facility_power_kw = max(self.peak_facility_power_kw, facility_power_kw)

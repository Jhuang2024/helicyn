"""Synthetic but documented carbon-intensity and electricity-price profiles.

These are NOT real grid operator data. They are deterministic (seeded),
smooth, hand-picked curves meant to be *directionally* representative of two
well-known real-world patterns so that a coordination policy has something
non-trivial to react to:

- "solar_duck_curve" (used by the CA-WEST demo site): carbon intensity and
  price both dip around midday (abundant solar) and spike in the evening
  (solar drops off, demand ramps) -- the well-known California "duck curve".
- "mixed_grid" (used by the ONT-NORTH demo site): flatter, moderate carbon
  intensity, characteristic of a grid with a large hydro/nuclear baseload.

See docs/model_assumptions.md for the full disclaimer.
"""
from __future__ import annotations

import math

import numpy as np

CARBON_PROFILES = {
    "solar_duck_curve": dict(base=250.0, midday_dip=170.0, evening_peak=110.0, noise_sd=6.0),
    "mixed_grid": dict(base=120.0, midday_dip=15.0, evening_peak=20.0, noise_sd=4.0),
}

PRICE_PROFILES = {
    "volatile_price": dict(base=70.0, midday_dip=50.0, evening_peak=130.0, noise_sd=3.0),
    "moderate_price": dict(base=60.0, midday_dip=10.0, evening_peak=15.0, noise_sd=1.5),
}


def _duck_curve_value(hour_of_day: float, base: float, midday_dip: float, evening_peak: float) -> float:
    """A base value with a midday dip (centered 13:00) and an evening peak
    (centered 19:00), both modeled as raised cosine bumps.
    """
    midday = math.exp(-((hour_of_day - 13.0) ** 2) / (2 * 3.0**2))
    evening = math.exp(-((hour_of_day - 19.0) ** 2) / (2 * 2.0**2))
    return base - midday_dip * midday + evening_peak * evening


def carbon_intensity_gco2e_per_kwh(profile: str, hour_of_day: float, rng: np.random.Generator) -> float:
    if profile not in CARBON_PROFILES:
        raise ValueError(f"Unknown carbon_profile: {profile!r}. Valid: {sorted(CARBON_PROFILES)}")
    p = CARBON_PROFILES[profile]
    value = _duck_curve_value(hour_of_day, p["base"], p["midday_dip"], p["evening_peak"])
    value += rng.normal(0.0, p["noise_sd"])
    return max(5.0, value)


def electricity_price_usd_per_mwh(profile: str, hour_of_day: float, rng: np.random.Generator) -> float:
    if profile not in PRICE_PROFILES:
        raise ValueError(f"Unknown price_profile: {profile!r}. Valid: {sorted(PRICE_PROFILES)}")
    p = PRICE_PROFILES[profile]
    value = _duck_curve_value(hour_of_day, p["base"], p["midday_dip"], p["evening_peak"])
    value += rng.normal(0.0, p["noise_sd"])
    return max(1.0, value)


def forecast_carbon_intensity_gco2e_per_kwh(profile: str, hour_of_day: float) -> float:
    """The noise-free component of the carbon curve -- what a carbon-aware
    policy can "forecast" ahead of time. Real day-ahead carbon/price
    forecasts are smoothed relative to realized values; this is the
    synthetic-simulator equivalent, and deliberately does not draw from the
    per-step `rng` (a policy cannot see next step's not-yet-drawn noise
    without breaking reproducibility of the eventual realized value).
    """
    if profile not in CARBON_PROFILES:
        raise ValueError(f"Unknown carbon_profile: {profile!r}. Valid: {sorted(CARBON_PROFILES)}")
    p = CARBON_PROFILES[profile]
    return max(5.0, _duck_curve_value(hour_of_day, p["base"], p["midday_dip"], p["evening_peak"]))


def forecast_electricity_price_usd_per_mwh(profile: str, hour_of_day: float) -> float:
    """Noise-free forecast counterpart to `electricity_price_usd_per_mwh`;
    see `forecast_carbon_intensity_gco2e_per_kwh` for why it's noise-free.
    """
    if profile not in PRICE_PROFILES:
        raise ValueError(f"Unknown price_profile: {profile!r}. Valid: {sorted(PRICE_PROFILES)}")
    p = PRICE_PROFILES[profile]
    return max(1.0, _duck_curve_value(hour_of_day, p["base"], p["midday_dip"], p["evening_peak"]))

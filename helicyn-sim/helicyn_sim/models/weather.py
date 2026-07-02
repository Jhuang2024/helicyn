"""Synthetic but documented ambient-temperature profiles.

Not real weather data. Deterministic (seeded) daily sinusoid: coolest
overnight, warmest mid-afternoon. "warm_weather" (CA-WEST) runs several
degrees hotter than "cool_weather" (ONT-NORTH), consistent with the demo
fleet's two regions. See docs/model_assumptions.md.
"""
from __future__ import annotations

import math

import numpy as np

WEATHER_PROFILES = {
    "warm_weather": dict(mean_c=22.0, daily_amplitude_c=8.0, noise_sd=0.5),
    "cool_weather": dict(mean_c=14.0, daily_amplitude_c=6.0, noise_sd=0.5),
}


def ambient_temp_c(profile: str, hour_of_day: float, rng: np.random.Generator) -> float:
    if profile not in WEATHER_PROFILES:
        raise ValueError(f"Unknown weather_profile: {profile!r}. Valid: {sorted(WEATHER_PROFILES)}")
    p = WEATHER_PROFILES[profile]
    # peak at 15:00, trough at 03:00
    phase = (hour_of_day - 15.0) / 24.0 * 2 * math.pi
    value = p["mean_c"] + p["daily_amplitude_c"] * math.cos(phase)
    value += rng.normal(0.0, p["noise_sd"])
    return value

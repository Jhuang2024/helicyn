"""Rack thermal proxy. THIS IS NOT CFD. It is a lumped, first-order
heat-balance approximation: rack temperature rises with IT power draw, falls
with a simple proportional cooling-effort term, and is pulled toward ambient
temperature. It is useful for relative comparisons between policies (does
policy A run racks hotter than policy B) but must not be read as a
prediction of real sensor temperatures. See docs/model_assumptions.md and
docs/equations.md.
"""
from __future__ import annotations

HEAT_GAIN_COEFFICIENT = 0.025
COOLING_COEFFICIENT = 0.08
AMBIENT_COUPLING_COEFFICIENT = 0.002
COOLING_CONTROL_GAIN = 0.15
MAX_COOLING_EFFORT = 10.0

WARM_THRESHOLD_C = 27.0
HOT_THRESHOLD_C = 32.0
CRITICAL_THRESHOLD_C = 38.0


def cooling_effort(rack_temp_c: float, cooling_reference_temp_c: float) -> float:
    return min(
        MAX_COOLING_EFFORT,
        COOLING_CONTROL_GAIN * max(0.0, rack_temp_c - cooling_reference_temp_c),
    )


def next_rack_temp_c(
    rack_temp_c: float,
    rack_power_kw: float,
    ambient_temp_c: float,
    cooling_reference_temp_c: float,
    dt_minutes: float,
) -> float:
    effort = cooling_effort(rack_temp_c, cooling_reference_temp_c)
    next_temp = (
        rack_temp_c
        + dt_minutes * HEAT_GAIN_COEFFICIENT * rack_power_kw
        - dt_minutes * COOLING_COEFFICIENT * effort
        + dt_minutes * AMBIENT_COUPLING_COEFFICIENT * (ambient_temp_c - rack_temp_c)
    )
    return next_temp


def is_thermal_violation(rack_temp_c: float) -> bool:
    return rack_temp_c > HOT_THRESHOLD_C


def is_critical_thermal_violation(rack_temp_c: float) -> bool:
    return rack_temp_c > CRITICAL_THRESHOLD_C

"""DVFS (dynamic voltage/frequency scaling) scaffold.

Phase 1 does not optimize DVFS. BaselineFirstFitPolicy assigns every server
`balanced` and never changes it. The states exist so power.py has something
real to multiply against, and so a future policy can act on `dvfs_state`
without changing the power model's shape.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DvfsState:
    name: str
    performance_multiplier: float
    power_multiplier: float


DVFS_STATES: dict[str, DvfsState] = {
    "high_performance": DvfsState("high_performance", 1.00, 1.00),
    "balanced": DvfsState("balanced", 0.85, 0.75),
    "power_saver": DvfsState("power_saver", 0.65, 0.55),
}

DEFAULT_DVFS_STATE = "balanced"


def get_dvfs_state(name: str) -> DvfsState:
    try:
        return DVFS_STATES[name]
    except KeyError as exc:
        raise ValueError(f"Unknown DVFS state: {name!r}. Valid: {sorted(DVFS_STATES)}") from exc

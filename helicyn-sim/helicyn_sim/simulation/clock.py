"""Shared simulated wall-clock helper. Both the engine (for logging) and
policies that need to reason about "what hour is it" (carbon/price/DVFS
awareness, the external Helicyn adapter) need the exact same mapping from
step index to timestamp.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

SIM_EPOCH = datetime(2024, 1, 1, tzinfo=timezone.utc)


def step_timestamp(step: int, dt_minutes: float) -> datetime:
    return SIM_EPOCH + timedelta(minutes=step * dt_minutes)


def hour_of_day(step: int, dt_minutes: float) -> float:
    return (step * dt_minutes / 60.0) % 24.0

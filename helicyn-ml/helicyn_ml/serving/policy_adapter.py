"""Adapter helpers for external callers (future helicyn-sim) that may pass
loosely-typed dicts/JSON rather than constructing FleetState/Recommendation
objects directly.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Union

from helicyn_ml.schemas import FleetState, Recommendation


def load_fleet_state(source: Union[str, Path, dict]) -> FleetState:
    if isinstance(source, dict):
        return FleetState.model_validate(source)
    with open(source, "r") as f:
        payload = json.load(f)
    return FleetState.model_validate(payload)


def recommendation_to_json(recommendation: Recommendation, out_path: Union[str, Path]) -> None:
    with open(out_path, "w") as f:
        f.write(recommendation.model_dump_json(indent=2))

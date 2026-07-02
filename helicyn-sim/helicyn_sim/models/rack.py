"""Rack grouping + reduced-order thermal state.

See docs/model_assumptions.md: `rack_temp_c` is a single lumped value per
rack, not a spatial CFD field. It is a proxy for "how hot is this rack
running", useful for comparing policies relatively, not for predicting an
actual sensor reading.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Rack:
    rack_id: str
    site_id: str
    server_ids: list[str] = field(default_factory=list)
    cooling_reference_temp_c: float = 20.0
    rack_temp_c: float = 20.0

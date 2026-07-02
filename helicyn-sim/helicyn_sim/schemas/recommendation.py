"""Mirrors helicyn_ml.schemas.recommendation field-for-field so the simulator
can deserialize a `POST /recommend` response without depending on helicyn-ml
being importable. See docs/ml_integration_plan.md for the Phase 2 plan.
"""
from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict

from helicyn_sim.schemas.action import CandidateAction


class PredictedEffect(BaseModel):
    model_config = ConfigDict(extra="forbid")

    energy_delta_kwh: Optional[float] = None
    carbon_delta_kg: Optional[float] = None
    cost_delta_usd: Optional[float] = None
    sla_risk_delta: Optional[float] = None
    thermal_risk_delta: Optional[float] = None
    utilization_delta: Optional[float] = None


class ScoredAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: CandidateAction
    score: float
    score_breakdown: Dict[str, float] = {}
    predicted_effect: Optional[PredictedEffect] = None
    valid: bool = True
    rejection_reason: Optional[str] = None


class Recommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timestamp: datetime
    selected_actions: List[CandidateAction]
    ranked_actions: List[ScoredAction]
    score: float
    score_breakdown: Dict[str, float] = {}
    explanation: str
    predicted_effect: Optional[PredictedEffect] = None
    confidence: float
    model_version: str
    is_fallback: bool = False

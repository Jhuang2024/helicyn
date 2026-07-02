"""Mirrors helicyn_ml.schemas.action so a Phase 2 `external_helicyn` policy
can send/receive JSON-compatible payloads without importing helicyn-ml.
Kept as a hand-copied schema (not a dependency) because helicyn-sim must
run standalone even when helicyn-ml is not installed.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field


class ActionType(str, Enum):
    PLACE = "place"
    DELAY = "delay"
    MIGRATE = "migrate"
    CHANGE_DVFS = "change_dvfs"
    SLEEP_SERVER = "sleep_server"
    WAKE_SERVER = "wake_server"
    REJECT = "reject"


class CandidateAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action_type: ActionType
    job_id: Optional[str] = None
    target_site_id: Optional[str] = None
    target_rack_id: Optional[str] = None
    target_server_id: Optional[str] = None
    delay_minutes: Optional[float] = Field(default=None, ge=0)
    dvfs_state: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

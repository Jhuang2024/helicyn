from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class ModelCard(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_name: str
    version: str
    date_trained: datetime
    datasets_used: List[str]
    rows_used: int
    features: List[str]
    targets: List[str]
    train_range: Optional[str] = None
    val_range: Optional[str] = None
    test_range: Optional[str] = None
    metrics: Dict[str, Any]
    label_provenance: str  # "real" | "weak" | "synthetic" | "teacher_generated"
    known_limitations: List[str]
    intended_use: str
    non_intended_use: str
    extra_notes: Optional[str] = None

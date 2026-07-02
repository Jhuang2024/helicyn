from __future__ import annotations

from typing import Dict, List, Type

import numpy as np
import pandas as pd
from pydantic import BaseModel

from helicyn_ml.schemas import (
    NormalizedGridRecord,
    NormalizedPowerRecord,
    NormalizedWeatherRecord,
    NormalizedWorkloadRecord,
)
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

SCHEMA_BY_KIND: Dict[str, Type[BaseModel]] = {
    "workload": NormalizedWorkloadRecord,
    "grid": NormalizedGridRecord,
    "weather": NormalizedWeatherRecord,
    "power": NormalizedPowerRecord,
}


def coerce_to_schema(df: pd.DataFrame, kind: str) -> pd.DataFrame:
    """Add missing optional columns as null, drop columns not in the schema,
    and coerce dtypes. Does not validate row-by-row (too slow for large
    traces); use validate_sample() for that on a subsample.
    """
    schema = SCHEMA_BY_KIND[kind]
    field_names = list(schema.model_fields.keys())
    df = df.copy()
    for col in field_names:
        if col not in df.columns:
            df[col] = None
    df = df[field_names]
    return df


def validate_sample(df: pd.DataFrame, kind: str, sample_size: int = 200) -> Dict:
    schema = SCHEMA_BY_KIND[kind]
    n = min(sample_size, len(df))
    if n == 0:
        return {"validated": 0, "errors": 0, "error_examples": []}
    sample = df.sample(n=n, random_state=0) if len(df) > n else df
    errors = 0
    examples: List[str] = []
    for _, row in sample.iterrows():
        record = {k: (None if isinstance(v, float) and np.isnan(v) else v) for k, v in row.to_dict().items()}
        try:
            schema.model_validate(record)
        except Exception as exc:  # noqa: BLE001
            errors += 1
            if len(examples) < 5:
                examples.append(str(exc)[:300])
    return {"validated": n, "errors": errors, "error_examples": examples}


def drop_invalid_numeric(df: pd.DataFrame, numeric_cols: List[str]) -> pd.DataFrame:
    """Replace inf/-inf with NaN in numeric columns; never silently keeps
    infinities, which would poison downstream feature engineering.
    """
    df = df.copy()
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").replace([np.inf, -np.inf], np.nan)
    return df


def require_columns(df: pd.DataFrame, required: List[str], context: str) -> None:
    missing = [c for c in required if c not in df.columns]
    if missing:
        logger.warning(f"[{context}] missing expected columns: {missing}")

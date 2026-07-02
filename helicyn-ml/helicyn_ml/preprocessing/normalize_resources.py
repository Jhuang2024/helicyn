from __future__ import annotations

from pathlib import Path

import pandas as pd

from helicyn_ml.datasets.registry import ingest_dataset
from helicyn_ml.preprocessing.quality_checks import coerce_to_schema, drop_invalid_numeric, validate_sample
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

_NUMERIC_COLS = [
    "time_index",
    "interval_minutes",
    "cpu_usage_percent",
    "memory_usage_percent",
    "avg_cpu_usage_percent",
    "min_cpu_usage_percent",
    "max_cpu_usage_percent",
    "cpu_request",
    "memory_request",
]


def normalize_resource_dataset(dataset_id: str, input_dir: Path) -> pd.DataFrame:
    raw = ingest_dataset(dataset_id, input_dir)
    if raw.empty:
        return raw

    if "timestamp" in raw.columns:
        raw["timestamp"] = pd.to_datetime(raw["timestamp"], utc=True, errors="coerce")
    raw = drop_invalid_numeric(raw, _NUMERIC_COLS)
    raw = raw.dropna(subset=["vm_id"])
    df = coerce_to_schema(raw, "resource")

    report = validate_sample(df, "resource")
    if report["errors"]:
        logger.warning(f"[{dataset_id}] {report['errors']}/{report['validated']} sampled rows failed schema validation")
    logger.info(f"[{dataset_id}] normalized {len(df)} resource time-series records")
    return df

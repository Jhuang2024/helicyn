from __future__ import annotations

from pathlib import Path

import pandas as pd

from helicyn_ml.datasets.registry import ingest_dataset
from helicyn_ml.preprocessing.quality_checks import coerce_to_schema, drop_invalid_numeric, validate_sample
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

_NUMERIC_COLS = [
    "cpu_request",
    "cpu_usage",
    "memory_request_gb",
    "memory_usage_gb",
    "gpu_request",
    "gpu_usage",
    "gpu_memory_request_gb",
    "gpu_memory_usage_gb",
    "input_tokens",
    "output_tokens",
    "estimated_work_units",
    "duration_seconds",
    "priority",
]


def normalize_workload_dataset(dataset_id: str, input_dir: Path) -> pd.DataFrame:
    raw = ingest_dataset(dataset_id, input_dir)
    if raw.empty:
        return raw

    raw["timestamp"] = pd.to_datetime(raw["timestamp"], utc=True, errors="coerce")
    raw["arrival_time"] = pd.to_datetime(raw["arrival_time"], utc=True, errors="coerce")
    raw = raw.dropna(subset=["timestamp", "arrival_time"])

    raw = drop_invalid_numeric(raw, _NUMERIC_COLS)
    df = coerce_to_schema(raw, "workload")
    df["workload_type"] = df["workload_type"].fillna("unknown")

    report = validate_sample(df, "workload")
    if report["errors"]:
        logger.warning(f"[{dataset_id}] {report['errors']}/{report['validated']} sampled rows failed schema validation")
    logger.info(f"[{dataset_id}] normalized {len(df)} workload records")
    return df

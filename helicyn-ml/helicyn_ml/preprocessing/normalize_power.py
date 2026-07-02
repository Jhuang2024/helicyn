from __future__ import annotations

from pathlib import Path

import pandas as pd

from helicyn_ml.datasets.registry import ingest_dataset
from helicyn_ml.preprocessing.quality_checks import coerce_to_schema, drop_invalid_numeric, validate_sample
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

_NUMERIC_COLS = ["cpu_usage", "gpu_usage", "memory_usage", "network_usage", "ambient_temp_c", "power_kw"]


def normalize_power_dataset(dataset_id: str, input_dir: Path) -> pd.DataFrame:
    raw = ingest_dataset(dataset_id, input_dir)
    if raw.empty:
        return raw
    raw["timestamp"] = pd.to_datetime(raw["timestamp"], utc=True, errors="coerce")
    raw = drop_invalid_numeric(raw, _NUMERIC_COLS)
    raw = raw.dropna(subset=["timestamp", "power_kw"])
    df = coerce_to_schema(raw, "power")

    report = validate_sample(df, "power")
    if report["errors"]:
        logger.warning(f"[{dataset_id}] {report['errors']}/{report['validated']} sampled rows failed schema validation")
    logger.info(f"[{dataset_id}] normalized {len(df)} power records")
    return df

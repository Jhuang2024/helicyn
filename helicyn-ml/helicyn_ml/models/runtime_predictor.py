"""RuntimePredictor: predicts job duration_seconds from job metadata known
at submission time. Only trained on records that have a real duration
(from duration_seconds directly, or derivable from start/end time).
"""
from __future__ import annotations

from typing import List

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from helicyn_ml.models.base import TabularModel

MODEL_NAME = "runtime_predictor"
TARGET = "duration_seconds"

NUMERIC_FEATURES = [
    "cpu_request",
    "memory_request_gb",
    "gpu_request",
    "gpu_memory_request_gb",
    "input_tokens",
    "output_tokens",
    "priority",
    "hour_of_day",
    "day_of_week",
    "is_weekend",
]
CATEGORICAL_FEATURES = ["workload_type", "scheduling_class", "source_dataset"]


def usable_rows(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "duration_seconds" not in df.columns or df["duration_seconds"].isna().all():
        if {"start_time", "end_time"}.issubset(df.columns):
            df["duration_seconds"] = (
                pd.to_datetime(df["end_time"], utc=True, errors="coerce")
                - pd.to_datetime(df["start_time"], utc=True, errors="coerce")
            ).dt.total_seconds()
    return df[df["duration_seconds"].notna() & (df["duration_seconds"] >= 0)]


def build_estimator():
    return HistGradientBoostingRegressor(random_state=42, max_depth=6, max_iter=200)


def build_model() -> TabularModel:
    return TabularModel(
        estimator=build_estimator(),
        numeric_cols=NUMERIC_FEATURES,
        categorical_cols=CATEGORICAL_FEATURES,
        target_col=TARGET,
        model_type="HistGradientBoostingRegressor",
        task="regression",
    )


def baseline_predict(y_train: pd.Series, n: int) -> np.ndarray:
    return np.full(n, float(y_train.median()) if len(y_train) else 0.0)

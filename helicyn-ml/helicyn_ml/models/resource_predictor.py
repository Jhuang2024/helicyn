"""ResourcePredictor: predicts actual CPU/GPU/memory usage from requests and
workload metadata. Trains one model per target that has real (non-null)
label coverage in the training data; targets without coverage are skipped
with an explicit warning rather than trained on garbage.
"""
from __future__ import annotations

from typing import Dict, List

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from helicyn_ml.models.base import TabularModel

MODEL_NAME = "resource_predictor"

TARGETS = ["cpu_usage", "memory_usage_gb", "gpu_usage", "gpu_memory_usage_gb"]

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

MIN_LABEL_COVERAGE = 0.05  # skip a target if fewer than 5% of rows have a real label


def targets_with_coverage(df: pd.DataFrame) -> Dict[str, float]:
    coverage = {}
    for target in TARGETS:
        if target in df.columns:
            coverage[target] = float(df[target].notna().mean())
        else:
            coverage[target] = 0.0
    return coverage


def build_estimator():
    return HistGradientBoostingRegressor(random_state=42, max_depth=6, max_iter=200)


def build_model(target: str) -> TabularModel:
    return TabularModel(
        estimator=build_estimator(),
        numeric_cols=NUMERIC_FEATURES,
        categorical_cols=CATEGORICAL_FEATURES,
        target_col=target,
        model_type="HistGradientBoostingRegressor",
        task="regression",
    )


def baseline_predict(y_train: pd.Series, n: int) -> np.ndarray:
    return np.full(n, float(y_train.mean()) if len(y_train) else 0.0)

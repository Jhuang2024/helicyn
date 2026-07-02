"""ResourcePredictor: predicts actual CPU/GPU/memory usage.

Two independent training paths, both producing sub-models under this same
MODEL_NAME:

1. Workload-derived targets (TARGETS/NUMERIC_FEATURES/CATEGORICAL_FEATURES
   below): predicts usage from job requests + metadata in
   NormalizedWorkloadRecord data. Trains one model per target that has real
   (non-null) label coverage; targets without coverage are skipped with an
   explicit warning rather than trained on garbage. In practice, public
   request-only traces (e.g. BurstGPT) provide 0% coverage here.

2. Resource-timeseries targets (RESOURCE_TARGETS/RESOURCE_NUMERIC_FEATURES/
   RESOURCE_CATEGORICAL_FEATURES): predicts real CPU/memory utilization
   percentages from NormalizedResourceTimeseriesRecord data (e.g.
   google-cluster-cpu-memory-preprocessed, azure-cpu-usage-small) using
   lag/rolling/cyclic-time features. This is the primary path when workload
   usage labels are unavailable - see training/train_resource_predictor.py.

Neither path ever fabricates a GPU target from this data: no resource
dataset currently supported reports GPU usage, so no GPU target exists in
RESOURCE_TARGETS, and RESOURCE_TARGETS is never filled with a zero default.
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

# Real/preprocessed CPU & memory utilization time-series targets. Deliberately
# no GPU entry - see module docstring.
RESOURCE_TARGETS = [
    "cpu_usage_percent",
    "memory_usage_percent",
    "avg_cpu_usage_percent",
    "min_cpu_usage_percent",
    "max_cpu_usage_percent",
]
RESOURCE_NUMERIC_FEATURES = [
    "time_index",
    "interval_minutes",
    "lag_cpu_usage_percent_1",
    "lag_cpu_usage_percent_4",
    "lag_cpu_usage_percent_12",
    "lag_memory_usage_percent_1",
    "lag_memory_usage_percent_4",
    "lag_memory_usage_percent_12",
    "rolling_cpu_usage_percent_1h",
    "rolling_memory_usage_percent_1h",
    "time_sin",
    "time_cos",
]
RESOURCE_CATEGORICAL_FEATURES = ["source_dataset", "vm_id_bucket"]

MIN_LABEL_COVERAGE = 0.05  # skip a workload-derived target if fewer than 5% of rows have a real label

# Resource-timeseries targets are gated on an ABSOLUTE row count instead of a
# percentage of the combined resources table. Different resource datasets
# report disjoint targets by design (google-cluster-cpu-memory-preprocessed
# only has cpu/memory_usage_percent; azure-cpu-usage-small only has
# avg/min/max_cpu_usage_percent) - a target's real coverage can be diluted
# to a few percent simply because one dataset is much larger than another,
# even though the smaller dataset alone has plenty of real rows for that
# target. A percentage gate would incorrectly skip a perfectly trainable
# target in that case.
MIN_RESOURCE_TARGET_ROWS = 200


def targets_with_coverage(df: pd.DataFrame) -> Dict[str, float]:
    coverage = {}
    for target in TARGETS:
        if target in df.columns:
            coverage[target] = float(df[target].notna().mean())
        else:
            coverage[target] = 0.0
    return coverage


def resource_targets_with_coverage(df: pd.DataFrame) -> Dict[str, float]:
    coverage = {}
    for target in RESOURCE_TARGETS:
        if target in df.columns:
            coverage[target] = float(df[target].notna().mean())
        else:
            coverage[target] = 0.0
    return coverage


def resource_targets_with_row_counts(df: pd.DataFrame) -> Dict[str, int]:
    counts = {}
    for target in RESOURCE_TARGETS:
        counts[target] = int(df[target].notna().sum()) if target in df.columns else 0
    return counts


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


def build_resource_model(target: str) -> TabularModel:
    return TabularModel(
        estimator=build_estimator(),
        numeric_cols=RESOURCE_NUMERIC_FEATURES,
        categorical_cols=RESOURCE_CATEGORICAL_FEATURES,
        target_col=target,
        model_type="HistGradientBoostingRegressor",
        task="regression",
    )


def baseline_predict(y_train: pd.Series, n: int) -> np.ndarray:
    return np.full(n, float(y_train.mean()) if len(y_train) else 0.0)

"""PowerPredictor: predicts power_kw from utilization signals.

Trains a real regressor ONLY when a NormalizedPowerRecord dataset with
actual measured power_kw is available (e.g. scaleout-power, or a real
dataset the user places under data/raw). If no real power dataset is
available, this module exposes an ANALYTICAL FALLBACK model instead of
silently fabricating a "trained" model - the model card and metadata must
say analytical_fallback=True in that case so nobody mistakes it for a
learned model backed by real measurements.
"""
from __future__ import annotations

from typing import List

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from helicyn_ml.models.base import TabularModel

MODEL_NAME = "power_predictor"
TARGET = "power_kw"

NUMERIC_FEATURES = ["cpu_usage", "gpu_usage", "memory_usage", "network_usage", "ambient_temp_c"]
CATEGORICAL_FEATURES = ["source_dataset"]

# Coefficients for the analytical fallback: power = idle + a*cpu + b*gpu + c*max(0, ambient-20).
# These are illustrative engineering assumptions, not measured/fitted constants.
ANALYTICAL_FALLBACK_COEFFICIENTS = {
    "idle_kw": 0.5,
    "cpu_coefficient_kw": 1.5,
    "gpu_coefficient_kw": 2.5,
    "thermal_coefficient_kw_per_c": 0.01,
    "thermal_baseline_c": 20.0,
}


def build_estimator():
    return HistGradientBoostingRegressor(random_state=42, max_depth=5, max_iter=150)


def build_model() -> TabularModel:
    return TabularModel(
        estimator=build_estimator(),
        numeric_cols=NUMERIC_FEATURES,
        categorical_cols=CATEGORICAL_FEATURES,
        target_col=TARGET,
        model_type="HistGradientBoostingRegressor",
        task="regression",
    )


def analytical_fallback_predict(df: pd.DataFrame) -> np.ndarray:
    c = ANALYTICAL_FALLBACK_COEFFICIENTS
    cpu = pd.to_numeric(df.get("cpu_usage"), errors="coerce").fillna(0)
    gpu = pd.to_numeric(df.get("gpu_usage"), errors="coerce").fillna(0)
    ambient = pd.to_numeric(df.get("ambient_temp_c"), errors="coerce").fillna(c["thermal_baseline_c"])
    thermal_excess = (ambient - c["thermal_baseline_c"]).clip(lower=0)
    return (
        c["idle_kw"]
        + c["cpu_coefficient_kw"] * cpu
        + c["gpu_coefficient_kw"] * gpu
        + c["thermal_coefficient_kw_per_c"] * thermal_excess
    ).to_numpy()

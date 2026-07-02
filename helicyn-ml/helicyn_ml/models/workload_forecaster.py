"""WorkloadForecaster: predicts near-future arrival counts and resource
demand from rolling/lag features. Trains one HistGradientBoostingRegressor
per target (multi-output regression is avoided in favor of simple,
inspectable per-target models).
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from helicyn_ml.models.base import TabularModel
from helicyn_ml.preprocessing.feature_engineering import feature_columns_workload

MODEL_NAME = "workload_forecaster"

TARGETS = [
    "arrivals_next_15m",
    "arrivals_next_1h",
    "cpu_demand_next_15m",
    "gpu_demand_next_15m",
    "memory_demand_next_15m",
    "input_tokens_next_15m",
    "output_tokens_next_15m",
]

_NUMERIC_FEATURES = [
    "hour_of_day",
    "day_of_week",
    "is_weekend",
    "minute_of_hour",
    "rolling_arrival_count_15m",
    "rolling_arrival_count_1h",
    "rolling_cpu_request_15m",
    "rolling_gpu_request_15m",
    "rolling_memory_request_15m",
    "rolling_input_tokens_15m",
    "rolling_output_tokens_15m",
    "lag_cpu_request_1",
    "lag_gpu_request_1",
    "lag_arrivals_1",
    "lag_arrivals_4",
    "lag_arrivals_12",
    "lag_arrivals_24",
]
_CATEGORICAL_FEATURES = ["source_dataset", "workload_type"]


def build_targets(df: pd.DataFrame) -> pd.DataFrame:
    """Construct forward-looking targets via per-dataset time-shifted rolling
    sums, then shift back so each row's target reflects demand AFTER its
    timestamp (label leakage would occur if we used the same-direction
    rolling window used for input features).
    """
    df = df.sort_values(["source_dataset", "timestamp"]).reset_index(drop=True)
    out = df.copy()
    for target in TARGETS:
        out[target] = np.nan

    for _, group in df.groupby("source_dataset"):
        g = group.sort_values("timestamp").set_index("timestamp")
        one = pd.Series(1.0, index=g.index)
        cpu = pd.to_numeric(g.get("cpu_request"), errors="coerce").fillna(0)
        gpu = pd.to_numeric(g.get("gpu_request"), errors="coerce").fillna(0)
        mem = pd.to_numeric(g.get("memory_request_gb"), errors="coerce").fillna(0)
        itok = pd.to_numeric(g.get("input_tokens"), errors="coerce").fillna(0)
        otok = pd.to_numeric(g.get("output_tokens"), errors="coerce").fillna(0)

        def future_sum(series: pd.Series, window: str) -> pd.Series:
            # reverse time, rolling-sum, reverse back == forward-looking window sum
            rev = series.iloc[::-1]
            rolled = rev.rolling(window).sum().iloc[::-1]
            return rolled

        vals = {
            "arrivals_next_15m": future_sum(one, "15min"),
            "arrivals_next_1h": future_sum(one, "60min"),
            "cpu_demand_next_15m": future_sum(cpu, "15min"),
            "gpu_demand_next_15m": future_sum(gpu, "15min"),
            "memory_demand_next_15m": future_sum(mem, "15min"),
            "input_tokens_next_15m": future_sum(itok, "15min"),
            "output_tokens_next_15m": future_sum(otok, "15min"),
        }
        idx = group.sort_values("timestamp").index
        for target, series in vals.items():
            out.loc[idx, target] = series.values
    return out


def build_estimator():
    return HistGradientBoostingRegressor(random_state=42, max_depth=6, max_iter=200)


def numeric_features() -> List[str]:
    return _NUMERIC_FEATURES


def categorical_features() -> List[str]:
    return _CATEGORICAL_FEATURES


def build_model(target: str) -> TabularModel:
    return TabularModel(
        estimator=build_estimator(),
        numeric_cols=_NUMERIC_FEATURES,
        categorical_cols=_CATEGORICAL_FEATURES,
        target_col=target,
        model_type="HistGradientBoostingRegressor",
        task="regression",
    )


def baseline_predict(y_train: pd.Series, n: int) -> np.ndarray:
    """Mean-predictor baseline used to compute skill scores."""
    return np.full(n, float(y_train.mean()) if len(y_train) else 0.0)


def save_all(models: Dict[str, TabularModel], out_dir: Path, shared_metadata: Optional[dict] = None) -> None:
    for target, model in models.items():
        model.save(out_dir / target, extra_metadata=shared_metadata)


def load_all(out_dir: Path) -> Dict[str, TabularModel]:
    out_dir = Path(out_dir)
    models = {}
    for target in TARGETS:
        target_dir = out_dir / target
        if (target_dir / "model.joblib").exists():
            models[target] = TabularModel.load(target_dir)
    return models

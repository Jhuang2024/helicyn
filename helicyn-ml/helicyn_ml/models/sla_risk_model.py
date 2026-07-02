"""SLARiskModel: predicts probability of a deadline miss.

Public workload traces do not carry ground-truth SLA/deadline-miss labels.
This module implements WEAK-LABEL training: a synthetic deadline is derived
from arrival_time + duration_seconds * class_multiplier (multiplier reflects
how much slack a workload class typically tolerates), and a queueing-delay
simulation over the same fixed-capacity queue determines whether that
synthetic deadline would have been missed. These are NOT real operator SLA
outcomes - see docs/limitations.md and the model card for this model.
"""
from __future__ import annotations

from typing import List

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

from helicyn_ml.models.base import TabularModel

MODEL_NAME = "sla_risk_model"
TARGET = "deadline_miss"

CLASS_MULTIPLIERS = {
    "llm_inference": 1.2,
    "lmm_inference": 1.2,
    "online_service": 1.5,
    "vm": 3.0,
    "serverless": 1.5,
    "gpu_inference": 1.3,
    "gpu_training": 8.0,
    "batch": 12.0,
    "cpu_batch": 12.0,
    "unknown": 6.0,
}

NUMERIC_FEATURES = [
    "cpu_request",
    "memory_request_gb",
    "gpu_request",
    "input_tokens",
    "output_tokens",
    "priority",
    "hour_of_day",
    "day_of_week",
    "is_weekend",
    "rolling_arrival_count_15m",
]
CATEGORICAL_FEATURES = ["workload_type", "source_dataset"]


def generate_weak_labels(df: pd.DataFrame, queue_capacity: int = 8, seed: int = 42) -> pd.DataFrame:
    """Simulates a simple fixed-capacity FIFO-per-machine queue per
    source_dataset to derive a weak deadline_miss label. This is a
    simplifying approximation of real scheduling delay, not a real
    scheduler replay.
    """
    df = df.copy()
    df["duration_seconds"] = pd.to_numeric(df.get("duration_seconds"), errors="coerce")
    df["duration_seconds"] = df["duration_seconds"].fillna(df["duration_seconds"].median() if df["duration_seconds"].notna().any() else 60.0)
    df["class_multiplier"] = df["workload_type"].map(CLASS_MULTIPLIERS).fillna(6.0)
    df["synthetic_deadline_seconds"] = df["duration_seconds"] * df["class_multiplier"]

    out_frames = []
    for _, group in df.groupby("source_dataset"):
        g = group.sort_values("arrival_time").reset_index(drop=True)
        server_free_at = np.zeros(queue_capacity)
        actual_completion = np.zeros(len(g))
        arrival_seconds = pd.to_datetime(g["arrival_time"], utc=True).astype("int64") / 1e9
        for i in range(len(g)):
            slot = int(np.argmin(server_free_at))
            start = max(arrival_seconds.iloc[i], server_free_at[slot])
            finish = start + g["duration_seconds"].iloc[i]
            server_free_at[slot] = finish
            actual_completion[i] = finish
        g["queue_delay_seconds"] = actual_completion - arrival_seconds.values - g["duration_seconds"].values
        g["queue_delay_seconds"] = g["queue_delay_seconds"].clip(lower=0)
        g["deadline_miss"] = (g["queue_delay_seconds"] > (g["synthetic_deadline_seconds"] - g["duration_seconds"])).astype(int)
        out_frames.append(g)
    return pd.concat(out_frames, ignore_index=True)


def build_estimator():
    return HistGradientBoostingClassifier(random_state=42, max_depth=6, max_iter=200)


def build_model() -> TabularModel:
    return TabularModel(
        estimator=build_estimator(),
        numeric_cols=NUMERIC_FEATURES,
        categorical_cols=CATEGORICAL_FEATURES,
        target_col=TARGET,
        model_type="HistGradientBoostingClassifier",
        task="classification",
    )

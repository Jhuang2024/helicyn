from __future__ import annotations

from typing import List

import numpy as np
import pandas as pd

from helicyn_ml.utils.time import add_time_features

_JOB_SIZE_BINS = [-np.inf, 1, 4, 16, np.inf]
_JOB_SIZE_LABELS = ["xs", "small", "medium", "large"]


def _rolling_per_group(df: pd.DataFrame, group_col: str, value_col: str, window: str, agg: str) -> pd.Series:
    """Time-windowed rolling aggregate computed independently within each
    group (source_dataset), then re-aligned to the original row order.
    """
    if value_col not in df.columns:
        return pd.Series(np.nan, index=df.index)

    out = pd.Series(np.nan, index=df.index, dtype=float)
    for _, group in df.groupby(group_col, sort=False):
        g = group.sort_values("timestamp").set_index("timestamp")
        series = pd.to_numeric(g[value_col], errors="coerce").fillna(0)
        if agg == "count":
            rolled = series.rolling(window).count()
        else:
            rolled = series.rolling(window).agg(agg)
        rolled.index = group.sort_values("timestamp").index
        out.loc[rolled.index] = rolled.values
    return out


def build_workload_features(df: pd.DataFrame) -> pd.DataFrame:
    """Features for the workload forecaster and as inputs shared by other
    models. Assumes NormalizedWorkloadRecord-shaped columns.
    """
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = add_time_features(df, "timestamp")
    df = df.sort_values(["source_dataset", "timestamp"]).reset_index(drop=True)

    group_col = "source_dataset" if "source_dataset" in df.columns else None
    if group_col is None:
        df["_grp"] = "all"
        group_col = "_grp"

    df["_one"] = 1.0
    df["rolling_arrival_count_15m"] = _rolling_per_group(df, group_col, "_one", "15min", "sum")
    df["rolling_arrival_count_1h"] = _rolling_per_group(df, group_col, "_one", "60min", "sum")
    df["rolling_cpu_request_15m"] = _rolling_per_group(df, group_col, "cpu_request", "15min", "sum")
    df["rolling_gpu_request_15m"] = _rolling_per_group(df, group_col, "gpu_request", "15min", "sum")
    df["rolling_memory_request_15m"] = _rolling_per_group(df, group_col, "memory_request_gb", "15min", "sum")
    df["rolling_input_tokens_15m"] = _rolling_per_group(df, group_col, "input_tokens", "15min", "sum")
    df["rolling_output_tokens_15m"] = _rolling_per_group(df, group_col, "output_tokens", "15min", "sum")
    df.drop(columns=["_one"], inplace=True)
    if "_grp" in df.columns:
        df.drop(columns=["_grp"], inplace=True)

    for col in ["cpu_request", "gpu_request"]:
        if col in df.columns:
            df[f"lag_{col}_1"] = df.groupby("source_dataset")[col].shift(1) if "source_dataset" in df.columns else df[col].shift(1)

    df["_arrivals_bucket"] = 1.0
    arrivals_grp = df.groupby("source_dataset")["_arrivals_bucket"] if "source_dataset" in df.columns else [(None, df["_arrivals_bucket"])]
    for lag in (1, 4, 12, 24):
        if "source_dataset" in df.columns:
            df[f"lag_arrivals_{lag}"] = df.groupby("source_dataset")["_arrivals_bucket"].shift(lag).fillna(0)
        else:
            df[f"lag_arrivals_{lag}"] = df["_arrivals_bucket"].shift(lag).fillna(0)
    df.drop(columns=["_arrivals_bucket"], inplace=True)

    df["job_size_bucket"] = pd.cut(
        df["cpu_request"].fillna(0) if "cpu_request" in df.columns else pd.Series(0, index=df.index),
        bins=_JOB_SIZE_BINS,
        labels=_JOB_SIZE_LABELS,
    ).astype(str)

    if "latency_sensitive" in df.columns:
        df["latency_sensitive"] = df["latency_sensitive"].fillna(False).astype(bool)
    if "preemptible" in df.columns:
        df["preemptible"] = df["preemptible"].fillna(False).astype(bool)

    return df


def build_runtime_resource_features(df: pd.DataFrame) -> pd.DataFrame:
    """Static per-row features for the runtime predictor and resource
    predictor - no rolling windows, since these predict per-job outcomes
    from job metadata known at submission time.
    """
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = add_time_features(df, "timestamp")
    for col in ["priority"]:
        if col in df.columns:
            df[col] = df[col].fillna(df[col].median() if df[col].notna().any() else 0)
    if "scheduling_class" in df.columns:
        df["scheduling_class"] = df["scheduling_class"].fillna("unknown").astype(str)
    return df


def build_grid_weather_features(grid_df: pd.DataFrame, weather_df: pd.DataFrame) -> pd.DataFrame:
    """Merge grid + weather on (region, hour) and add rolling/time features."""
    g = grid_df.copy()
    w = weather_df.copy()
    g["timestamp"] = pd.to_datetime(g["timestamp"], utc=True)
    if not w.empty:
        w["timestamp"] = pd.to_datetime(w["timestamp"], utc=True)
        merged = pd.merge_asof(
            g.sort_values("timestamp"),
            w.sort_values("timestamp")[["timestamp", "region", "ambient_temp_c", "relative_humidity", "wet_bulb_temp_c"]],
            on="timestamp",
            by="region",
            direction="nearest",
            tolerance=pd.Timedelta("3h"),
        )
    else:
        merged = g
        for col in ["ambient_temp_c", "relative_humidity", "wet_bulb_temp_c"]:
            merged[col] = np.nan

    merged = add_time_features(merged, "timestamp")
    merged = merged.sort_values(["region", "timestamp"]).reset_index(drop=True)

    for src_col, out_col in [
        ("carbon_intensity_gco2e_per_kwh", "rolling_carbon_1h"),
        ("electricity_price_usd_per_mwh", "rolling_price_1h"),
        ("ambient_temp_c", "rolling_temp_1h"),
    ]:
        if src_col in merged.columns:
            merged[out_col] = _rolling_per_group(merged, "region", src_col, "60min", "mean")
        else:
            merged[out_col] = np.nan

    return merged


def feature_columns_workload() -> List[str]:
    return [
        "hour_of_day",
        "day_of_week",
        "is_weekend",
        "minute_of_hour",
        "source_dataset",
        "workload_type",
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


def feature_columns_runtime_resource() -> List[str]:
    return [
        "workload_type",
        "cpu_request",
        "memory_request_gb",
        "gpu_request",
        "gpu_memory_request_gb",
        "input_tokens",
        "output_tokens",
        "priority",
        "scheduling_class",
        "source_dataset",
        "hour_of_day",
        "day_of_week",
        "is_weekend",
    ]


_RESOURCE_LAG_STEPS = (1, 4, 12)
_STEPS_PER_DAY_5MIN = 288  # 24h * 60 / 5-minute interval, per NormalizedResourceTimeseriesRecord


def _vm_id_bucket(vm_id: pd.Series, n_buckets: int = 64) -> pd.Series:
    """Deterministic low-cardinality hash bucket for vm_id (there can be
    thousands of distinct VMs - a raw one-hot over vm_id itself would blow
    up the categorical feature space for no real benefit). Uses a stable
    hash (not Python's randomized str hash) so buckets are reproducible
    across runs/processes.
    """
    import hashlib

    def bucket(v) -> str:
        digest = hashlib.md5(str(v).encode("utf-8")).hexdigest()
        return f"bucket_{int(digest, 16) % n_buckets}"

    return vm_id.fillna("unknown").astype(str).map(bucket)


def build_resource_features(df: pd.DataFrame) -> pd.DataFrame:
    """Features for ResourcePredictor when trained on
    NormalizedResourceTimeseriesRecord data (real/preprocessed CPU/memory
    utilization traces) rather than workload request/usage columns.
    Lag/rolling features are computed strictly within each
    (source_dataset, vm_id) group so one VM's history never leaks into
    another VM's features, and never across the train/val/test split
    boundary (features are built per-split, after splitting - see
    training/train_resource_predictor.py).
    """
    df = df.copy()
    group_cols = [c for c in ("source_dataset", "vm_id") if c in df.columns]
    sort_col = "time_index" if "time_index" in df.columns else None
    if sort_col:
        df = df.sort_values(group_cols + [sort_col]).reset_index(drop=True)

    grouped = df.groupby(group_cols) if group_cols else None
    for col in ("cpu_usage_percent", "memory_usage_percent"):
        if col not in df.columns:
            df[col] = np.nan
        for lag in _RESOURCE_LAG_STEPS:
            df[f"lag_{col}_{lag}"] = grouped[col].shift(lag) if grouped is not None else df[col].shift(lag)
        rolling = (
            grouped[col].transform(lambda s: s.rolling(12, min_periods=1).mean())
            if grouped is not None
            else df[col].rolling(12, min_periods=1).mean()
        )
        df[f"rolling_{col}_1h"] = rolling

    time_index = pd.to_numeric(df.get("time_index"), errors="coerce").fillna(0)
    cycle_pos = (time_index % _STEPS_PER_DAY_5MIN) / _STEPS_PER_DAY_5MIN * 2 * np.pi
    df["time_sin"] = np.sin(cycle_pos)
    df["time_cos"] = np.cos(cycle_pos)

    df["vm_id_bucket"] = _vm_id_bucket(df["vm_id"]) if "vm_id" in df.columns else "unknown"

    return df


def resource_persistence_baseline(df: pd.DataFrame, target_col: str) -> pd.Series:
    """y_hat = previous value of the same target, within the same
    (source_dataset, vm_id) group, in time_index order. The standard
    baseline for time-series regression - a model that can't beat "predict
    the last observed value" has learned nothing useful.
    """
    group_cols = [c for c in ("source_dataset", "vm_id") if c in df.columns]
    if not group_cols:
        return df[target_col].shift(1)
    return df.groupby(group_cols)[target_col].shift(1)


def resource_feature_columns() -> List[str]:
    numeric = (
        ["time_index", "interval_minutes"]
        + [f"lag_cpu_usage_percent_{lag}" for lag in _RESOURCE_LAG_STEPS]
        + [f"lag_memory_usage_percent_{lag}" for lag in _RESOURCE_LAG_STEPS]
        + ["rolling_cpu_usage_percent_1h", "rolling_memory_usage_percent_1h", "time_sin", "time_cos"]
    )
    categorical = ["source_dataset", "vm_id_bucket"]
    return numeric + categorical

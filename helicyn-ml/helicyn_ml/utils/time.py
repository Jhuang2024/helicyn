from datetime import datetime, timezone

import numpy as np
import pandas as pd


def to_utc(ts) -> pd.Timestamp:
    t = pd.Timestamp(ts)
    if t.tzinfo is None:
        return t.tz_localize("UTC")
    return t.tz_convert("UTC")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def add_time_features(df: pd.DataFrame, ts_col: str = "timestamp") -> pd.DataFrame:
    """Add calendar-derived features used by every model that consumes time series."""
    df = df.copy()
    ts = pd.to_datetime(df[ts_col], utc=True)
    df["hour_of_day"] = ts.dt.hour
    df["minute_of_hour"] = ts.dt.minute
    df["day_of_week"] = ts.dt.dayofweek
    df["is_weekend"] = (ts.dt.dayofweek >= 5).astype(int)
    return df

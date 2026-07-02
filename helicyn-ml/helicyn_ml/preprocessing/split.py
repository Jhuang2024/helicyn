from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

import pandas as pd

from helicyn_ml.utils.io import ensure_dir, load_parquet, save_json, save_parquet
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

DEFAULT_RATIOS = (0.70, 0.15, 0.15)


def _load_all_parquet(directory: Path) -> pd.DataFrame:
    directory = Path(directory)
    if not directory.exists():
        return pd.DataFrame()
    files = sorted(directory.glob("*.parquet"))
    if not files:
        return pd.DataFrame()
    frames = [load_parquet(f) for f in files]
    return pd.concat(frames, ignore_index=True)


def time_split(df: pd.DataFrame, ratios=DEFAULT_RATIOS, group_col: str = "source_dataset") -> Dict[str, pd.DataFrame]:
    """Time-ordered split done *within each source_dataset* (traces are not
    i.i.d., and different datasets have unrelated calendar ranges - a global
    timestamp split would leak/mix unrelated epochs together). Each dataset's
    own timeline is split 70/15/15 in chronological order, then the pieces
    are concatenated across datasets.
    """
    if df.empty:
        return {"train": df, "val": df, "test": df}

    train_parts, val_parts, test_parts = [], [], []
    group_iter = df.groupby(group_col) if group_col in df.columns else [(None, df)]
    for _, group in group_iter:
        group = group.sort_values("timestamp").reset_index(drop=True)
        n = len(group)
        n_train = int(n * ratios[0])
        n_val = int(n * (ratios[0] + ratios[1])) - n_train
        train_parts.append(group.iloc[:n_train])
        val_parts.append(group.iloc[n_train : n_train + n_val])
        test_parts.append(group.iloc[n_train + n_val :])

    def concat(parts):
        parts = [p for p in parts if len(p)]
        if not parts:
            return df.iloc[0:0]
        return pd.concat(parts, ignore_index=True).sort_values("timestamp").reset_index(drop=True)

    return {"train": concat(train_parts), "val": concat(val_parts), "test": concat(test_parts)}


def _range_str(df: pd.DataFrame) -> Optional[str]:
    if df.empty or "timestamp" not in df.columns:
        return None
    return f"{df['timestamp'].min()} -> {df['timestamp'].max()}"


def run_split(
    workloads_dir: Path,
    grid_dir: Path,
    weather_dir: Path,
    power_dir: Path,
    out_dir: Path,
    ratios=DEFAULT_RATIOS,
) -> Dict:
    out_dir = Path(out_dir)
    sources = {
        "workloads": _load_all_parquet(workloads_dir),
        "grid": _load_all_parquet(grid_dir),
        "weather": _load_all_parquet(weather_dir),
        "power": _load_all_parquet(power_dir),
    }

    split_summary = {"ratios": {"train": ratios[0], "val": ratios[1], "test": ratios[2]}}
    dataset_summary = {}

    for kind, df in sources.items():
        if df.empty:
            logger.warning(f"[split] no processed {kind} data found; skipping.")
            split_summary[kind] = {"status": "missing", "n_records": 0}
            continue

        splits = time_split(df, ratios=ratios)
        for split_name, split_df in splits.items():
            ensure_dir(out_dir / split_name)
            save_parquet(split_df, out_dir / split_name / f"{kind}.parquet")

        split_summary[kind] = {
            "status": "ok",
            "n_records": int(len(df)),
            "train_n": int(len(splits["train"])),
            "val_n": int(len(splits["val"])),
            "test_n": int(len(splits["test"])),
            "train_range": _range_str(splits["train"]),
            "val_range": _range_str(splits["val"]),
            "test_range": _range_str(splits["test"]),
        }
        if "source_dataset" in df.columns:
            dataset_summary[kind] = df["source_dataset"].value_counts().to_dict()

    save_json(split_summary, out_dir / "split_summary.json")
    save_json(dataset_summary, out_dir / "dataset_summary.json")
    return split_summary

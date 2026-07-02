"""Diagnostics for the PolicyRanker training table.

A regressor with near-zero R^2 and identical val/test metrics is usually a
sign that the training table has collapsed to a small number of duplicate
feature vectors rather than a real modeling failure. These functions make
that visible and checkable in a test, instead of guessing from metrics
alone.
"""
from __future__ import annotations

from typing import Dict, List

import numpy as np
import pandas as pd


def feature_variance_report(df: pd.DataFrame, numeric_cols: List[str]) -> Dict[str, Dict]:
    report = {}
    for col in numeric_cols:
        if col not in df.columns:
            report[col] = {"present": False}
            continue
        series = pd.to_numeric(df[col], errors="coerce")
        std = float(series.std()) if series.notna().any() else None
        report[col] = {
            "present": True,
            "std": std,
            "mean": float(series.mean()) if series.notna().any() else None,
            "nunique": int(series.nunique(dropna=True)),
            "n": int(series.notna().sum()),
            "is_constant": bool(series.nunique(dropna=True) <= 1),
        }
    return report


def target_variance_report(df: pd.DataFrame, target_col: str) -> Dict:
    if target_col not in df.columns or df.empty:
        return {"present": False}
    series = pd.to_numeric(df[target_col], errors="coerce")
    return {
        "present": True,
        "std": float(series.std()) if series.notna().any() else None,
        "mean": float(series.mean()) if series.notna().any() else None,
        "min": float(series.min()) if series.notna().any() else None,
        "max": float(series.max()) if series.notna().any() else None,
        "nunique": int(series.nunique(dropna=True)),
        "n": int(len(series)),
        "is_constant": bool(series.nunique(dropna=True) <= 1),
    }


def duplicate_row_percentage(df: pd.DataFrame, cols: List[str]) -> float:
    present = [c for c in cols if c in df.columns]
    if not present or df.empty:
        return 0.0
    n_unique = len(df[present].drop_duplicates())
    return float(1.0 - n_unique / len(df))


def distribution_comparison(
    train_df: pd.DataFrame, val_df: pd.DataFrame, test_df: pd.DataFrame, numeric_cols: List[str]
) -> Dict[str, Dict]:
    out = {}
    for col in numeric_cols:
        entry = {}
        for name, split_df in [("train", train_df), ("val", val_df), ("test", test_df)]:
            if col not in split_df.columns or split_df.empty:
                entry[name] = None
                continue
            series = pd.to_numeric(split_df[col], errors="coerce")
            entry[name] = {
                "mean": float(series.mean()) if series.notna().any() else None,
                "std": float(series.std()) if series.notna().any() else None,
            }
        out[col] = entry
    return out


def action_distribution(df: pd.DataFrame) -> Dict:
    out = {}
    if "action_type" in df.columns:
        out["action_type"] = df["action_type"].value_counts(dropna=False).to_dict()
    if "dvfs_state" in df.columns:
        # dvfs_state isn't a policy_ranker feature column directly (action_type covers
        # "change_dvfs"), but candidate_generation still varies it - report if present.
        out["dvfs_state"] = df["dvfs_state"].value_counts(dropna=False).to_dict()
    if "delay_minutes" in df.columns:
        out["delay_minutes"] = pd.to_numeric(df["delay_minutes"], errors="coerce").value_counts(dropna=False).to_dict()
    return out


def build_policy_ranker_diagnostics(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    test_df: pd.DataFrame,
    numeric_cols: List[str],
    categorical_cols: List[str],
    target_col: str,
) -> Dict:
    feature_cols = numeric_cols + categorical_cols
    constant_features = [
        col
        for col, stats in feature_variance_report(train_df, numeric_cols).items()
        if stats.get("is_constant")
    ]
    return {
        "train_n": int(len(train_df)),
        "val_n": int(len(val_df)),
        "test_n": int(len(test_df)),
        "feature_variance_train": feature_variance_report(train_df, numeric_cols),
        "target_variance_train": target_variance_report(train_df, target_col),
        "target_variance_val": target_variance_report(val_df, target_col),
        "target_variance_test": target_variance_report(test_df, target_col),
        "constant_numeric_features_in_train": constant_features,
        "duplicate_row_percentage_train": duplicate_row_percentage(train_df, feature_cols),
        "duplicate_row_percentage_val": duplicate_row_percentage(val_df, feature_cols),
        "duplicate_row_percentage_test": duplicate_row_percentage(test_df, feature_cols),
        "train_val_test_distribution": distribution_comparison(train_df, val_df, test_df, numeric_cols),
        "action_distribution_train": action_distribution(train_df),
        "warnings": _build_warnings(train_df, numeric_cols, constant_features),
    }


def _build_warnings(train_df: pd.DataFrame, numeric_cols: List[str], constant_features: List[str]) -> List[str]:
    warnings = []
    if constant_features:
        warnings.append(
            f"{len(constant_features)}/{len(numeric_cols)} numeric features are constant across the training "
            f"table: {constant_features}. The model has no signal from these and effectively predicts from the "
            "remaining features only."
        )
    dup_pct = duplicate_row_percentage(train_df, numeric_cols)
    if dup_pct > 0.5:
        warnings.append(
            f"{dup_pct:.0%} of training rows are exact duplicates on feature columns - the ranker is "
            "effectively fitting a small lookup table, not learning from job-level diversity."
        )
    return warnings

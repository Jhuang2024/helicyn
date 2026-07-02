from typing import Dict, Optional

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    mean_absolute_error,
    median_absolute_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)


def regression_metrics(y_true, y_pred, baseline_pred: Optional[np.ndarray] = None) -> Dict[str, float]:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)

    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))
    med_ae = float(median_absolute_error(y_true, y_pred))
    p90_ae = float(np.percentile(np.abs(y_true - y_pred), 90))

    nonzero = y_true != 0
    mape = float(np.mean(np.abs((y_true[nonzero] - y_pred[nonzero]) / y_true[nonzero])) * 100) if nonzero.any() else None

    r2 = float(r2_score(y_true, y_pred)) if len(np.unique(y_true)) > 1 else None

    out = {
        "mae": mae,
        "rmse": rmse,
        "median_ae": med_ae,
        "p90_ae": p90_ae,
        "mape_pct": mape,
        "r2": r2,
        "n": int(len(y_true)),
    }
    if baseline_pred is not None:
        baseline_pred = np.asarray(baseline_pred, dtype=float)
        out["baseline_mae"] = float(mean_absolute_error(y_true, baseline_pred))
        out["baseline_rmse"] = float(np.sqrt(np.mean((y_true - baseline_pred) ** 2)))
        out["skill_vs_baseline"] = (
            1.0 - mae / out["baseline_mae"] if out["baseline_mae"] > 0 else None
        )
        out["beats_baseline"] = bool(out["skill_vs_baseline"] is not None and out["skill_vs_baseline"] > 0)
    return out


def classification_metrics(y_true, y_pred, y_proba=None) -> Dict[str, float]:
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    out = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "n": int(len(y_true)),
        "positive_rate": float(np.mean(y_true)),
    }
    if y_proba is not None and len(np.unique(y_true)) > 1:
        out["roc_auc"] = float(roc_auc_score(y_true, y_proba))
    else:
        out["roc_auc"] = None
    return out

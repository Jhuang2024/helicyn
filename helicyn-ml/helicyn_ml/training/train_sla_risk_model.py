from __future__ import annotations

import shutil
from pathlib import Path
from typing import Dict

import pandas as pd

from helicyn_ml.config import EVAL_DIR, MODELS_DIR, SPLITS_DIR
from helicyn_ml.models import sla_risk_model as sla
from helicyn_ml.preprocessing.feature_engineering import build_workload_features
from helicyn_ml.training.card_utils import remove_stale_card, write_model_card
from helicyn_ml.utils.io import ensure_dir, load_parquet, save_json, save_parquet
from helicyn_ml.utils.logging import get_logger
from helicyn_ml.utils.metrics import classification_metrics
from helicyn_ml.utils.seeds import set_all_seeds

logger = get_logger(__name__)

# If the weak-label positive rate falls outside this band, the classifier
# has nothing real to learn (it can hit 99%+ "accuracy" just by predicting
# the majority class) - we refuse to save that as if it were a working
# model. See docs/limitations.md and the SLA risk model card.
DEGENERATE_POSITIVE_RATE_LOW = 0.05
DEGENERATE_POSITIVE_RATE_HIGH = 0.95


def _load_split(splits_dir: Path, split: str) -> pd.DataFrame:
    path = Path(splits_dir) / split / "workloads.parquet"
    if not path.exists():
        return pd.DataFrame()
    return load_parquet(path)


def _clear_stale_model(models_dir: Path) -> None:
    """Removes any previously-saved model.joblib/metadata.json for this
    model so a degenerate run never leaves a stale "trained" artifact
    behind that `status` could mistake for a currently-valid model.
    """
    model_dir = Path(models_dir) / sla.MODEL_NAME
    if model_dir.exists():
        shutil.rmtree(model_dir)


def _save_degenerate_report(eval_out: Path, train: pd.DataFrame, reason: str) -> Dict:
    positive_rate = float(train[sla.TARGET].mean()) if sla.TARGET in train.columns and len(train) else None
    report = {
        "status": "degenerate",
        "reason": reason,
        "train_n": int(len(train)),
        "train_positive_rate": positive_rate,
        "class_counts": train[sla.TARGET].value_counts().to_dict() if sla.TARGET in train.columns else {},
        "thresholds": {
            "low": DEGENERATE_POSITIVE_RATE_LOW,
            "high": DEGENERATE_POSITIVE_RATE_HIGH,
        },
        "explanation": (
            "The weak-label queueing simulation produced a label distribution that is almost entirely "
            "one class. A classifier trained on this would report misleadingly high accuracy while "
            "carrying no real predictive signal (it would just learn to predict the majority class). "
            "No classifier was trained or saved for this run."
        ),
    }
    save_json(report, eval_out / "degenerate_report.json")
    return report


def run(splits_dir: Path = SPLITS_DIR, models_dir: Path = MODELS_DIR, eval_dir: Path = EVAL_DIR, seed: int = 42) -> Dict:
    set_all_seeds(seed)
    model_cards_dir = Path(eval_dir).parent / "reports" / "model_cards"
    train_raw, val_raw, test_raw = (_load_split(splits_dir, s) for s in ("train", "val", "test"))

    if train_raw.empty:
        logger.warning("[sla_risk_model] no training data found; skipping.")
        _clear_stale_model(models_dir)
        remove_stale_card(sla.MODEL_NAME, model_cards_dir)
        return {"status": "skipped", "reason": "no training data"}

    train = sla.generate_weak_labels(build_workload_features(train_raw))
    val = sla.generate_weak_labels(build_workload_features(val_raw)) if not val_raw.empty else pd.DataFrame()
    test = sla.generate_weak_labels(build_workload_features(test_raw)) if not test_raw.empty else pd.DataFrame()

    eval_out = ensure_dir(Path(eval_dir) / sla.MODEL_NAME)
    stale_metrics = eval_out / "metrics.json"
    if stale_metrics.exists():
        stale_metrics.unlink()

    if train[sla.TARGET].nunique() < 2:
        logger.warning("[sla_risk_model] training labels have only one class; skipping.")
        _clear_stale_model(models_dir)
        remove_stale_card(sla.MODEL_NAME, model_cards_dir)
        report = _save_degenerate_report(eval_out, train, "single-class weak labels")
        return {"status": "degenerate", "reason": "single-class weak labels", "diagnostics": report}

    positive_rate = float(train[sla.TARGET].mean())
    if positive_rate > DEGENERATE_POSITIVE_RATE_HIGH or positive_rate < DEGENERATE_POSITIVE_RATE_LOW:
        logger.warning(
            f"[sla_risk_model] weak-label positive rate {positive_rate:.4f} is outside the "
            f"[{DEGENERATE_POSITIVE_RATE_LOW}, {DEGENERATE_POSITIVE_RATE_HIGH}] band - labels are degenerate "
            "(this trace + queueing-simulation combination collapsed to almost one class). "
            "Refusing to train/save a classifier on this; see degenerate_report.json."
        )
        _clear_stale_model(models_dir)
        remove_stale_card(sla.MODEL_NAME, model_cards_dir)
        report = _save_degenerate_report(
            eval_out, train, f"weak-label positive rate {positive_rate:.4f} outside usable band"
        )
        return {"status": "degenerate", "reason": "weak-label positive rate outside usable band", "diagnostics": report}

    out_dir = ensure_dir(Path(models_dir) / sla.MODEL_NAME)

    model = sla.build_model()
    model.fit(train, train[sla.TARGET])

    metrics = {"train_n": int(len(train)), "train_positive_rate": float(train[sla.TARGET].mean())}
    for split_name, split_df in [("val", val), ("test", test)]:
        if split_df.empty:
            continue
        preds = model.predict(split_df)
        proba = model.predict_proba(split_df)
        metrics[split_name] = classification_metrics(split_df[sla.TARGET], preds, proba)
        if split_name == "test":
            pred_df = split_df[["job_id", "timestamp", "source_dataset"]].copy()
            pred_df["actual"] = split_df[sla.TARGET].values
            pred_df["predicted_proba"] = proba
            save_parquet(pred_df, eval_out / "predictions.parquet")

    fi = model.feature_importance()
    if fi is not None:
        fi.to_csv(eval_out / "feature_importance.csv", index=False)

    model.save(out_dir)
    save_json(metrics, eval_out / "metrics.json")

    write_model_card(
        model_cards_dir=model_cards_dir,
        model_name=sla.MODEL_NAME,
        version="v1",
        datasets_used=sorted(train["source_dataset"].unique().tolist()),
        rows_used=int(len(train)),
        features=sla.NUMERIC_FEATURES + sla.CATEGORICAL_FEATURES,
        targets=[sla.TARGET],
        metrics=metrics,
        label_provenance="weak",
        known_limitations=[
            "deadline_miss labels are WEAK LABELS derived from a synthetic deadline "
            "(arrival_time + duration_seconds * class_multiplier) and a simplified fixed-capacity "
            "queueing simulation - they are not real operator-reported SLA outcomes.",
            "class_multiplier values are engineering assumptions, not measured from real SLAs.",
        ],
        intended_use="Prototype SLA-risk signal for the policy ranker and constraint checker; simulator validation required before any operational use.",
        non_intended_use="Must not be used as a real SLA compliance or breach-risk indicator.",
    )
    return {"status": "trained", "metrics": metrics}

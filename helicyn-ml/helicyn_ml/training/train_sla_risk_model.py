from __future__ import annotations

from pathlib import Path
from typing import Dict

import pandas as pd

from helicyn_ml.config import EVAL_DIR, MODELS_DIR, SPLITS_DIR
from helicyn_ml.models import sla_risk_model as sla
from helicyn_ml.preprocessing.feature_engineering import build_workload_features
from helicyn_ml.training.card_utils import write_model_card
from helicyn_ml.utils.io import ensure_dir, load_parquet, save_json, save_parquet
from helicyn_ml.utils.logging import get_logger
from helicyn_ml.utils.metrics import classification_metrics
from helicyn_ml.utils.seeds import set_all_seeds

logger = get_logger(__name__)


def _load_split(splits_dir: Path, split: str) -> pd.DataFrame:
    path = Path(splits_dir) / split / "workloads.parquet"
    if not path.exists():
        return pd.DataFrame()
    return load_parquet(path)


def run(splits_dir: Path = SPLITS_DIR, models_dir: Path = MODELS_DIR, eval_dir: Path = EVAL_DIR, seed: int = 42) -> Dict:
    set_all_seeds(seed)
    train_raw, val_raw, test_raw = (_load_split(splits_dir, s) for s in ("train", "val", "test"))

    if train_raw.empty:
        logger.warning("[sla_risk_model] no training data found; skipping.")
        return {"status": "skipped", "reason": "no training data"}

    train = sla.generate_weak_labels(build_workload_features(train_raw))
    val = sla.generate_weak_labels(build_workload_features(val_raw)) if not val_raw.empty else pd.DataFrame()
    test = sla.generate_weak_labels(build_workload_features(test_raw)) if not test_raw.empty else pd.DataFrame()

    if train[sla.TARGET].nunique() < 2:
        logger.warning("[sla_risk_model] training labels have only one class; skipping.")
        return {"status": "skipped", "reason": "single-class weak labels"}

    out_dir = ensure_dir(Path(models_dir) / sla.MODEL_NAME)
    eval_out = ensure_dir(Path(eval_dir) / sla.MODEL_NAME)

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

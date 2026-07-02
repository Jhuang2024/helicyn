from __future__ import annotations

from pathlib import Path
from typing import Dict

import pandas as pd

from helicyn_ml.config import EVAL_DIR, MODELS_DIR, SPLITS_DIR
from helicyn_ml.models import runtime_predictor as rp
from helicyn_ml.preprocessing.feature_engineering import build_runtime_resource_features
from helicyn_ml.training.card_utils import remove_stale_card, write_model_card
from helicyn_ml.utils.io import ensure_dir, load_parquet, remove_dir_if_exists, save_json, save_parquet
from helicyn_ml.utils.logging import get_logger
from helicyn_ml.utils.metrics import regression_metrics
from helicyn_ml.utils.plotting import plot_pred_vs_actual
from helicyn_ml.utils.seeds import set_all_seeds

logger = get_logger(__name__)


def _load_split(splits_dir: Path, split: str) -> pd.DataFrame:
    path = Path(splits_dir) / split / "workloads.parquet"
    if not path.exists():
        return pd.DataFrame()
    return load_parquet(path)


def run(splits_dir: Path = SPLITS_DIR, models_dir: Path = MODELS_DIR, eval_dir: Path = EVAL_DIR, seed: int = 42) -> Dict:
    set_all_seeds(seed)
    model_cards_dir = Path(eval_dir).parent / "reports" / "model_cards"
    train_raw, val_raw, test_raw = (_load_split(splits_dir, s) for s in ("train", "val", "test"))

    if train_raw.empty:
        logger.warning("[runtime_predictor] no training data found; skipping.")
        remove_dir_if_exists(Path(models_dir) / rp.MODEL_NAME)
        remove_dir_if_exists(Path(eval_dir) / rp.MODEL_NAME)
        remove_stale_card(rp.MODEL_NAME, model_cards_dir)
        return {"status": "skipped", "reason": "no training data"}

    train = rp.usable_rows(build_runtime_resource_features(train_raw))
    val = rp.usable_rows(build_runtime_resource_features(val_raw)) if not val_raw.empty else pd.DataFrame()
    test = rp.usable_rows(build_runtime_resource_features(test_raw)) if not test_raw.empty else pd.DataFrame()

    if len(train) < 20:
        logger.warning(f"[runtime_predictor] insufficient rows with real duration ({len(train)}); skipping.")
        remove_dir_if_exists(Path(models_dir) / rp.MODEL_NAME)
        remove_dir_if_exists(Path(eval_dir) / rp.MODEL_NAME)
        remove_stale_card(rp.MODEL_NAME, model_cards_dir)
        return {"status": "skipped", "reason": "insufficient labeled rows"}

    out_dir = ensure_dir(Path(models_dir) / rp.MODEL_NAME)
    eval_out = ensure_dir(Path(eval_dir) / rp.MODEL_NAME)

    model = rp.build_model()
    model.fit(train, train[rp.TARGET])

    metrics = {"train_n": int(len(train))}
    for split_name, split_df in [("val", val), ("test", test)]:
        if split_df.empty:
            continue
        preds = model.predict(split_df)
        baseline = rp.baseline_predict(train[rp.TARGET], len(split_df))
        metrics[split_name] = regression_metrics(split_df[rp.TARGET], preds, baseline_pred=baseline)
        if split_name == "test":
            pred_df = split_df[["job_id", "timestamp", "source_dataset"]].copy()
            pred_df["actual"] = split_df[rp.TARGET].values
            pred_df["predicted"] = preds
            save_parquet(pred_df, eval_out / "predictions.parquet")
            plot_pred_vs_actual(split_df[rp.TARGET], preds, "runtime_predictor (test)", eval_out / "plots" / "pred_vs_actual.png")

    fi = model.feature_importance()
    if fi is not None:
        fi.to_csv(eval_out / "feature_importance.csv", index=False)

    model.save(out_dir)
    save_json(metrics, eval_out / "metrics.json")

    write_model_card(
        model_cards_dir=model_cards_dir,
        model_name=rp.MODEL_NAME,
        version="v1",
        datasets_used=sorted(train["source_dataset"].unique().tolist()),
        rows_used=int(len(train)),
        features=rp.NUMERIC_FEATURES + rp.CATEGORICAL_FEATURES,
        targets=[rp.TARGET],
        metrics=metrics,
        label_provenance="real",
        known_limitations=[
            "duration_seconds is only available for records with completed start/end times; censored/still-running jobs are excluded.",
            "Runtime is highly workload-specific; cross-dataset generalization is not guaranteed.",
        ],
        intended_use="Estimating job runtime to compute SLA slack and to feed the policy ranker.",
        non_intended_use="Not validated for SLA guarantees or billing.",
        train_range=f"{train['timestamp'].min()} -> {train['timestamp'].max()}",
        test_range=f"{test['timestamp'].min()} -> {test['timestamp'].max()}" if not test.empty else None,
    )
    return {"status": "trained", "metrics": metrics}

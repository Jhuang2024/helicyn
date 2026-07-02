from __future__ import annotations

from pathlib import Path
from typing import Dict

import pandas as pd

from helicyn_ml.config import EVAL_DIR, MODELS_DIR, SPLITS_DIR
from helicyn_ml.models import workload_forecaster as wf
from helicyn_ml.preprocessing.feature_engineering import build_workload_features
from helicyn_ml.training.card_utils import write_model_card
from helicyn_ml.utils.io import ensure_dir, load_parquet, save_json, save_parquet
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
    train_raw = _load_split(splits_dir, "train")
    val_raw = _load_split(splits_dir, "val")
    test_raw = _load_split(splits_dir, "test")

    if train_raw.empty:
        logger.warning("[workload_forecaster] no training data found; skipping.")
        return {"status": "skipped", "reason": "no training data"}

    train = wf.build_targets(build_workload_features(train_raw))
    val = wf.build_targets(build_workload_features(val_raw)) if not val_raw.empty else pd.DataFrame()
    test = wf.build_targets(build_workload_features(test_raw)) if not test_raw.empty else pd.DataFrame()

    out_dir = ensure_dir(Path(models_dir) / wf.MODEL_NAME)
    eval_out = ensure_dir(Path(eval_dir) / wf.MODEL_NAME)
    model_cards_dir = Path(eval_dir).parent / "reports" / "model_cards"

    all_metrics = {}
    for target in wf.TARGETS:
        target_train = train.dropna(subset=[target])
        if len(target_train) < 20:
            logger.warning(f"[workload_forecaster:{target}] insufficient rows ({len(target_train)}); skipping.")
            all_metrics[target] = {"status": "skipped", "reason": "insufficient rows"}
            continue

        model = wf.build_model(target)
        model.fit(target_train, target_train[target])

        target_metrics = {"train_n": int(len(target_train))}
        for split_name, split_df in [("val", val), ("test", test)]:
            if split_df.empty or target not in split_df.columns:
                continue
            split_df_valid = split_df.dropna(subset=[target])
            if split_df_valid.empty:
                continue
            preds = model.predict(split_df_valid)
            baseline = wf.baseline_predict(target_train[target], len(split_df_valid))
            target_metrics[split_name] = regression_metrics(split_df_valid[target], preds, baseline_pred=baseline)
            if split_name == "test":
                pred_df = split_df_valid[["timestamp", "source_dataset"]].copy()
                pred_df["actual"] = split_df_valid[target].values
                pred_df["predicted"] = preds
                save_parquet(pred_df, eval_out / f"predictions_{target}.parquet")
                plot_pred_vs_actual(split_df_valid[target], preds, f"{target} (test)", eval_out / "plots" / f"{target}.png")

        model.save(out_dir / target, extra_metadata={"target": target})
        all_metrics[target] = target_metrics
        logger.info(f"[workload_forecaster:{target}] trained on {len(target_train)} rows")

    save_json(all_metrics, eval_out / "metrics.json")

    write_model_card(
        model_cards_dir=model_cards_dir,
        model_name=wf.MODEL_NAME,
        version="v1",
        datasets_used=sorted(train["source_dataset"].unique().tolist()) if "source_dataset" in train.columns else [],
        rows_used=int(len(train)),
        features=wf.numeric_features() + wf.categorical_features(),
        targets=wf.TARGETS,
        metrics=all_metrics,
        label_provenance="real",
        known_limitations=[
            "Forward-looking targets are computed by re-windowing the same trace and can be noisy near split boundaries.",
            "Public traces mix heterogeneous source_dataset epochs; cross-dataset generalization is not guaranteed.",
        ],
        intended_use="Short-horizon demand forecasting to feed the Helicyn policy ranker's predicted_future_demand feature.",
        non_intended_use="Not validated for production capacity planning or SLA guarantees.",
        train_range=f"{train['timestamp'].min()} -> {train['timestamp'].max()}" if not train.empty else None,
        test_range=f"{test['timestamp'].min()} -> {test['timestamp'].max()}" if not test.empty else None,
    )
    return {"status": "trained", "metrics": all_metrics}

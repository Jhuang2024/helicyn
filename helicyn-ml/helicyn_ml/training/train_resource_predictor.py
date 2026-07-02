from __future__ import annotations

from pathlib import Path
from typing import Dict

import pandas as pd

from helicyn_ml.config import EVAL_DIR, MODELS_DIR, SPLITS_DIR
from helicyn_ml.models import resource_predictor as rsp
from helicyn_ml.preprocessing.feature_engineering import build_runtime_resource_features
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
    train_raw, val_raw, test_raw = (_load_split(splits_dir, s) for s in ("train", "val", "test"))

    if train_raw.empty:
        logger.warning("[resource_predictor] no training data found; skipping.")
        return {"status": "skipped", "reason": "no training data"}

    train = build_runtime_resource_features(train_raw)
    val = build_runtime_resource_features(val_raw) if not val_raw.empty else pd.DataFrame()
    test = build_runtime_resource_features(test_raw) if not test_raw.empty else pd.DataFrame()

    out_dir = ensure_dir(Path(models_dir) / rsp.MODEL_NAME)
    eval_out = ensure_dir(Path(eval_dir) / rsp.MODEL_NAME)

    coverage = rsp.targets_with_coverage(train)
    all_metrics = {"label_coverage": coverage}

    for target, cov in coverage.items():
        if cov < rsp.MIN_LABEL_COVERAGE:
            logger.warning(f"[resource_predictor:{target}] label coverage {cov:.1%} below threshold; skipping.")
            all_metrics[target] = {"status": "skipped", "reason": f"label coverage {cov:.1%} < {rsp.MIN_LABEL_COVERAGE:.0%}"}
            continue

        target_train = train.dropna(subset=[target])
        if len(target_train) < 20:
            all_metrics[target] = {"status": "skipped", "reason": "insufficient rows"}
            continue

        model = rsp.build_model(target)
        model.fit(target_train, target_train[target])

        target_metrics = {"train_n": int(len(target_train))}
        for split_name, split_df in [("val", val), ("test", test)]:
            if split_df.empty or target not in split_df.columns:
                continue
            split_valid = split_df.dropna(subset=[target])
            if split_valid.empty:
                continue
            preds = model.predict(split_valid)
            baseline = rsp.baseline_predict(target_train[target], len(split_valid))
            target_metrics[split_name] = regression_metrics(split_valid[target], preds, baseline_pred=baseline)
            if split_name == "test":
                pred_df = split_valid[["job_id", "timestamp", "source_dataset"]].copy()
                pred_df["actual"] = split_valid[target].values
                pred_df["predicted"] = preds
                save_parquet(pred_df, eval_out / f"predictions_{target}.parquet")
                plot_pred_vs_actual(split_valid[target], preds, f"{target} (test)", eval_out / "plots" / f"{target}.png")

        model.save(out_dir / target, extra_metadata={"target": target})
        all_metrics[target] = target_metrics

    trained_targets = [t for t, c in coverage.items() if c >= rsp.MIN_LABEL_COVERAGE and (Path(out_dir) / t / "model.joblib").exists()]
    if not trained_targets:
        logger.warning("[resource_predictor] no target had sufficient label coverage; nothing trained.")
        save_json(all_metrics, eval_out / "metrics.json")
        return {"status": "skipped", "reason": "no target met label coverage/row thresholds", "metrics": all_metrics}

    save_json(all_metrics, eval_out / "metrics.json")

    write_model_card(
        model_name=rsp.MODEL_NAME,
        version="v1",
        datasets_used=sorted(train["source_dataset"].unique().tolist()),
        rows_used=int(len(train)),
        features=rsp.NUMERIC_FEATURES + rsp.CATEGORICAL_FEATURES,
        targets=trained_targets,
        metrics=all_metrics,
        label_provenance="real",
        known_limitations=[
            "Usage targets (cpu_usage, gpu_usage, memory_usage_gb, gpu_memory_usage_gb) are only available in datasets "
            "that report actual utilization alongside requests; targets below the coverage threshold are skipped, not fabricated.",
        ],
        intended_use="Estimating actual resource consumption from requested resources to feed the policy ranker.",
        non_intended_use="Not validated as a capacity-planning or billing tool.",
    )
    return {"status": "trained", "metrics": all_metrics}

from __future__ import annotations

from pathlib import Path
from typing import Dict, List

import pandas as pd

from helicyn_ml.config import EVAL_DIR, MODELS_DIR, SPLITS_DIR
from helicyn_ml.models import resource_predictor as rsp
from helicyn_ml.preprocessing.feature_engineering import (
    build_resource_features,
    build_runtime_resource_features,
    resource_persistence_baseline,
)
from helicyn_ml.training.card_utils import remove_stale_card, write_model_card
from helicyn_ml.utils.io import ensure_dir, load_parquet, remove_dir_if_exists, save_json, save_parquet
from helicyn_ml.utils.logging import get_logger
from helicyn_ml.utils.metrics import regression_metrics
from helicyn_ml.utils.plotting import plot_pred_vs_actual
from helicyn_ml.utils.seeds import set_all_seeds

logger = get_logger(__name__)

GPU_UNAVAILABLE_NOTE = (
    "GPU usage is not trained or predicted by ResourcePredictor - no dataset currently supported "
    "(workload or resource-timeseries) reports GPU utilization, and no GPU target is fabricated."
)


def _load_split(splits_dir: Path, split: str, kind: str) -> pd.DataFrame:
    path = Path(splits_dir) / split / f"{kind}.parquet"
    if not path.exists():
        return pd.DataFrame()
    return load_parquet(path)


def _train_workload_targets(train: pd.DataFrame, val: pd.DataFrame, test: pd.DataFrame, out_dir: Path, eval_out: Path) -> Dict:
    """Existing path: usage predicted from job requests in workload data.
    Public request-only traces (BurstGPT) give 0% coverage here, but a
    future dataset with real usage-alongside-requests would use this path.
    """
    coverage = rsp.targets_with_coverage(train)
    metrics: Dict = {"label_coverage": coverage}

    for target, cov in coverage.items():
        if cov < rsp.MIN_LABEL_COVERAGE:
            logger.warning(f"[resource_predictor:{target}] label coverage {cov:.1%} below threshold; skipping.")
            metrics[target] = {"status": "skipped", "reason": f"label coverage {cov:.1%} < {rsp.MIN_LABEL_COVERAGE:.0%}", "source": "workload"}
            continue

        target_train = train.dropna(subset=[target])
        if len(target_train) < 20:
            metrics[target] = {"status": "skipped", "reason": "insufficient rows", "source": "workload"}
            continue

        model = rsp.build_model(target)
        model.fit(target_train, target_train[target])

        target_metrics = {"train_n": int(len(target_train)), "source": "workload"}
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

        model.save(out_dir / target, extra_metadata={"target": target, "source": "workload"})
        metrics[target] = target_metrics

    return metrics


def _train_resource_targets(train: pd.DataFrame, val: pd.DataFrame, test: pd.DataFrame, out_dir: Path, eval_out: Path) -> Dict:
    """Primary path when workload usage labels are unavailable: real
    per-timestep CPU/memory utilization from NormalizedResourceTimeseriesRecord
    data (google-cluster-cpu-memory-preprocessed, azure-cpu-usage-small).
    """
    coverage = rsp.resource_targets_with_coverage(train)
    row_counts = rsp.resource_targets_with_row_counts(train)
    metrics: Dict = {"label_coverage": coverage, "label_row_counts": row_counts}

    for target, n_rows in row_counts.items():
        # Gated on an ABSOLUTE row count, not percentage-of-combined-table -
        # see MIN_RESOURCE_TARGET_ROWS docstring in models/resource_predictor.py.
        # Different resource datasets report disjoint targets by design, so a
        # small dataset's target would otherwise look like "low coverage"
        # purely because a much larger dataset dominates the combined table.
        if n_rows < rsp.MIN_RESOURCE_TARGET_ROWS:
            logger.warning(f"[resource_predictor:{target}] only {n_rows} real rows (< {rsp.MIN_RESOURCE_TARGET_ROWS}); skipping.")
            metrics[target] = {
                "status": "skipped",
                "reason": f"only {n_rows} real rows < {rsp.MIN_RESOURCE_TARGET_ROWS} minimum",
                "source": "resource_timeseries",
            }
            continue

        target_train = train.dropna(subset=[target])

        model = rsp.build_resource_model(target)
        model.fit(target_train, target_train[target])

        target_metrics = {"train_n": int(len(target_train)), "source": "resource_timeseries"}
        for split_name, split_df in [("val", val), ("test", test)]:
            if split_df.empty or target not in split_df.columns:
                continue
            split_valid = split_df.dropna(subset=[target]).copy()
            if split_valid.empty:
                continue
            preds = model.predict(split_valid)
            baseline = resource_persistence_baseline(split_valid, target).fillna(target_train[target].mean())
            target_metrics[split_name] = regression_metrics(split_valid[target], preds, baseline_pred=baseline)
            if split_name == "test":
                pred_cols = [c for c in ("source_dataset", "vm_id", "time_index") if c in split_valid.columns]
                pred_df = split_valid[pred_cols].copy()
                pred_df["actual"] = split_valid[target].values
                pred_df["predicted"] = preds
                save_parquet(pred_df, eval_out / f"predictions_{target}.parquet")
                plot_pred_vs_actual(split_valid[target], preds, f"{target} (test)", eval_out / "plots" / f"{target}.png")

        model.save(out_dir / target, extra_metadata={"target": target, "source": "resource_timeseries"})
        metrics[target] = target_metrics

    return metrics


def run(splits_dir: Path = SPLITS_DIR, models_dir: Path = MODELS_DIR, eval_dir: Path = EVAL_DIR, seed: int = 42) -> Dict:
    set_all_seeds(seed)
    model_cards_dir = Path(eval_dir).parent / "reports" / "model_cards"

    workloads_train, workloads_val, workloads_test = (_load_split(splits_dir, s, "workloads") for s in ("train", "val", "test"))
    resources_train, resources_val, resources_test = (_load_split(splits_dir, s, "resources") for s in ("train", "val", "test"))

    if workloads_train.empty and resources_train.empty:
        logger.warning("[resource_predictor] no workload or resource training data found; skipping.")
        remove_dir_if_exists(Path(models_dir) / rsp.MODEL_NAME)
        remove_dir_if_exists(Path(eval_dir) / rsp.MODEL_NAME)
        remove_stale_card(rsp.MODEL_NAME, model_cards_dir)
        return {"status": "skipped", "reason": "no training data"}

    # Clear any stale per-target artifacts from a previous run before
    # retraining - otherwise a target that no longer clears its threshold
    # on this run's data could leave a stale model.joblib behind that
    # `status` would mistake for a currently-valid model.
    remove_dir_if_exists(Path(models_dir) / rsp.MODEL_NAME)
    out_dir = ensure_dir(Path(models_dir) / rsp.MODEL_NAME)
    eval_out = ensure_dir(Path(eval_dir) / rsp.MODEL_NAME)

    all_metrics: Dict = {}
    datasets_used: List[str] = []

    if not workloads_train.empty:
        wl_train = build_runtime_resource_features(workloads_train)
        wl_val = build_runtime_resource_features(workloads_val) if not workloads_val.empty else pd.DataFrame()
        wl_test = build_runtime_resource_features(workloads_test) if not workloads_test.empty else pd.DataFrame()
        workload_metrics = _train_workload_targets(wl_train, wl_val, wl_test, out_dir, eval_out)
        all_metrics.update(workload_metrics)
        datasets_used += wl_train["source_dataset"].unique().tolist()
    else:
        logger.info("[resource_predictor] no processed workload data; skipping workload-usage targets.")

    if not resources_train.empty:
        res_train = build_resource_features(resources_train)
        res_val = build_resource_features(resources_val) if not resources_val.empty else pd.DataFrame()
        res_test = build_resource_features(resources_test) if not resources_test.empty else pd.DataFrame()
        resource_metrics = _train_resource_targets(res_train, res_val, res_test, out_dir, eval_out)
        all_metrics.update(resource_metrics)
        datasets_used += res_train["source_dataset"].unique().tolist()
    else:
        logger.info(
            "[resource_predictor] no processed resource-timeseries data; skipping cpu/memory-utilization targets "
            "(run `python -m helicyn_ml datasets download --dataset google-cluster-cpu-memory-preprocessed` "
            "and/or `--dataset azure-cpu-usage-small`)."
        )

    trained_targets = [
        t
        for t in list(rsp.TARGETS) + list(rsp.RESOURCE_TARGETS)
        if (Path(out_dir) / t / "model.joblib").exists()
    ]

    save_json(all_metrics, eval_out / "metrics.json")

    if not trained_targets:
        logger.warning("[resource_predictor] no target had sufficient label coverage; nothing trained.")
        remove_stale_card(rsp.MODEL_NAME, model_cards_dir)
        return {"status": "skipped", "reason": "no target met label coverage/row thresholds", "metrics": all_metrics}

    resource_trained = [t for t in trained_targets if t in rsp.RESOURCE_TARGETS]
    workload_trained = [t for t in trained_targets if t in rsp.TARGETS]
    label_provenance = "real" if resource_trained or workload_trained else "real"

    known_limitations = [
        "Usage targets from workload data (cpu_usage, gpu_usage, memory_usage_gb, gpu_memory_usage_gb) are only "
        "available in datasets that report actual utilization alongside requests; targets below the coverage "
        "threshold are skipped, not fabricated.",
        GPU_UNAVAILABLE_NOTE,
    ]
    if resource_trained:
        known_limitations.append(
            f"CPU/memory targets ({resource_trained}) trained from real/preprocessed Google Cluster and/or Azure "
            "resource-timeseries traces; GPU unavailable. See docs/google_cpu_memory_preprocessed.md for exact "
            "provenance and what this data cannot support (no real calendar timestamps for the Google trace, "
            "azure.csv CPU values are not a bounded percentage despite naming)."
        )

    write_model_card(
        model_cards_dir=model_cards_dir,
        model_name=rsp.MODEL_NAME,
        version="v2",
        datasets_used=sorted(set(datasets_used)),
        rows_used=int(len(workloads_train)) + int(len(resources_train)),
        features=list(dict.fromkeys(rsp.NUMERIC_FEATURES + rsp.CATEGORICAL_FEATURES + rsp.RESOURCE_NUMERIC_FEATURES + rsp.RESOURCE_CATEGORICAL_FEATURES)),
        targets=trained_targets,
        metrics=all_metrics,
        label_provenance=label_provenance,
        known_limitations=known_limitations,
        intended_use="Estimating actual CPU/memory resource consumption to feed the policy ranker.",
        non_intended_use="Not validated as a capacity-planning or billing tool. Not a GPU usage predictor.",
        extra_notes=GPU_UNAVAILABLE_NOTE,
    )
    return {"status": "trained", "metrics": all_metrics}

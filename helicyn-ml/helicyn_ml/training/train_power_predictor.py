from __future__ import annotations

from pathlib import Path
from typing import Dict

import pandas as pd

from helicyn_ml.config import EVAL_DIR, MODELS_DIR, SPLITS_DIR
from helicyn_ml.models import power_predictor as pp
from helicyn_ml.training.card_utils import write_model_card
from helicyn_ml.utils.io import ensure_dir, load_parquet, save_json, save_parquet
from helicyn_ml.utils.logging import get_logger
from helicyn_ml.utils.metrics import regression_metrics
from helicyn_ml.utils.plotting import plot_pred_vs_actual
from helicyn_ml.utils.seeds import set_all_seeds

logger = get_logger(__name__)

MIN_ROWS_FOR_TRAINING = 30


def _load_split(splits_dir: Path, split: str) -> pd.DataFrame:
    path = Path(splits_dir) / split / "power.parquet"
    if not path.exists():
        return pd.DataFrame()
    return load_parquet(path)


def run(splits_dir: Path = SPLITS_DIR, models_dir: Path = MODELS_DIR, eval_dir: Path = EVAL_DIR, seed: int = 42) -> Dict:
    set_all_seeds(seed)
    train, val, test = (_load_split(splits_dir, s) for s in ("train", "val", "test"))

    out_dir = ensure_dir(Path(models_dir) / pp.MODEL_NAME)
    eval_out = ensure_dir(Path(eval_dir) / pp.MODEL_NAME)
    model_cards_dir = Path(eval_dir).parent / "reports" / "model_cards"

    if len(train) < MIN_ROWS_FOR_TRAINING:
        logger.warning(
            f"[power_predictor] only {len(train)} real power rows available (< {MIN_ROWS_FOR_TRAINING}); "
            "using ANALYTICAL FALLBACK instead of training on insufficient/absent real data."
        )
        metrics = {"status": "analytical_fallback", "reason": f"only {len(train)} real power_kw rows available", "coefficients": pp.ANALYTICAL_FALLBACK_COEFFICIENTS}
        if not test.empty:
            preds = pp.analytical_fallback_predict(test)
            metrics["test"] = regression_metrics(test[pp.TARGET], preds)
        save_json(metrics, eval_out / "metrics.json")
        save_json({"analytical_fallback": True, "coefficients": pp.ANALYTICAL_FALLBACK_COEFFICIENTS}, out_dir / "metadata.json")
        write_model_card(
            model_cards_dir=model_cards_dir,
            model_name=pp.MODEL_NAME,
            version="v1-analytical-fallback",
            datasets_used=sorted(train["source_dataset"].unique().tolist()) if not train.empty else [],
            rows_used=int(len(train)),
            features=pp.NUMERIC_FEATURES,
            targets=[pp.TARGET],
            metrics=metrics,
            label_provenance="synthetic",
            known_limitations=[
                "No sufficient real power dataset was available at training time; this is an ANALYTICAL FALLBACK "
                "(a fixed linear formula: idle + cpu_coef*cpu_usage + gpu_coef*gpu_usage + thermal term), not a "
                "model fit to measured power draw.",
                "Coefficients are illustrative engineering assumptions, not calibrated against real hardware.",
            ],
            intended_use="Placeholder power-delta estimate for the policy ranker when no real power dataset is present.",
            non_intended_use="Must never be presented as a measured or validated power model.",
        )
        return {"status": "analytical_fallback", "metrics": metrics}

    model = pp.build_model()
    model.fit(train, train[pp.TARGET])

    metrics = {"train_n": int(len(train))}
    for split_name, split_df in [("val", val), ("test", test)]:
        if split_df.empty:
            continue
        preds = model.predict(split_df)
        metrics[split_name] = regression_metrics(split_df[pp.TARGET], preds)
        if split_name == "test":
            pred_df = split_df[["timestamp", "source_dataset"]].copy()
            pred_df["actual"] = split_df[pp.TARGET].values
            pred_df["predicted"] = preds
            save_parquet(pred_df, eval_out / "predictions.parquet")
            plot_pred_vs_actual(split_df[pp.TARGET], preds, "power_predictor (test)", eval_out / "plots" / "pred_vs_actual.png")

    model.save(out_dir)
    save_json(metrics, eval_out / "metrics.json")

    write_model_card(
        model_cards_dir=model_cards_dir,
        model_name=pp.MODEL_NAME,
        version="v1",
        datasets_used=sorted(train["source_dataset"].unique().tolist()),
        rows_used=int(len(train)),
        features=pp.NUMERIC_FEATURES,
        targets=[pp.TARGET],
        metrics=metrics,
        label_provenance="real" if "synthetic_sample" not in train["source_dataset"].unique() else "synthetic",
        known_limitations=[
            "No facility-level PUE, chiller, or cooling telemetry is included; this predicts server/site-level power only.",
        ],
        intended_use="Estimating power draw from utilization to feed the policy ranker's carbon/cost terms.",
        non_intended_use="Not validated for real facility power billing or capacity planning.",
    )
    return {"status": "trained", "metrics": metrics}

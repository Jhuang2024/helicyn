"""Trains PolicyRanker v1 by IMITATION LEARNING from the transparent
heuristic teacher (helicyn_ml/policies/heuristic_teacher.py).

Public workload/grid/weather traces show what happened, not full
counterfactuals (what if this job had been placed elsewhere / delayed /
run at a different DVFS state). So there is no real-outcome label to learn
from yet. Instead: for each historical job, we build a small synthetic
FleetState snapshot (using the trace's own timestamp + whatever grid/weather
signal is available for that time), generate the standard 8 candidate
actions, score each with the heuristic teacher, and train a regressor to
predict that teacher score. This is documented explicitly as
teacher-imitation, not learning from real operator decisions.

IMPORTANT CAVEAT (see docs/limitations.md and the model card): this v1
table-building process is itself synthetic scaffolding layered on top of
real job arrival/token data. Diagnostics (diagnostics.py,
build_policy_ranker_diagnostics) are computed and saved alongside every
training run specifically so degenerate/constant-feature table construction
is visible rather than silently producing a misleadingly confident model.
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from helicyn_ml.config import EVAL_DIR, MODELS_DIR, SPLITS_DIR
from helicyn_ml.models import policy_ranker as prk
from helicyn_ml.policies.candidate_generation import generate_candidates
from helicyn_ml.policies.constraint_checker import check_constraints
from helicyn_ml.policies.features import compute_action_features
from helicyn_ml.policies.heuristic_teacher import teacher_score
from helicyn_ml.schemas import (
    FleetState,
    GridSignal,
    QueuedJob,
    Rack,
    Server,
    Site,
    WeatherSignal,
    WorkloadType,
)
from helicyn_ml.training.card_utils import write_model_card
from helicyn_ml.training.diagnostics import build_policy_ranker_diagnostics
from helicyn_ml.utils.io import ensure_dir, load_parquet, save_json
from helicyn_ml.utils.logging import get_logger
from helicyn_ml.utils.metrics import regression_metrics
from helicyn_ml.utils.seeds import set_all_seeds

logger = get_logger(__name__)

MAX_ROWS_PER_SPLIT = 1500
_SITES = ["site-a", "site-b"]

# A job marked latency_sensitive is still allowed a short delay budget in
# this synthetic table (real operators do tolerate small delays for
# latency-sensitive work) rather than being made entirely non-delayable -
# that used to eliminate every delay candidate whenever 100% of a dataset's
# jobs were latency_sensitive (e.g. an LLM-inference-only trace), collapsing
# the training table's action diversity. See diagnostics.py.
_LATENCY_SENSITIVE_MAX_DELAY_MINUTES = 20.0


def _synthetic_servers(cpu_frac: float, gpu_frac: float, mem_frac: float) -> tuple:
    """Builds a synthetic 2-site fleet at given per-resource utilization
    levels. cpu/gpu/mem fractions are drawn independently per job (see
    build_training_table) so current_*_utilization / candidate_remaining_*
    features carry real signal, AND so fragmentation_score (which measures
    CPU-vs-GPU imbalance) isn't trivially always zero - it would be if CPU
    and GPU utilization always moved in lockstep together.
    """
    cpu_frac = float(np.clip(cpu_frac, 0.05, 0.95))
    gpu_frac = float(np.clip(gpu_frac, 0.05, 0.95))
    mem_frac = float(np.clip(mem_frac, 0.05, 0.95))
    sites, racks, servers = [], [], []
    for site_id in _SITES:
        rack_id = f"rack-{site_id}"
        sites.append(Site(site_id=site_id, region="us-west" if site_id == "site-a" else "us-east", rack_ids=[rack_id]))
        racks.append(Rack(rack_id=rack_id, site_id=site_id))
        for i in range(3):
            servers.append(
                Server(
                    server_id=f"{site_id}-srv-{i}",
                    rack_id=rack_id,
                    cpu_capacity=64.0,
                    cpu_used=64.0 * cpu_frac,
                    memory_capacity_gb=256.0,
                    memory_used_gb=256.0 * mem_frac,
                    gpu_capacity=8.0,
                    gpu_used=8.0 * gpu_frac,
                )
            )
    return sites, racks, servers


def _hour_of_day_signal(df: pd.DataFrame, ts: pd.Timestamp) -> Optional[pd.Series]:
    """Matches a grid/weather row by hour-of-day rather than absolute nearest
    timestamp. Our synthetic grid/weather samples model a diurnal cycle over
    a short window (e.g. 14-21 days in 2024); workload traces often span an
    unrelated calendar period (e.g. BurstGPT in 2023). Absolute-nearest
    matching in that case collapses every row to the single closest
    boundary date, making carbon/price/ambient features constant across the
    entire table. Matching by hour-of-day is both more correct (diurnal
    carbon/price/temperature patterns are a function of time-of-day, not a
    specific date) and avoids that collapse.
    """
    if df.empty:
        return None
    hours = pd.to_datetime(df["timestamp"], utc=True).dt.hour
    same_hour = df[hours == ts.hour]
    if same_hour.empty:
        idx = (pd.to_datetime(df["timestamp"], utc=True) - ts).abs().idxmin()
        return df.loc[idx]
    # deterministic pick among same-hour rows: closest by day-of-cycle
    idx = (pd.to_datetime(same_hour["timestamp"], utc=True) - ts).abs().idxmin()
    return same_hour.loc[idx]


def _row_to_job(row: pd.Series) -> QueuedJob:
    try:
        wtype = WorkloadType(row.get("workload_type", "unknown"))
    except ValueError:
        wtype = WorkloadType.UNKNOWN
    latency_sensitive = bool(row.get("latency_sensitive")) if pd.notna(row.get("latency_sensitive")) else False
    return QueuedJob(
        job_id=str(row.get("job_id", "job")),
        workload_type=wtype,
        arrival_time=row["arrival_time"],
        cpu_request=float(row["cpu_request"]) if pd.notna(row.get("cpu_request")) else None,
        memory_request_gb=float(row["memory_request_gb"]) if pd.notna(row.get("memory_request_gb")) else None,
        gpu_request=float(row["gpu_request"]) if pd.notna(row.get("gpu_request")) else None,
        input_tokens=int(row["input_tokens"]) if pd.notna(row.get("input_tokens")) else None,
        output_tokens=int(row["output_tokens"]) if pd.notna(row.get("output_tokens")) else None,
        priority=float(row["priority"]) if pd.notna(row.get("priority")) else 0.5,
        preemptible=bool(row.get("preemptible")) if pd.notna(row.get("preemptible")) else False,
        latency_sensitive=latency_sensitive,
        # A latency-sensitive job still gets a short delay budget rather than
        # being fully non-delayable - see module docstring.
        delayable=True,
        max_delay_minutes=_LATENCY_SENSITIVE_MAX_DELAY_MINUTES if latency_sensitive else None,
    )


def _predicted_resource_usage(job: QueuedJob) -> float:
    """CPU/GPU-request-based estimate, blended with a token-count-based term
    when tokens are available. Some loaders (e.g. burstgpt.py) set a fixed
    gpu_request=1.0 for every row since the source trace has no real GPU
    sizing field at all - using cpu/gpu request alone in that case would
    make this feature constant across an entire token-only trace. Longer
    LLM requests genuinely cost more compute at a fixed GPU count, so
    combining the two is a more honest proxy, not a fabrication.
    """
    base = (job.cpu_request or 0.0) + (job.gpu_request or 0.0) * 8.0
    tokens = (job.input_tokens or 0) + (job.output_tokens or 0)
    if tokens:
        return base + tokens / 1000.0
    return base if (job.cpu_request is not None or job.gpu_request is not None) else 1.0


def build_training_table(workloads: pd.DataFrame, grid: pd.DataFrame, weather: pd.DataFrame, seed: int = 42) -> pd.DataFrame:
    if workloads.empty:
        return pd.DataFrame()
    rng = np.random.default_rng(seed)
    if len(workloads) > MAX_ROWS_PER_SPLIT:
        idx = rng.choice(len(workloads), size=MAX_ROWS_PER_SPLIT, replace=False)
        workloads = workloads.iloc[sorted(idx)]

    cpu_util_draws = rng.uniform(0.15, 0.85, size=len(workloads))
    gpu_util_draws = rng.uniform(0.15, 0.85, size=len(workloads))
    mem_util_draws = rng.uniform(0.15, 0.85, size=len(workloads))
    rows: List[Dict] = []

    for (_, wrow), cpu_frac, gpu_frac, mem_frac in zip(
        workloads.iterrows(), cpu_util_draws, gpu_util_draws, mem_util_draws
    ):
        ts = pd.Timestamp(wrow["arrival_time"])
        if ts.tzinfo is None:
            ts = ts.tz_localize("UTC")
        grid_row = _hour_of_day_signal(grid, ts) if not grid.empty else None
        weather_row = _hour_of_day_signal(weather, ts) if not weather.empty else None

        grid_signals = (
            [GridSignal(region=r, timestamp=ts, carbon_intensity_gco2e_per_kwh=grid_row.get("carbon_intensity_gco2e_per_kwh"), electricity_price_usd_per_mwh=grid_row.get("electricity_price_usd_per_mwh"), grid_load_mw=grid_row.get("grid_load_mw")) for r in ("us-west", "us-east")]
            if grid_row is not None
            else []
        )
        weather_signals = (
            [WeatherSignal(region=r, timestamp=ts, ambient_temp_c=float(weather_row.get("ambient_temp_c", 20.0)), relative_humidity=weather_row.get("relative_humidity")) for r in ("us-west", "us-east")]
            if weather_row is not None
            else []
        )

        sites, racks, servers = _synthetic_servers(cpu_frac, gpu_frac, mem_frac)
        fleet_state = FleetState(
            timestamp=ts,
            sites=sites,
            racks=racks,
            servers=servers,
            queued_jobs=[],
            running_jobs=[],
            grid_signals=grid_signals,
            weather_signals=weather_signals,
        )
        job = _row_to_job(wrow)
        candidates = generate_candidates(job, fleet_state)

        predicted_runtime = float(wrow["duration_seconds"]) if pd.notna(wrow.get("duration_seconds")) else 300.0
        predicted_sla_risk = 0.5 if job.latency_sensitive else 0.2
        predicted_resource_usage = _predicted_resource_usage(job)
        predicted_future_demand = float((job.input_tokens or 0) + (job.output_tokens or 0))

        for action in candidates:
            is_valid, _ = check_constraints(action, job, fleet_state, predicted_sla_risk)
            if not is_valid:
                continue
            power_delta = 0.3 if action.dvfs_state == "high_performance" else (-0.2 if action.dvfs_state == "power_saver" else 0.0)
            features = compute_action_features(
                job=job,
                action=action,
                fleet_state=fleet_state,
                predicted_runtime_seconds=predicted_runtime,
                predicted_resource_usage=predicted_resource_usage,
                predicted_sla_risk=predicted_sla_risk,
                predicted_power_delta_kw=power_delta,
                predicted_future_demand=predicted_future_demand,
            )
            label, _ = teacher_score(features)
            row = {k: v for k, v in features.items() if k in prk.NUMERIC_FEATURES + prk.CATEGORICAL_FEATURES}
            row[prk.TARGET] = label
            rows.append(row)

    return pd.DataFrame(rows)


def _load_split(splits_dir: Path, split: str, kind: str) -> pd.DataFrame:
    path = Path(splits_dir) / split / f"{kind}.parquet"
    if not path.exists():
        return pd.DataFrame()
    return load_parquet(path)


def run(splits_dir: Path = SPLITS_DIR, models_dir: Path = MODELS_DIR, eval_dir: Path = EVAL_DIR, seed: int = 42) -> Dict:
    set_all_seeds(seed)

    train_wl = _load_split(splits_dir, "train", "workloads")
    val_wl = _load_split(splits_dir, "val", "workloads")
    test_wl = _load_split(splits_dir, "test", "workloads")
    grid = _load_split(splits_dir, "train", "grid")
    weather = _load_split(splits_dir, "train", "weather")

    if train_wl.empty:
        logger.warning("[policy_ranker] no training workload data found; skipping.")
        return {"status": "skipped", "reason": "no training data"}

    train = build_training_table(train_wl, grid, weather, seed=seed)
    val = build_training_table(val_wl, grid, weather, seed=seed + 1)
    test = build_training_table(test_wl, grid, weather, seed=seed + 2)

    if train.empty:
        logger.warning("[policy_ranker] no valid candidate/label rows generated; skipping.")
        return {"status": "skipped", "reason": "no valid candidates"}

    out_dir = ensure_dir(Path(models_dir) / prk.MODEL_NAME)
    eval_out = ensure_dir(Path(eval_dir) / prk.MODEL_NAME)
    model_cards_dir = Path(eval_dir).parent / "reports" / "model_cards"

    diagnostics = build_policy_ranker_diagnostics(
        train, val, test, prk.NUMERIC_FEATURES, prk.CATEGORICAL_FEATURES, prk.TARGET
    )
    save_json(diagnostics, eval_out / "diagnostics.json")
    for warning in diagnostics.get("warnings", []):
        logger.warning(f"[policy_ranker:diagnostics] {warning}")

    train_fit, val_fit, test_fit = train, val, test

    model = prk.build_model()
    model.fit(train_fit, train_fit[prk.TARGET])

    metrics = {"train_n": int(len(train_fit))}
    for split_name, split_df in [("val", val_fit), ("test", test_fit)]:
        if split_df.empty:
            continue
        preds = model.predict(split_df)
        metrics[split_name] = regression_metrics(split_df[prk.TARGET], preds)

    fi = model.feature_importance()
    if fi is not None:
        fi.to_csv(eval_out / "feature_importance.csv", index=False)

    ranking_eval = _ranking_eval(model, test_fit if not test_fit.empty else val_fit)
    save_json(ranking_eval, eval_out / "ranking_eval.json")

    model.save(out_dir)
    save_json(metrics, eval_out / "metrics.json")

    write_model_card(
        model_cards_dir=model_cards_dir,
        model_name=prk.MODEL_NAME,
        version="v1",
        datasets_used=sorted(train_wl["source_dataset"].unique().tolist()) if "source_dataset" in train_wl.columns else [],
        rows_used=int(len(train_fit)),
        features=prk.NUMERIC_FEATURES + prk.CATEGORICAL_FEATURES,
        targets=[prk.TARGET],
        metrics=metrics,
        label_provenance="teacher_generated",
        known_limitations=[
            "PolicyRanker v1 is trained by imitation of a heuristic teacher, not by real operator labels or real "
            "counterfactual optimal decisions. It is intended as a prototype policy model and will be evaluated in "
            "the simulator.",
            "Candidate FleetState snapshots use synthetic capacity/topology assumptions, not a real fleet inventory.",
            "EXPERIMENTAL / WEAK: see artifacts/eval/policy_ranker/diagnostics.json for feature-variance and "
            "duplicate-row diagnostics run on this training table; do not trust this model until it has been "
            "evaluated through simulator rollouts.",
        ],
        intended_use="Prototype action ranking for the Helicyn control-brain interface; requires simulator rollout evaluation before any operational use.",
        non_intended_use="Must not be treated as a validated optimal control policy.",
        extra_notes="research_usable=no (experimental) until simulator rollout evaluation exists, regardless of test-set R^2.",
    )
    return {"status": "trained", "metrics": metrics, "diagnostics": diagnostics}


def _ranking_eval(model, df: pd.DataFrame) -> Dict:
    if df is None or df.empty:
        return {"status": "no_data"}
    preds = model.predict(df)
    df = df.copy()
    df["_pred"] = preds
    # Fraction of times the predicted-best action (lowest predicted score)
    # matches the teacher's actual-best action, computed per small chunk
    # since these rows aren't grouped by job in this flat table.
    chunk = 8
    matches = 0
    total = 0
    for start in range(0, len(df) - chunk + 1, chunk):
        window = df.iloc[start : start + chunk]
        if window.empty:
            continue
        teacher_best = window[prk.TARGET].idxmin()
        model_best = window["_pred"].idxmin()
        matches += int(teacher_best == model_best)
        total += 1
    return {"top1_agreement_rate": matches / total if total else None, "n_windows": total}

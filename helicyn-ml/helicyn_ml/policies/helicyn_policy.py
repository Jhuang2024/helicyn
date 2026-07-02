from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd

from helicyn_ml.models import power_predictor as power_predictor_module
from helicyn_ml.models.base import TabularModel
from helicyn_ml.policies.base import Policy
from helicyn_ml.policies.candidate_generation import generate_candidates, _site_capacity
from helicyn_ml.policies.constraint_checker import check_constraints
from helicyn_ml.policies.explanations import explain_action
from helicyn_ml.policies.features import compute_action_features
from helicyn_ml.policies.heuristic_teacher import teacher_score
from helicyn_ml.schemas import (
    ActionType,
    CandidateAction,
    FleetState,
    PredictedEffect,
    QueuedJob,
    Recommendation,
    ScoredAction,
)
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

MODEL_VERSION = "helicyn-ml-v0.1.0"

_MODEL_DIR_NAMES = {
    "runtime_predictor": "runtime_predictor",
    "sla_risk_model": "sla_risk_model",
    "power_predictor": "power_predictor",
    "policy_ranker": "policy_ranker",
}


def _try_load(models_dir: Path, name: str) -> Optional[TabularModel]:
    model_dir = Path(models_dir) / name
    if not (model_dir / "model.joblib").exists():
        return None
    try:
        return TabularModel.load(model_dir)
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[helicyn_policy] failed to load {name}: {exc}")
        return None


class HelicynPolicy(Policy):
    """Decision interface the future simulator will call. Loads whatever
    trained models are available under `models_dir`; any missing model
    degrades gracefully to a documented default/heuristic rather than
    crashing, and the returned Recommendation.is_fallback flag records
    whether the trained PolicyRanker was actually used.
    """

    def __init__(self, models_dir: Path):
        self.models_dir = Path(models_dir)
        self.runtime_predictor = _try_load(self.models_dir, "runtime_predictor")
        self.sla_risk_model = _try_load(self.models_dir, "sla_risk_model")
        self.power_predictor = _try_load(self.models_dir, "power_predictor")
        self.policy_ranker = _try_load(self.models_dir, "policy_ranker")

        self.missing_models = [
            name
            for name, model in [
                ("runtime_predictor", self.runtime_predictor),
                ("sla_risk_model", self.sla_risk_model),
                ("power_predictor", self.power_predictor),
                ("policy_ranker", self.policy_ranker),
            ]
            if model is None
        ]
        if self.missing_models:
            logger.warning(f"[helicyn_policy] missing trained models: {self.missing_models} - using fallback logic for these.")

    def _job_feature_row(self, job: QueuedJob, fleet_state: FleetState) -> pd.DataFrame:
        ts = fleet_state.timestamp
        return pd.DataFrame(
            [
                {
                    "cpu_request": job.cpu_request or 0.0,
                    "memory_request_gb": job.memory_request_gb or 0.0,
                    "gpu_request": job.gpu_request or 0.0,
                    "gpu_memory_request_gb": job.gpu_memory_request_gb or 0.0,
                    "input_tokens": job.input_tokens or 0,
                    "output_tokens": job.output_tokens or 0,
                    "priority": job.priority or 0.5,
                    "hour_of_day": ts.hour,
                    "day_of_week": ts.weekday(),
                    "is_weekend": int(ts.weekday() >= 5),
                    "workload_type": job.workload_type.value,
                    "scheduling_class": "unknown",
                    "source_dataset": "fleet_state",
                    "rolling_arrival_count_15m": float(len(fleet_state.queued_jobs)),
                }
            ]
        )

    def _predict_runtime(self, job: QueuedJob, fleet_state: FleetState) -> float:
        if self.runtime_predictor is None:
            return 300.0  # 5-minute default when no trained model is available
        row = self._job_feature_row(job, fleet_state)
        return float(self.runtime_predictor.predict(row)[0])

    def _predict_sla_risk(self, job: QueuedJob, fleet_state: FleetState) -> float:
        if self.sla_risk_model is None:
            return 0.5 if job.latency_sensitive else 0.2
        row = self._job_feature_row(job, fleet_state)
        return float(self.sla_risk_model.predict_proba(row)[0])

    def _predict_power_delta(self, job: QueuedJob, action: CandidateAction, fleet_state: FleetState) -> float:
        site = next((s for s in fleet_state.sites if s.site_id == action.target_site_id), None)
        if site is None:
            return 0.0
        cap = _site_capacity(fleet_state, site)
        total_cpu = max(cap["remaining_cpu"] + cap["utilization_cpu"] * (cap["remaining_cpu"] + 1e-6), 1.0)
        before_row = pd.DataFrame(
            [{"cpu_usage": cap["utilization_cpu"], "gpu_usage": cap["utilization_gpu"], "memory_usage": 0.5, "network_usage": 0.3, "ambient_temp_c": 20.0, "source_dataset": "fleet_state"}]
        )
        cpu_after = min(1.0, cap["utilization_cpu"] + (job.cpu_request or 0) / total_cpu)
        after_row = before_row.copy()
        after_row["cpu_usage"] = cpu_after

        if self.power_predictor is not None:
            before_kw = float(self.power_predictor.predict(before_row)[0])
            after_kw = float(self.power_predictor.predict(after_row)[0])
        else:
            before_kw = float(power_predictor_module.analytical_fallback_predict(before_row)[0])
            after_kw = float(power_predictor_module.analytical_fallback_predict(after_row)[0])
        return after_kw - before_kw

    def _score_candidate(
        self, job: Optional[QueuedJob], action: CandidateAction, fleet_state: FleetState
    ) -> ScoredAction:
        if job is None or action.action_type == ActionType.REJECT:
            score, breakdown = teacher_score({"sla_risk": 1.0})
            return ScoredAction(action=action, score=score, score_breakdown=breakdown, valid=False, rejection_reason="no valid job/site")

        predicted_runtime = self._predict_runtime(job, fleet_state)
        predicted_sla_risk = self._predict_sla_risk(job, fleet_state)
        predicted_power_delta = self._predict_power_delta(job, action, fleet_state)
        predicted_resource_usage = (job.cpu_request or 0) + (job.gpu_request or 0) * 8

        features = compute_action_features(
            job=job,
            action=action,
            fleet_state=fleet_state,
            predicted_runtime_seconds=predicted_runtime,
            predicted_resource_usage=predicted_resource_usage,
            predicted_sla_risk=predicted_sla_risk,
            predicted_power_delta_kw=predicted_power_delta,
        )

        is_valid, reason = check_constraints(action, job, fleet_state, predicted_sla_risk)

        if self.policy_ranker is not None:
            row = pd.DataFrame([features])
            score = float(self.policy_ranker.predict(row)[0])
            _, breakdown = teacher_score(features)
        else:
            score, breakdown = teacher_score(features)

        effect = PredictedEffect(
            energy_delta_kwh=predicted_power_delta,
            carbon_delta_kg=predicted_power_delta * features["candidate_carbon_intensity"] / 1000.0,
            cost_delta_usd=predicted_power_delta * features["candidate_price"] / 1000.0,
            sla_risk_delta=predicted_sla_risk,
            thermal_risk_delta=features["thermal_proxy_score"],
        )

        return ScoredAction(
            action=action,
            score=score,
            score_breakdown=breakdown,
            predicted_effect=effect,
            valid=is_valid,
            rejection_reason=reason,
        )

    def recommend(self, fleet_state: FleetState) -> Recommendation:
        all_scored: List[ScoredAction] = []
        selected: List[CandidateAction] = []
        explanations: List[str] = []

        for job in fleet_state.queued_jobs:
            candidates = generate_candidates(job, fleet_state)
            scored = [self._score_candidate(job, action, fleet_state) for action in candidates]
            all_scored.extend(scored)

            valid_sorted = sorted([s for s in scored if s.valid], key=lambda s: s.score)
            if valid_sorted:
                best = valid_sorted[0]
                selected.append(best.action)
                explanations.append(explain_action(best.action, best.score_breakdown, job))

        all_scored.sort(key=lambda s: s.score)
        overall_score = sum(s.score for s in all_scored if s.valid and s.action in selected) if selected else (
            all_scored[0].score if all_scored else 0.0
        )
        overall_breakdown: Dict[str, float] = {}
        for s in all_scored:
            if s.action in selected:
                for k, v in s.score_breakdown.items():
                    overall_breakdown[k] = overall_breakdown.get(k, 0.0) + v

        is_fallback = self.policy_ranker is None
        confidence = 0.5 if is_fallback else max(0.1, 1.0 - 0.15 * len(self.missing_models))

        return Recommendation(
            timestamp=fleet_state.timestamp,
            selected_actions=selected,
            ranked_actions=all_scored,
            score=overall_score,
            score_breakdown=overall_breakdown,
            explanation=" ".join(explanations) if explanations else "No queued jobs required a decision.",
            predicted_effect=None,
            confidence=confidence,
            model_version=MODEL_VERSION,
            is_fallback=is_fallback,
        )

"""PolicyRanker: predicts the heuristic-teacher score for a (fleet state,
candidate action) pair. Lower predicted score = better action.

v1 is trained purely by IMITATION of the transparent heuristic teacher in
helicyn_ml/policies/heuristic_teacher.py - public traces show what
happened, not full action counterfactuals (what if this job had been
delayed / migrated / run under a different DVFS state), so there is no
real-outcome label to train against yet. This is documented explicitly in
the model card; the future simulator is expected to generate rollout-based
labels for v2.
"""
from __future__ import annotations

from typing import List

from sklearn.ensemble import HistGradientBoostingRegressor

from helicyn_ml.models.base import TabularModel

MODEL_NAME = "policy_ranker"
TARGET = "teacher_score"

NUMERIC_FEATURES = [
    "current_cpu_utilization",
    "current_gpu_utilization",
    "current_memory_utilization",
    "candidate_remaining_cpu",
    "candidate_remaining_gpu",
    "candidate_remaining_memory",
    "candidate_carbon_intensity",
    "candidate_price",
    "candidate_ambient_temp_c",
    "predicted_future_demand",
    "predicted_runtime_seconds",
    "predicted_resource_usage",
    "sla_slack_seconds",
    "thermal_proxy_score",
    "fragmentation_score",
    "consolidation_score",
    "delay_minutes",
]
CATEGORICAL_FEATURES = ["action_type", "workload_type", "dvfs_state"]


def build_estimator():
    return HistGradientBoostingRegressor(random_state=42, max_depth=6, max_iter=250)


def build_model() -> TabularModel:
    return TabularModel(
        estimator=build_estimator(),
        numeric_cols=NUMERIC_FEATURES,
        categorical_cols=CATEGORICAL_FEATURES,
        target_col=TARGET,
        model_type="HistGradientBoostingRegressor",
        task="regression",
    )

from __future__ import annotations

from pathlib import Path

from helicyn_ml.config import MODELS_DIR
from helicyn_ml.policies.helicyn_policy import HelicynPolicy
from helicyn_ml.schemas import FleetState, Recommendation


class LocalPolicyService:
    """In-process wrapper around HelicynPolicy for local/import-mode use
    (e.g. from a future simulator running in the same Python process).
    """

    def __init__(self, models_dir: Path = MODELS_DIR):
        self.policy = HelicynPolicy(models_dir=models_dir)

    def recommend(self, fleet_state: FleetState) -> Recommendation:
        return self.policy.recommend(fleet_state)

    def recommend_from_dict(self, fleet_state_dict: dict) -> Recommendation:
        return self.recommend(FleetState.model_validate(fleet_state_dict))

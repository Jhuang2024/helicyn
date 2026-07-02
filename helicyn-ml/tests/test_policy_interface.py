import json
from pathlib import Path

import pytest

from helicyn_ml.policies.helicyn_policy import HelicynPolicy
from helicyn_ml.schemas import FleetState, Recommendation

EXAMPLE_STATE_PATH = Path(__file__).resolve().parent.parent / "examples" / "fleet_state_example.json"


@pytest.fixture
def fleet_state() -> FleetState:
    with open(EXAMPLE_STATE_PATH) as f:
        payload = json.load(f)
    return FleetState.model_validate(payload)


def test_fleet_state_validates(fleet_state):
    assert len(fleet_state.queued_jobs) == 2
    assert len(fleet_state.sites) == 2


def test_helicyn_policy_returns_ranked_actions_with_no_trained_models(tmp_path, fleet_state):
    policy = HelicynPolicy(models_dir=tmp_path)  # empty dir -> all models missing -> fallback path
    assert set(policy.missing_models) == {"runtime_predictor", "sla_risk_model", "power_predictor", "policy_ranker"}

    recommendation = policy.recommend(fleet_state)
    assert isinstance(recommendation, Recommendation)
    assert recommendation.is_fallback is True
    assert len(recommendation.ranked_actions) > 0
    assert len(recommendation.selected_actions) == len(fleet_state.queued_jobs)
    assert recommendation.explanation


def test_recommendation_round_trips_through_json(tmp_path, fleet_state):
    policy = HelicynPolicy(models_dir=tmp_path)
    recommendation = policy.recommend(fleet_state)
    payload = recommendation.model_dump_json()
    reloaded = Recommendation.model_validate_json(payload)
    assert reloaded.score == recommendation.score

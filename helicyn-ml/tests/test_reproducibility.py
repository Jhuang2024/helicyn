import json
from pathlib import Path

import numpy as np

from helicyn_ml.policies.helicyn_policy import HelicynPolicy
from helicyn_ml.schemas import FleetState
from helicyn_ml.utils.seeds import set_all_seeds

EXAMPLE_STATE_PATH = Path(__file__).resolve().parent.parent / "examples" / "fleet_state_example.json"


def test_set_all_seeds_reproducible():
    set_all_seeds(123)
    a = np.random.rand(5)
    set_all_seeds(123)
    b = np.random.rand(5)
    np.testing.assert_array_equal(a, b)


def test_same_fleet_state_produces_same_recommendation(tmp_path):
    with open(EXAMPLE_STATE_PATH) as f:
        payload = json.load(f)
    fleet_state = FleetState.model_validate(payload)

    policy_a = HelicynPolicy(models_dir=tmp_path)
    policy_b = HelicynPolicy(models_dir=tmp_path)

    rec_a = policy_a.recommend(fleet_state)
    rec_b = policy_b.recommend(fleet_state)

    assert rec_a.score == rec_b.score
    assert rec_a.explanation == rec_b.explanation
    assert [a.action_type for a in rec_a.selected_actions] == [b.action_type for b in rec_b.selected_actions]

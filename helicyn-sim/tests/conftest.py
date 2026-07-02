"""Shared fixtures for Phase 3 research-command tests: short-duration
variants of the real research/ablation/sensitivity configs, so tests stay
fast while still exercising the real calibrated fleet/workload.
"""
from __future__ import annotations

import yaml
import pytest

from helicyn_sim.config import load_research_config, load_sensitivity_config


@pytest.fixture
def short_research_config_path(tmp_path):
    research_config = load_research_config("configs/research_matrix.yaml")
    research_config.base.simulation.duration_hours = 1
    research_config.seeds = [1, 2]
    path = tmp_path / "short_research_matrix.yaml"
    with path.open("w") as f:
        yaml.safe_dump(research_config.model_dump(mode="json"), f)
    return path


@pytest.fixture
def short_ablation_config_path(tmp_path):
    research_config = load_research_config("configs/ablation.yaml")
    research_config.base.simulation.duration_hours = 1
    research_config.seeds = [1, 2]
    path = tmp_path / "short_ablation.yaml"
    with path.open("w") as f:
        yaml.safe_dump(research_config.model_dump(mode="json"), f)
    return path


@pytest.fixture
def short_sensitivity_config_path(tmp_path):
    sensitivity_config = load_sensitivity_config("configs/sensitivity.yaml")
    sensitivity_config.base.simulation.duration_hours = 1
    sensitivity_config.seeds = [1]
    path = tmp_path / "short_sensitivity.yaml"
    with path.open("w") as f:
        yaml.safe_dump(sensitivity_config.model_dump(mode="json"), f)
    return path

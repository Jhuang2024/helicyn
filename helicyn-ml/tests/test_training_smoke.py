from pathlib import Path

import pandas as pd
import pytest

from helicyn_ml.datasets.sample_generator import generate_grid, generate_power, generate_weather, generate_workloads
from helicyn_ml.preprocessing.split import time_split
from helicyn_ml.training import (
    train_policy_ranker,
    train_power_predictor,
    train_resource_predictor,
    train_runtime_predictor,
    train_sla_risk_model,
    train_workload_forecaster,
)


@pytest.fixture(scope="module")
def smoke_splits(tmp_path_factory):
    root = tmp_path_factory.mktemp("smoke_splits")
    workloads = generate_workloads(n=600, seed=1)
    grid = generate_grid(hours=24 * 14, seed=1)
    weather = generate_weather(hours=24 * 14, seed=1)
    power = generate_power(hours=24 * 14, seed=1)

    for kind, df in [("workloads", workloads), ("grid", grid), ("weather", weather), ("power", power)]:
        splits = time_split(df)
        for split_name, split_df in splits.items():
            out_dir = root / split_name
            out_dir.mkdir(parents=True, exist_ok=True)
            split_df.to_parquet(out_dir / f"{kind}.parquet", index=False)
    return root


def test_workload_forecaster_trains_and_saves(smoke_splits, tmp_path):
    models_dir = tmp_path / "models"
    eval_dir = tmp_path / "eval"
    result = train_workload_forecaster.run(splits_dir=smoke_splits, models_dir=models_dir, eval_dir=eval_dir)
    assert result["status"] == "trained"
    assert any((models_dir / train_workload_forecaster.wf.MODEL_NAME).glob("*/model.joblib"))


def test_runtime_predictor_trains_and_saves(smoke_splits, tmp_path):
    models_dir = tmp_path / "models"
    eval_dir = tmp_path / "eval"
    result = train_runtime_predictor.run(splits_dir=smoke_splits, models_dir=models_dir, eval_dir=eval_dir)
    assert result["status"] == "trained"
    assert (models_dir / "runtime_predictor" / "model.joblib").exists()


def test_resource_predictor_trains_and_saves(smoke_splits, tmp_path):
    models_dir = tmp_path / "models"
    eval_dir = tmp_path / "eval"
    result = train_resource_predictor.run(splits_dir=smoke_splits, models_dir=models_dir, eval_dir=eval_dir)
    assert result["status"] == "trained"


def test_sla_risk_model_trains_and_saves(smoke_splits, tmp_path):
    models_dir = tmp_path / "models"
    eval_dir = tmp_path / "eval"
    result = train_sla_risk_model.run(splits_dir=smoke_splits, models_dir=models_dir, eval_dir=eval_dir)
    assert result["status"] == "trained"
    assert (models_dir / "sla_risk_model" / "model.joblib").exists()


def test_power_predictor_trains_or_falls_back(smoke_splits, tmp_path):
    models_dir = tmp_path / "models"
    eval_dir = tmp_path / "eval"
    result = train_power_predictor.run(splits_dir=smoke_splits, models_dir=models_dir, eval_dir=eval_dir)
    assert result["status"] in {"trained", "analytical_fallback"}


def test_policy_ranker_trains_and_saves(smoke_splits, tmp_path):
    models_dir = tmp_path / "models"
    eval_dir = tmp_path / "eval"
    result = train_policy_ranker.run(splits_dir=smoke_splits, models_dir=models_dir, eval_dir=eval_dir)
    assert result["status"] == "trained"
    assert (models_dir / "policy_ranker" / "model.joblib").exists()

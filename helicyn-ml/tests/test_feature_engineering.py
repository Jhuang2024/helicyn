import numpy as np

from helicyn_ml.datasets.sample_generator import generate_grid, generate_weather, generate_workloads
from helicyn_ml.preprocessing.feature_engineering import build_grid_weather_features, build_workload_features


def test_workload_features_no_infinite_values():
    df = generate_workloads(n=200)
    features = build_workload_features(df)
    numeric = features.select_dtypes(include=[np.number])
    assert not np.isinf(numeric.to_numpy(dtype=float)).any()


def test_workload_features_handle_missing_optional_columns():
    df = generate_workloads(n=50).drop(columns=["gpu_request", "input_tokens"])
    features = build_workload_features(df)
    assert "rolling_gpu_request_15m" in features.columns
    assert features["rolling_gpu_request_15m"].isna().all()


def test_grid_weather_features_merge_and_no_infinite_values():
    grid = generate_grid(hours=48)
    weather = generate_weather(hours=48)
    merged = build_grid_weather_features(grid, weather)
    numeric = merged.select_dtypes(include=[np.number])
    assert not np.isinf(numeric.to_numpy(dtype=float)).any()
    assert "rolling_carbon_1h" in merged.columns

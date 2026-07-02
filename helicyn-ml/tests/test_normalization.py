import numpy as np
import pandas as pd

from helicyn_ml.datasets import alibaba_clusterdata, burstgpt, electricity_maps, open_meteo_loader
from helicyn_ml.schemas import NormalizedGridRecord, NormalizedWeatherRecord, NormalizedWorkloadRecord


def _clean_nan(d: dict) -> dict:
    return {k: (None if isinstance(v, float) and np.isnan(v) else v) for k, v in d.items()}


def test_alibaba_like_row_normalizes(tmp_path):
    df = pd.DataFrame(
        {
            "job_name": ["job1", "job2"],
            "task_name": ["train_task", "batch_task"],
            "start_time": [0, 100],
            "end_time": [50, 250],
            "plan_cpu": [200, 400],
            "plan_mem": [4, 8],
        }
    )
    df.to_csv(tmp_path / "batch_task.csv", index=False)

    normalized = alibaba_clusterdata.ingest(tmp_path, dataset_id="alibaba-v2018")
    assert len(normalized) == 2
    assert "workload_type" in normalized.columns

    row = _clean_nan(normalized.iloc[0].to_dict())
    row["timestamp"] = pd.Timestamp(row["timestamp"]).to_pydatetime()
    row["arrival_time"] = pd.Timestamp(row["arrival_time"]).to_pydatetime()
    row["start_time"] = pd.Timestamp(row["start_time"]).to_pydatetime() if row.get("start_time") is not None else None
    row["end_time"] = pd.Timestamp(row["end_time"]).to_pydatetime() if row.get("end_time") is not None else None
    NormalizedWorkloadRecord.model_validate(row)


def test_burstgpt_like_row_normalizes(tmp_path):
    df = pd.DataFrame(
        {
            "Timestamp": [0, 30, 90],
            "Model": ["gpt-4", "gpt-4", "gpt-3.5"],
            "Request tokens": [100, 200, 50],
            "Response tokens": [50, 80, 20],
        }
    )
    df.to_csv(tmp_path / "BurstGPT_1.csv", index=False)

    normalized = burstgpt.ingest(tmp_path)
    assert len(normalized) == 3
    assert (normalized["workload_type"] == "llm_inference").all()
    assert normalized["input_tokens"].tolist() == [100, 200, 50]


def test_grid_sample_row_normalizes():
    sample = electricity_maps._normalize(
        pd.DataFrame(
            {
                "timestamp": ["2024-01-01T00:00:00Z"],
                "region": ["us-west"],
                "carbon_intensity_gco2e_per_kwh": [300.0],
                "renewable_percentage": [40.0],
                "source_dataset": ["synthetic_sample"],
            }
        ),
        "test.csv",
    )
    row = _clean_nan(sample.iloc[0].to_dict())
    row["timestamp"] = pd.Timestamp(row["timestamp"]).to_pydatetime()
    NormalizedGridRecord.model_validate(row)


def test_weather_sample_row_normalizes():
    sample = open_meteo_loader._normalize(
        pd.DataFrame(
            {
                "timestamp": ["2024-01-01T00:00:00Z"],
                "region": ["us-west"],
                "ambient_temp_c": [18.0],
                "relative_humidity": [55.0],
            }
        ),
        "test.csv",
    )
    row = _clean_nan(sample.iloc[0].to_dict())
    row["timestamp"] = pd.Timestamp(row["timestamp"]).to_pydatetime()
    NormalizedWeatherRecord.model_validate(row)

"""Generates tiny, schema-compatible SYNTHETIC sample data for tests and
smoke demos. Every row is stamped source_dataset="synthetic_sample" so it
can never be mistaken for a real public dataset or used as research
evidence. See docs/limitations.md.
"""
from __future__ import annotations

import uuid
from pathlib import Path

import numpy as np
import pandas as pd

from helicyn_ml.config import SYNTHETIC_SAMPLE_SOURCE
from helicyn_ml.utils.io import save_parquet

WORKLOAD_TYPES = ["batch", "online_service", "llm_inference", "gpu_training", "vm"]


def generate_workloads(n: int = 600, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    base = pd.Timestamp("2024-01-01", tz="UTC")
    # scale=35s mean inter-arrival + lognormal(4.6, 1.1) durations keeps a
    # small fixed-capacity queue (see sla_risk_model.generate_weak_labels)
    # occasionally saturated, so weak deadline-miss labels have both classes.
    arrival_offsets = np.sort(rng.exponential(scale=35, size=n).cumsum())
    arrival = base + pd.to_timedelta(arrival_offsets, unit="s")
    wtype = rng.choice(WORKLOAD_TYPES, size=n, p=[0.3, 0.2, 0.25, 0.15, 0.1])

    duration = rng.lognormal(mean=4.6, sigma=1.1, size=n)
    cpu_request = rng.uniform(0.5, 16, size=n)
    mem_request = rng.uniform(1, 64, size=n)
    is_gpu = np.isin(wtype, ["llm_inference", "gpu_training"])
    gpu_request = np.where(is_gpu, rng.uniform(1, 8, size=n), 0.0)
    input_tokens = np.where(wtype == "llm_inference", rng.integers(16, 4000, size=n), 0)
    output_tokens = np.where(wtype == "llm_inference", rng.integers(16, 1500, size=n), 0)

    df = pd.DataFrame(
        {
            "source_dataset": SYNTHETIC_SAMPLE_SOURCE,
            "source_version": "v1",
            "record_id": [str(uuid.uuid4()) for _ in range(n)],
            "job_id": [f"synthetic_job_{i}" for i in range(n)],
            "task_id": None,
            "timestamp": arrival,
            "arrival_time": arrival,
            "start_time": arrival,
            "end_time": arrival + pd.to_timedelta(duration, unit="s"),
            "duration_seconds": duration,
            "workload_type": wtype,
            "cpu_request": cpu_request,
            "cpu_usage": cpu_request * rng.uniform(0.3, 0.95, size=n),
            "memory_request_gb": mem_request,
            "memory_usage_gb": mem_request * rng.uniform(0.3, 0.9, size=n),
            "gpu_request": gpu_request,
            "gpu_usage": gpu_request * rng.uniform(0.4, 0.95, size=n),
            "gpu_memory_request_gb": gpu_request * rng.uniform(4, 20, size=n),
            "gpu_memory_usage_gb": gpu_request * rng.uniform(2, 18, size=n),
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "estimated_work_units": input_tokens + output_tokens * 3 + cpu_request * 10,
            "priority": rng.uniform(0, 1, size=n),
            "scheduling_class": rng.integers(0, 4, size=n).astype(str),
            "preemptible": rng.choice([True, False], size=n, p=[0.3, 0.7]),
            "latency_sensitive": np.isin(wtype, ["online_service", "llm_inference"]),
            "region": rng.choice(["us-west", "us-east", "eu-west"], size=n),
            "machine_id": [f"m_{i % 40}" for i in range(n)],
        }
    )
    return df


def generate_grid(hours: int = 24 * 21, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    ts = pd.date_range("2024-01-01", periods=hours, freq="h", tz="UTC")
    hour = ts.hour.values
    carbon = np.clip(350 + 120 * np.cos((hour - 3) / 24 * 2 * np.pi) + rng.normal(0, 15, size=hours), 50, 700)
    price = np.clip(30 + 40 * np.clip(np.sin((hour - 6) / 24 * 2 * np.pi), 0, None) + rng.normal(0, 5, size=hours), 5, None)
    load = np.clip(20000 + 6000 * np.clip(np.sin((hour - 8) / 24 * 2 * np.pi), -0.3, None) + rng.normal(0, 400, size=hours), 0, None)
    renewable = np.clip(40 - 25 * np.cos((hour - 3) / 24 * 2 * np.pi) + rng.normal(0, 5, size=hours), 0, 100)

    return pd.DataFrame(
        {
            "source_dataset": SYNTHETIC_SAMPLE_SOURCE,
            "timestamp": ts,
            "region": "us-west",
            "carbon_intensity_gco2e_per_kwh": carbon,
            "renewable_percentage": renewable,
            "carbon_free_percentage": renewable + rng.uniform(0, 10, size=hours),
            "electricity_price_usd_per_mwh": price,
            "grid_load_mw": load,
        }
    )


def generate_weather(hours: int = 24 * 21, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    ts = pd.date_range("2024-01-01", periods=hours, freq="h", tz="UTC")
    hour = ts.hour.values
    temp = 12 + 8 * np.sin((hour - 9) / 24 * 2 * np.pi) + rng.normal(0, 1.5, size=hours)
    humidity = np.clip(60 - 15 * np.sin((hour - 9) / 24 * 2 * np.pi) + rng.normal(0, 5, size=hours), 10, 100)

    return pd.DataFrame(
        {
            "source_dataset": SYNTHETIC_SAMPLE_SOURCE,
            "timestamp": ts,
            "region": "us-west",
            "ambient_temp_c": temp,
            "relative_humidity": humidity,
            "wet_bulb_temp_c": temp - (100 - humidity) / 8,
        }
    )


def generate_power(hours: int = 24 * 21, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    ts = pd.date_range("2024-01-01", periods=hours, freq="h", tz="UTC")
    cpu = np.clip(rng.uniform(0.2, 0.95, size=hours), 0, 1)
    gpu = np.clip(rng.uniform(0.0, 0.9, size=hours), 0, 1)
    ambient = 12 + 8 * np.sin((ts.hour.values - 9) / 24 * 2 * np.pi) + rng.normal(0, 1.5, size=hours)
    # Analytical-style ground truth so a trained model can recover something real.
    power_kw = 0.6 + 1.8 * cpu + 2.4 * gpu + 0.01 * np.clip(ambient - 20, 0, None) + rng.normal(0, 0.05, size=hours)

    return pd.DataFrame(
        {
            "source_dataset": SYNTHETIC_SAMPLE_SOURCE,
            "timestamp": ts,
            "site_id": "synthetic-site-1",
            "server_id": [f"srv_{i % 10}" for i in range(hours)],
            "cpu_usage": cpu,
            "gpu_usage": gpu,
            "memory_usage": np.clip(rng.uniform(0.2, 0.9, size=hours), 0, 1),
            "network_usage": np.clip(rng.uniform(0, 1, size=hours), 0, 1),
            "ambient_temp_c": ambient,
            "power_kw": np.clip(power_kw, 0.1, None),
        }
    )


def generate_all_samples(out_dir: Path) -> dict:
    out_dir = Path(out_dir)
    paths = {
        "workloads": out_dir / "workloads_sample.parquet",
        "grid": out_dir / "grid_sample.parquet",
        "weather": out_dir / "weather_sample.parquet",
        "power": out_dir / "power_sample.parquet",
    }
    save_parquet(generate_workloads(), paths["workloads"])
    save_parquet(generate_grid(), paths["grid"])
    save_parquet(generate_weather(), paths["weather"])
    save_parquet(generate_power(), paths["power"])
    return {k: str(v) for k, v in paths.items()}

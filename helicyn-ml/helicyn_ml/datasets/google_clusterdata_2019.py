"""Google ClusterData 2019 (Borg) loader.

Source: https://github.com/google/cluster-data
The full trace is ~2.4 TiB in BigQuery public datasets
(project `google.com:google-cluster-data`, dataset `clusterdata_2019_a`
through `_h`). We deliberately do NOT attempt to download this automatically.
Instead we provide:
  * a BigQuery adapter scaffold (requires `google-cloud-bigquery` + GCP creds)
  * a local CSV/parquet loader for a small manually-exported sample
"""
from __future__ import annotations

import uuid
from pathlib import Path

import numpy as np
import pandas as pd

from helicyn_ml.datasets.dataset_card import DatasetCard
from helicyn_ml.datasets.downloader import DownloadResult
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

CARD = DatasetCard(
    dataset_id="google-2019-local",
    display_name="Google ClusterData 2019 (Borg) - local sample",
    purpose="Large-scale Borg CPU/memory workload traces at 5-minute resolution.",
    source_url="https://github.com/google/cluster-data",
    raw_subdir="google/clusterdata2019_sample",
    teaches=[
        "CPU/memory utilization patterns",
        "5-minute resource usage windows",
        "job/task behavior at cluster scale",
    ],
    limitations=[
        "Full dataset is ~2.4 TiB in BigQuery; we never download it whole.",
        "Only a manually-exported CSV/parquet sample is supported automatically.",
        "No GPU fields (this is a CPU/memory-only Borg trace).",
    ],
    requires_credentials=True,
    credential_env_vars=["GOOGLE_APPLICATION_CREDENTIALS"],
    is_huge=True,
    auto_download_supported=False,
    manual_instructions=(
        "Option A (recommended): run a BigQuery export query against "
        "`google.com:google-cluster-data.clusterdata_2019_a.instance_usage` "
        "limited to a small time window / job sample, export to CSV, and "
        "place it under data/raw/google/clusterdata2019_sample/. "
        "Option B: use bigquery_export() in this module if you have "
        "google-cloud-bigquery installed and GOOGLE_APPLICATION_CREDENTIALS set."
    ),
    ingest_target="workloads/google_2019_sample.parquet",
    kind="workload",
)


def download(out_dir: Path) -> DownloadResult:
    logger.warning("[google-2019] automatic download is not supported (dataset lives in BigQuery).")
    logger.warning(f"[google-2019] manual: {CARD.manual_instructions}")
    return DownloadResult("google-2019-local", False, "BigQuery dataset; no direct file download", CARD.manual_instructions)


def bigquery_export(query: str, out_csv: Path) -> DownloadResult:
    """Optional BigQuery adapter. Only runs if google-cloud-bigquery is
    installed and credentials are configured; never required for the
    default pipeline or tests.
    """
    try:
        from google.cloud import bigquery  # type: ignore
    except ImportError:
        return DownloadResult(
            "google-2019-local",
            False,
            "google-cloud-bigquery not installed (pip install google-cloud-bigquery)",
            CARD.manual_instructions,
        )
    try:
        client = bigquery.Client()
        df = client.query(query).to_dataframe()
        out_csv = Path(out_csv)
        out_csv.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(out_csv, index=False)
        return DownloadResult("google-2019-local", True, "bigquery export", out_path=str(out_csv))
    except Exception as exc:  # noqa: BLE001
        return DownloadResult("google-2019-local", False, f"bigquery export failed: {exc}", CARD.manual_instructions)


def ingest(input_dir: Path) -> pd.DataFrame:
    input_dir = Path(input_dir)
    files = sorted(list(input_dir.glob("*.csv")) + list(input_dir.glob("*.parquet")))
    if not files:
        logger.warning(f"[google-2019] no raw files found under {input_dir}; skipping.")
        return pd.DataFrame()

    frames = []
    for path in files:
        try:
            raw = pd.read_csv(path) if path.suffix == ".csv" else pd.read_parquet(path)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"[google-2019] failed to read {path}: {exc}")
            continue
        frames.append(_normalize(raw, path.name))
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def _normalize(raw: pd.DataFrame, source_file: str) -> pd.DataFrame:
    cols = {c.lower(): c for c in raw.columns}

    def col(*names):
        for n in names:
            if n in cols:
                return raw[cols[n]]
        return None

    n = len(raw)
    base = pd.Timestamp("2019-05-01", tz="UTC")
    start_us = pd.to_numeric(col("start_time", "time"), errors="coerce")
    arrival = base + pd.to_timedelta(start_us.fillna(0) / 1e6, unit="s") if start_us is not None else pd.Series([base] * n)

    out = pd.DataFrame(
        {
            "source_dataset": "google-2019-local",
            "source_version": source_file,
            "record_id": [str(uuid.uuid4()) for _ in range(n)],
            "job_id": col("collection_id", "job_id").astype(str) if col("collection_id", "job_id") is not None else [f"job_{i}" for i in range(n)],
            "task_id": col("instance_index", "task_id").astype(str) if col("instance_index", "task_id") is not None else None,
            "timestamp": arrival,
            "arrival_time": arrival,
            "workload_type": "cpu_batch",
            "cpu_request": pd.to_numeric(col("resource_request_cpus", "cpu_request"), errors="coerce"),
            "cpu_usage": pd.to_numeric(col("average_usage_cpus", "cpu_usage"), errors="coerce"),
            "memory_request_gb": pd.to_numeric(col("resource_request_memory", "memory_request"), errors="coerce"),
            "memory_usage_gb": pd.to_numeric(col("average_usage_memory", "memory_usage"), errors="coerce"),
            "region": "google-borg",
            "preemptible": col("scheduling_class").astype(float).le(1) if col("scheduling_class") is not None else None,
        }
    )
    return out

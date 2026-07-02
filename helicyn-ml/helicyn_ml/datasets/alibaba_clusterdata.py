"""Alibaba ClusterData loader.

Source: https://github.com/alibaba/clusterdata
The full traces (cluster-trace-v2018, cluster-trace-gpu-v2020/2023/2025/2026)
are distributed as large files via Aliyun OSS links documented in each
trace's README (e.g. cluster-trace-v2018/trace_2018.md). They are not
directly `wget`-able without following the OSS instructions in that README,
and the GPU traces in particular are tens of GB. This loader:

  * attempts to fetch the small in-repo CSV samples used for schema testing
  * falls back to printing exact manual download instructions if that fails
  * ingests whatever CSV/parquet files it finds under the target raw folder,
    using the documented v2018 batch_task / cluster-trace-gpu-v2020 schemas
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Dict

import pandas as pd

from helicyn_ml.datasets.dataset_card import DatasetCard
from helicyn_ml.datasets.downloader import DownloadResult, fetch_url
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

REPO_URL = "https://github.com/alibaba/clusterdata"

CARDS: Dict[str, DatasetCard] = {
    "alibaba-v2018": DatasetCard(
        dataset_id="alibaba-v2018",
        display_name="Alibaba Cluster Trace 2018 (batch_task/batch_instance)",
        purpose="Primary production batch cluster workload trace.",
        source_url=f"{REPO_URL}/tree/master/cluster-trace-v2018",
        raw_subdir="alibaba/v2018",
        teaches=[
            "job/task arrival patterns",
            "resource requests vs usage",
            "batch scheduling and fragmentation patterns",
        ],
        limitations=[
            "No GPU fields (CPU/memory cluster only).",
            "Anonymized machine/job IDs; no real facility power or thermal data.",
            "Full trace is large; only the in-repo CSV sample downloads automatically.",
        ],
        requires_credentials=False,
        is_huge=True,
        auto_download_supported=True,
        manual_instructions=(
            "Full trace: follow cluster-trace-v2018/trace_2018.md in "
            f"{REPO_URL} for the Aliyun OSS download links, then place the "
            "batch_task.csv / batch_instance.csv files under data/raw/alibaba/v2018/."
        ),
        ingest_target="workloads/alibaba_v2018.parquet",
        kind="workload",
    ),
    "alibaba-gpu-v2020": DatasetCard(
        dataset_id="alibaba-gpu-v2020",
        display_name="Alibaba Cluster Trace GPU 2020 (PAI)",
        purpose="Primary production AI/GPU cluster workload trace (training + inference jobs).",
        source_url=f"{REPO_URL}/tree/master/cluster-trace-gpu-v2020",
        raw_subdir="alibaba/gpu-v2020",
        teaches=[
            "GPU job arrivals and lifetimes",
            "training vs inference workload behavior",
            "GPU/CPU/memory resource requests",
            "machine/task structure and fragmentation",
        ],
        limitations=[
            "Trace is tens of GB; requires manual OSS download for the full dataset.",
            "No facility-level power, PUE, or thermal telemetry.",
            "Job semantics (train vs inference) are inferred from task naming heuristics, not ground truth labels.",
        ],
        requires_credentials=False,
        is_huge=True,
        auto_download_supported=False,
        manual_instructions=(
            "See cluster-trace-gpu-v2020/README.md in "
            f"{REPO_URL} for OSS download links (df.csv, pai_task_table.csv, "
            "pai_instance_table.csv, pai_group_tag_table.csv). Place downloaded "
            "CSVs under data/raw/alibaba/gpu-v2020/."
        ),
        ingest_target="workloads/alibaba_gpu_v2020.parquet",
        kind="workload",
    ),
}
CARD = CARDS["alibaba-gpu-v2020"]

# Small CSV samples kept in the alibaba/clusterdata repo for schema testing.
_SAMPLE_URLS = {
    "alibaba-v2018": "https://raw.githubusercontent.com/alibaba/clusterdata/master/cluster-trace-v2018/sample_data/batch_task.csv",
    "alibaba-gpu-v2020": "https://raw.githubusercontent.com/alibaba/clusterdata/master/cluster-trace-gpu-v2020/sample_data/pai_task_table.csv",
}


def download(out_dir: Path, dataset_id: str = "alibaba-v2018") -> DownloadResult:
    out_dir = Path(out_dir)
    url = _SAMPLE_URLS.get(dataset_id)
    card = CARDS.get(dataset_id, CARD)
    if url is None:
        return DownloadResult(dataset_id, False, "no automatic sample URL known", card.manual_instructions)
    result = fetch_url(url, out_dir / "sample.csv")
    if not result.success:
        result.manual_instructions = card.manual_instructions
        logger.warning(f"[alibaba:{dataset_id}] {result.reason}")
        logger.warning(f"[alibaba:{dataset_id}] manual: {result.manual_instructions}")
    return result


def _infer_workload_type(row) -> str:
    task_name = str(row.get("task_name", "")).lower()
    if "gpu" in task_name or "train" in task_name:
        return "gpu_training"
    if "infer" in task_name or "predict" in task_name:
        return "gpu_inference"
    return "cpu_batch"


def ingest(input_dir: Path, dataset_id: str = "alibaba-v2018") -> pd.DataFrame:
    """Parse whatever CSV files exist under input_dir into NormalizedWorkloadRecord rows.
    Returns an empty DataFrame (with a warning) if nothing is found.
    """
    input_dir = Path(input_dir)
    csvs = sorted(input_dir.glob("*.csv"))
    if not csvs:
        logger.warning(f"[alibaba:{dataset_id}] no raw CSVs found under {input_dir}; skipping.")
        return pd.DataFrame()

    frames = []
    for csv_path in csvs:
        try:
            raw = pd.read_csv(csv_path, low_memory=False)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"[alibaba:{dataset_id}] failed to read {csv_path}: {exc}")
            continue
        frames.append(_normalize_frame(raw, dataset_id, csv_path.name))
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def _normalize_frame(raw: pd.DataFrame, dataset_id: str, source_file: str) -> pd.DataFrame:
    cols = {c.lower(): c for c in raw.columns}

    def col(*names):
        for n in names:
            if n in cols:
                return raw[cols[n]]
        return None

    n = len(raw)
    job_id = col("job_name", "job_id")
    task_id = col("task_name", "task_id")
    start_time = col("start_time")
    end_time = col("end_time")

    now_offset = pd.Timestamp("2020-01-01", tz="UTC")
    arrival = (
        now_offset + pd.to_timedelta(pd.to_numeric(start_time, errors="coerce").fillna(0), unit="s")
        if start_time is not None
        else pd.Series([now_offset] * n)
    )
    end = (
        now_offset + pd.to_timedelta(pd.to_numeric(end_time, errors="coerce").fillna(0), unit="s")
        if end_time is not None
        else None
    )

    out = pd.DataFrame(
        {
            "source_dataset": dataset_id,
            "source_version": source_file,
            "record_id": [str(uuid.uuid4()) for _ in range(n)],
            "job_id": job_id.astype(str) if job_id is not None else [f"job_{i}" for i in range(n)],
            "task_id": task_id.astype(str) if task_id is not None else None,
            "timestamp": arrival,
            "arrival_time": arrival,
            "start_time": arrival,
            "end_time": end,
            "cpu_request": pd.to_numeric(col("plan_cpu", "cpu_request"), errors="coerce") if col("plan_cpu", "cpu_request") is not None else None,
            "memory_request_gb": pd.to_numeric(col("plan_mem", "memory_request"), errors="coerce") if col("plan_mem", "memory_request") is not None else None,
            "gpu_request": pd.to_numeric(col("plan_gpu", "gpu_request"), errors="coerce") if col("plan_gpu", "gpu_request") is not None else None,
            "region": "alibaba-cluster",
            "preemptible": False,
            "latency_sensitive": False,
        }
    )
    if end is not None:
        out["duration_seconds"] = (out["end_time"] - out["start_time"]).dt.total_seconds().clip(lower=0)
    out["workload_type"] = raw.apply(_infer_workload_type, axis=1) if "task_name" in raw.columns else "cpu_batch"
    return out

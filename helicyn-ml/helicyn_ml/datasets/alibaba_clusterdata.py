"""Alibaba ClusterData loader.

Source: https://github.com/alibaba/clusterdata
The full traces are distributed as .tar.gz files on Aliyun OSS
(oss-cn-beijing.aliyuncs.com), documented via each trace's own fetch script:
  * cluster-trace-v2018/fetchData.sh -> http://aliopentrace.oss-cn-beijing.aliyuncs.com/v2018Traces/*.tar.gz
    (6 tables; batch_task.tar.gz is the smallest at ~125MB, full set ~48GB)
  * cluster-trace-gpu-v2020/README.md -> https://aliopentrace.oss-cn-beijing.aliyuncs.com/v2020GPUTraces/*.tar.gz
    (7 tables; pai_job_table.tar.gz is the job-level table, smallest of the set)
Neither requires the optional survey mentioned in the v2018 README - that is
an alternate contact-collection path, not a gate on the direct OSS links.
This loader attempts the smallest real table for each trace directly via
those OSS URLs (auto-extracting the .tar.gz on success), and falls back to
printing the exact manual command if the download fails (e.g. a network
policy that blocks the aliyuncs.com host, as in some sandboxed CI
environments) or the full trace is wanted.
"""
from __future__ import annotations

import tarfile
import uuid
from pathlib import Path
from typing import Dict

import pandas as pd

from helicyn_ml.datasets.dataset_card import DatasetCard
from helicyn_ml.datasets.downloader import DownloadResult, fetch_url
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

REPO_URL = "https://github.com/alibaba/clusterdata"
_OSS_V2018 = "http://aliopentrace.oss-cn-beijing.aliyuncs.com/v2018Traces"
_OSS_GPU_V2020 = "https://aliopentrace.oss-cn-beijing.aliyuncs.com/v2020GPUTraces"

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
            "Full trace is 4000 machines over 8 days (~48GB/6 tables, ~280GB extracted); "
            "only the smallest single table (batch_task.tar.gz, ~125MB) downloads automatically.",
        ],
        requires_credentials=False,
        is_huge=True,
        auto_download_supported=True,
        manual_instructions=(
            f"Smallest table: {_OSS_V2018}/batch_task.tar.gz (~125MB), extract and place "
            "batch_task.csv under data/raw/alibaba/v2018/. Full trace (6 tables, ~48GB): run "
            "`bash cluster-trace-v2018/fetchData.sh` from a checkout of "
            f"{REPO_URL} (pulls all 6 tables from the same OSS bucket)."
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
            "Full trace (7 tables: job/task/instance/sensor/group_tag/machine_spec/machine_metric) is "
            "tens of GB; only the smallest table (pai_job_table.tar.gz, job-level) downloads automatically.",
            "No facility-level power, PUE, or thermal telemetry.",
            "Job semantics (train vs inference) are inferred from task naming heuristics, not ground truth labels.",
        ],
        requires_credentials=False,
        is_huge=True,
        auto_download_supported=True,
        manual_instructions=(
            f"Smallest table: {_OSS_GPU_V2020}/pai_job_table.tar.gz, extract and place "
            "pai_job_table.csv under data/raw/alibaba/gpu-v2020/. Full trace: see "
            f"cluster-trace-gpu-v2020/README.md in {REPO_URL} for all 7 table URLs "
            "(pai_task_table, pai_instance_table, pai_sensor_table, pai_group_tag_table, "
            "pai_machine_spec, pai_machine_metric, same OSS bucket)."
        ),
        ingest_target="workloads/alibaba_gpu_v2020.parquet",
        kind="workload",
    ),
}
CARD = CARDS["alibaba-gpu-v2020"]

# Smallest real table per trace - not survey-gated, but hosted on Aliyun OSS,
# which some network policies (including this project's own sandboxed CI)
# block outright. The download attempt is real; the fallback is expected
# there.
_SAMPLE_URLS = {
    "alibaba-v2018": f"{_OSS_V2018}/batch_task.tar.gz",
    "alibaba-gpu-v2020": f"{_OSS_GPU_V2020}/pai_job_table.tar.gz",
}


def _safe_extract_tar(tar_path: Path, dest_dir: Path) -> bool:
    try:
        with tarfile.open(tar_path) as tar:
            for member in tar.getmembers():
                # Reject path traversal / absolute paths before extracting anything.
                member_path = (dest_dir / member.name).resolve()
                if not str(member_path).startswith(str(dest_dir.resolve())):
                    logger.warning(f"[alibaba] refusing to extract unsafe path in archive: {member.name}")
                    return False
            tar.extractall(dest_dir)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[alibaba] failed to extract {tar_path}: {exc}")
        return False


def download(out_dir: Path, dataset_id: str = "alibaba-v2018") -> DownloadResult:
    out_dir = Path(out_dir)
    url = _SAMPLE_URLS.get(dataset_id)
    card = CARDS.get(dataset_id, CARD)
    if url is None:
        return DownloadResult(dataset_id, False, "no automatic sample URL known", card.manual_instructions)

    archive_path = out_dir / Path(url).name
    result = fetch_url(url, archive_path)
    if not result.success:
        result.manual_instructions = card.manual_instructions
        logger.warning(f"[alibaba:{dataset_id}] {result.reason}")
        logger.warning(f"[alibaba:{dataset_id}] manual: {result.manual_instructions}")
        return result

    if _safe_extract_tar(archive_path, out_dir):
        logger.info(f"[alibaba:{dataset_id}] extracted {archive_path.name} into {out_dir}")
    else:
        result.success = False
        result.reason = f"downloaded {archive_path.name} but failed to extract it"
        result.manual_instructions = f"Manually run: tar xzf {archive_path} -C {out_dir}"
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

    # If a .tar.gz was placed manually (e.g. downloaded outside of `datasets
    # download`) without being extracted, extract it here rather than
    # reporting "no data found".
    for archive in input_dir.glob("*.tar.gz"):
        if _safe_extract_tar(archive, input_dir):
            logger.info(f"[alibaba:{dataset_id}] extracted {archive.name} found under {input_dir}")

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

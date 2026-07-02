"""Google ClusterData-derived CPU/Memory utilization loader (preprocessed).

Source: https://github.com/HiPro-IT/CPU-and-Memory-resource-usage-from-Google-Cluster-Data
A preprocessed extraction from the original Google Cluster Data (2011),
published alongside "Virtual Machine Consolidation with Multiple Usage
Prediction for Energy-Efficient Cloud Data Centers" (IEEE TSC). Tasks were
aggregated by summing CPU/memory consumption every 5 minutes over 24 hours,
extracted over the first 10 days of May 2011, filtered to 5-90% utilization,
resulting in 1,600 VM traces.

This is NOT a synthetic dataset - it is real Google Cluster Data, just
pre-aggregated by the paper's authors rather than a raw per-task trace.
Confirmed reachable and inspected during recon
(artifacts/reports/github_resource_dataset_recon.md): raw.githubusercontent.com
serves GCD_VMs.tar.gz directly (~3.25MB) from the repo's `master` branch.
"""
from __future__ import annotations

import tarfile
from pathlib import Path

import pandas as pd

from helicyn_ml.datasets.dataset_card import DatasetCard
from helicyn_ml.datasets.downloader import DownloadResult, fetch_url
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

REPO_URL = "https://github.com/HiPro-IT/CPU-and-Memory-resource-usage-from-Google-Cluster-Data"
_ARCHIVE_URL = (
    "https://raw.githubusercontent.com/HiPro-IT/"
    "CPU-and-Memory-resource-usage-from-Google-Cluster-Data/master/GCD_VMs.tar.gz"
)
INTERVAL_MINUTES = 5.0

CARD = DatasetCard(
    dataset_id="google-cluster-cpu-memory-preprocessed",
    display_name="Google ClusterData CPU/Memory Utilization (preprocessed, HiPro-IT)",
    purpose="Real per-VM CPU and memory utilization time series for training ResourcePredictor.",
    source_url=f"{REPO_URL}",
    source_repo=REPO_URL,
    raw_subdir="google_cpu_memory",
    teaches=[
        "real CPU utilization time series per VM (5-minute intervals, 24h)",
        "real memory utilization time series per VM",
        "cross-VM utilization variance in a real production cluster",
    ],
    limitations=[
        "Pre-aggregated by the paper's authors (summed per 5-minute window), not the raw Google ClusterData task trace.",
        "Only records already filtered to 5-90% utilization - excludes idle and saturated VMs by construction.",
        "No real calendar timestamps: each file is a 24-hour, 288-row sequence with no absolute date/time; "
        "normalized here with timestamp_is_relative=true and a synthetic 5-minute time_index, never presented as real clock time.",
        "No GPU, no memory/CPU *requests* (only usage), no SLA, no power/cooling/PUE data.",
    ],
    requires_credentials=False,
    is_huge=False,
    auto_download_supported=True,
    manual_instructions=(
        f"Download {_ARCHIVE_URL} and extract it (tar xzf GCD_VMs.tar.gz) under data/raw/google_cpu_memory/."
    ),
    ingest_target="resources/google_cpu_memory.parquet",
    kind="resource",
)


def download(out_dir: Path) -> DownloadResult:
    out_dir = Path(out_dir)
    extracted_dir = out_dir / "GCD_VMs"
    if extracted_dir.exists() and any(extracted_dir.iterdir()):
        n_files = sum(1 for _ in extracted_dir.iterdir())
        logger.info(f"[google-cpu-memory] already extracted at {extracted_dir} ({n_files} files); skipping re-download.")
        return DownloadResult(
            CARD.dataset_id, True, f"already extracted ({n_files} files)", out_path=str(extracted_dir)
        )

    archive_path = out_dir / "GCD_VMs.tar.gz"
    result = fetch_url(_ARCHIVE_URL, archive_path)
    if not result.success:
        result.manual_instructions = CARD.manual_instructions
        logger.warning(f"[google-cpu-memory] {result.reason}")
        logger.warning(f"[google-cpu-memory] manual: {result.manual_instructions}")
        return result

    archive_size = archive_path.stat().st_size
    try:
        with tarfile.open(archive_path) as tar:
            for member in tar.getmembers():
                member_path = (out_dir / member.name).resolve()
                if not str(member_path).startswith(str(out_dir.resolve())):
                    logger.warning(f"[google-cpu-memory] refusing to extract unsafe path in archive: {member.name}")
                    result.success = False
                    result.reason = "archive contained an unsafe path; extraction aborted"
                    return result
            tar.extractall(out_dir)
    except Exception as exc:  # noqa: BLE001
        result.success = False
        result.reason = f"downloaded {archive_size} bytes but failed to extract: {exc}"
        result.manual_instructions = f"Manually run: tar xzf {archive_path} -C {out_dir}"
        logger.warning(f"[google-cpu-memory] {result.reason}")
        return result

    if not extracted_dir.exists():
        result.success = False
        result.reason = f"extraction completed but expected directory {extracted_dir} was not found"
        logger.warning(f"[google-cpu-memory] {result.reason}")
        return result

    n_files = sum(1 for _ in extracted_dir.iterdir())
    logger.info(f"[google-cpu-memory] downloaded {archive_size} bytes, extracted {n_files} VM trace files into {extracted_dir}")
    result.reason = f"downloaded and extracted ({n_files} files, {archive_size} bytes)"
    return result


def ingest(input_dir: Path) -> pd.DataFrame:
    input_dir = Path(input_dir)
    extracted_dir = input_dir / "GCD_VMs"
    search_dir = extracted_dir if extracted_dir.exists() else input_dir

    vm_files = sorted(p for p in search_dir.iterdir() if p.is_file() and p.name.startswith("vm_"))
    if not vm_files:
        logger.warning(f"[google-cpu-memory] no vm_* trace files found under {search_dir}; skipping.")
        return pd.DataFrame()

    frames = []
    for vm_path in vm_files:
        try:
            raw = pd.read_csv(vm_path, sep=r"\s+", header=None, names=["cpu_usage_percent", "memory_usage_percent"])
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"[google-cpu-memory] failed to read {vm_path.name}: {exc}")
            continue
        n = len(raw)
        frames.append(
            pd.DataFrame(
                {
                    "source_dataset": "google_cluster_cpu_memory_preprocessed",
                    "source_repo": REPO_URL,
                    "trace_id": vm_path.name,
                    "vm_id": vm_path.name,
                    "timestamp": None,
                    "time_index": range(n),
                    "timestamp_is_relative": True,
                    "interval_minutes": INTERVAL_MINUTES,
                    "cpu_usage_percent": raw["cpu_usage_percent"],
                    "memory_usage_percent": raw["memory_usage_percent"],
                    "raw_file": vm_path.name,
                }
            )
        )

    if not frames:
        return pd.DataFrame()
    out = pd.concat(frames, ignore_index=True)
    logger.info(f"[google-cpu-memory] parsed {len(vm_files)} VM trace files into {len(out)} rows")
    return out

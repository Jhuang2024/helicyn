"""Azure Public Dataset loader.

Source: https://github.com/Azure/AzurePublicDataset
Covers VM traces, Azure Functions traces, and LLM inference traces
(AzureLLMInferenceTrace 2023/2024). VM traces are large CSVs hosted on Azure
Blob Storage (235GB / 156GB compressed, 198 files, per AzurePublicDatasetV2.md);
Azure Functions 2019 is a GitHub Release .tar.xz asset; LLM inference traces
are small CSVs checked directly into the GitHub repo (~700KB each) - those
are what auto-download reliably.
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Dict

import numpy as np
import pandas as pd

from helicyn_ml.datasets.dataset_card import DatasetCard
from helicyn_ml.datasets.downloader import DownloadResult, fetch_url
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

REPO_URL = "https://github.com/Azure/AzurePublicDataset"

CARDS: Dict[str, DatasetCard] = {
    "azure-public": DatasetCard(
        dataset_id="azure-public",
        display_name="Azure Public Dataset (VM/Functions traces)",
        purpose="Cloud VM lifetime and serverless invocation traces.",
        source_url=f"{REPO_URL}/blob/master/AzurePublicDatasetV2.md",
        raw_subdir="azure/public-v2",
        teaches=["VM lifetime and resource demand", "request burstiness for serverless workloads"],
        limitations=[
            "VM traces report 5-minute avg CPU utilization only, no GPU/memory usage.",
            "Full VM trace is 235GB (156GB compressed, 198 files, 30 days, 2.7M VMs) hosted on Azure Blob "
            "Storage via links in AzurePublicDatasetLinksV2.txt - not fetchable via a single URL.",
        ],
        requires_credentials=False,
        is_huge=True,
        auto_download_supported=False,
        manual_instructions=(
            f"See {REPO_URL}/blob/master/AzurePublicDatasetLinksV2.txt for the "
            "Azure Blob Storage download links (198 files); place CSVs under data/raw/azure/public-v2/."
        ),
        ingest_target="workloads/azure_public.parquet",
        kind="workload",
    ),
    "azure-functions-2019": DatasetCard(
        dataset_id="azure-functions-2019",
        display_name="Azure Functions Trace 2019",
        purpose="Serverless function invocation counts, execution time, and memory allocation traces.",
        source_url=f"{REPO_URL}/blob/master/AzureFunctionsDataset2019.md",
        raw_subdir="azure/functions-2019",
        teaches=[
            "serverless invocation burstiness (per-minute counts over 14 days)",
            "function execution time distributions",
            "application-level memory allocation patterns",
        ],
        limitations=[
            "Distributed as a single GitHub Release asset (azurefunctions_dataset2019_azurefunctions-dataset2019.tar.xz), "
            "not a plain file under the repo tree - GitHub Release downloads are blocked by some network policies "
            "even when raw.githubusercontent.com file access works.",
            "A random, unspecified sample of applications, not a full production trace.",
        ],
        requires_credentials=False,
        is_huge=False,
        auto_download_supported=True,
        manual_instructions=(
            "Download https://github.com/Azure/AzurePublicDataset/releases/download/dataset-functions-2019/"
            "azurefunctions_dataset2019_azurefunctions-dataset2019.tar.xz, extract, and place the "
            "invocations_per_function_md.anon.d*.csv files under data/raw/azure/functions-2019/."
        ),
        ingest_target="workloads/azure_functions_2019.parquet",
        kind="workload",
    ),
    "azure-llm-2024": DatasetCard(
        dataset_id="azure-llm-2024",
        display_name="Azure LLM Inference Trace 2024",
        purpose="Real-world LLM inference request trace (prompt/generated token counts, timestamps).",
        source_url=f"{REPO_URL}/tree/master/data/AzureLLMInferenceTrace_2024",
        raw_subdir="azure/llm-2024",
        teaches=[
            "LLM request arrival patterns",
            "input/output token distributions",
            "inference latency sensitivity",
        ],
        limitations=[
            "Traces are anonymized and do not include model weights, GPU type, or facility power.",
            "Only a subset of Azure's internal LLM fleet is represented.",
        ],
        requires_credentials=False,
        is_huge=False,
        auto_download_supported=True,
        manual_instructions=(
            f"Download AzureLLMInferenceTrace_conv.csv / *_code.csv from {REPO_URL}"
            "/tree/master/data/AzureLLMInferenceTrace_2024 and place under data/raw/azure/llm-2024/."
        ),
        ingest_target="workloads/azure_llm_2024.parquet",
        kind="workload",
    ),
}
CARD = CARDS["azure-llm-2024"]

_LLM_SAMPLE_URLS = [
    "https://raw.githubusercontent.com/Azure/AzurePublicDataset/master/data/AzureLLMInferenceTrace_conv.csv",
    "https://raw.githubusercontent.com/Azure/AzurePublicDataset/master/data/AzureLLMInferenceTrace_code.csv",
]
_FUNCTIONS_2019_URL = (
    "https://github.com/Azure/AzurePublicDataset/releases/download/dataset-functions-2019/"
    "azurefunctions_dataset2019_azurefunctions-dataset2019.tar.xz"
)


def download(out_dir: Path, dataset_id: str = "azure-llm-2024") -> DownloadResult:
    out_dir = Path(out_dir)
    card = CARDS.get(dataset_id, CARD)

    if dataset_id == "azure-llm-2024":
        last_result = None
        any_success = False
        for url in _LLM_SAMPLE_URLS:
            result = fetch_url(url, out_dir / Path(url).name)
            any_success = any_success or result.success
            last_result = result
            if not result.success:
                logger.warning(f"[azure:{dataset_id}] {url}: {result.reason}")
        if not any_success and last_result is not None:
            last_result.manual_instructions = card.manual_instructions
            logger.warning(f"[azure:{dataset_id}] manual: {card.manual_instructions}")
        return last_result

    if dataset_id == "azure-functions-2019":
        archive_path = out_dir / "azurefunctions_dataset2019.tar.xz"
        result = fetch_url(_FUNCTIONS_2019_URL, archive_path)
        if not result.success:
            result.manual_instructions = card.manual_instructions
            logger.warning(f"[azure:{dataset_id}] {result.reason}")
            logger.warning(f"[azure:{dataset_id}] manual: {result.manual_instructions}")
            return result
        try:
            import tarfile

            with tarfile.open(archive_path) as tar:
                tar.extractall(out_dir)
            logger.info(f"[azure:{dataset_id}] extracted {archive_path.name} into {out_dir}")
        except Exception as exc:  # noqa: BLE001
            result.success = False
            result.reason = f"downloaded but failed to extract: {exc}"
            result.manual_instructions = f"Manually run: tar xJf {archive_path} -C {out_dir}"
            logger.warning(f"[azure:{dataset_id}] {result.reason}")
        return result

    logger.warning(f"[azure:{dataset_id}] no automatic download available.")
    logger.warning(f"[azure:{dataset_id}] manual: {card.manual_instructions}")
    return DownloadResult(dataset_id, False, "requires manual download (see instructions)", card.manual_instructions)


def ingest(input_dir: Path, dataset_id: str = "azure-llm-2024") -> pd.DataFrame:
    input_dir = Path(input_dir)
    csvs = sorted(input_dir.glob("*.csv"))
    if not csvs:
        logger.warning(f"[azure:{dataset_id}] no raw CSVs found under {input_dir}; skipping.")
        return pd.DataFrame()

    frames = []
    for csv_path in csvs:
        try:
            raw = pd.read_csv(csv_path, low_memory=False)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"[azure:{dataset_id}] failed to read {csv_path}: {exc}")
            continue
        if "llm" in dataset_id:
            frames.append(_normalize_llm(raw, dataset_id, csv_path.name))
        elif "functions" in dataset_id:
            frames.append(_normalize_functions(raw, dataset_id, csv_path.name))
        else:
            frames.append(_normalize_vm(raw, dataset_id, csv_path.name))
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def _normalize_llm(raw: pd.DataFrame, dataset_id: str, source_file: str) -> pd.DataFrame:
    cols = {c.lower(): c for c in raw.columns}

    def col(*names):
        for n in names:
            if n in cols:
                return raw[cols[n]]
        return None

    n = len(raw)
    ts_col = col("timestamp", "arrivaltime", "arrival_time")
    if ts_col is not None:
        arrival = pd.to_datetime(ts_col, errors="coerce", utc=True)
        arrival = arrival.fillna(pd.Timestamp("2024-01-01", tz="UTC"))
    else:
        base = pd.Timestamp("2024-01-01", tz="UTC")
        arrival = base + pd.to_timedelta(np.arange(n), unit="s")

    input_tokens = pd.to_numeric(col("contexttokens", "input_tokens", "prompt_tokens"), errors="coerce")
    output_tokens = pd.to_numeric(col("generatedtokens", "output_tokens", "completion_tokens"), errors="coerce")

    out = pd.DataFrame(
        {
            "source_dataset": dataset_id,
            "source_version": source_file,
            "record_id": [str(uuid.uuid4()) for _ in range(n)],
            "job_id": [f"{dataset_id}_{i}" for i in range(n)],
            "timestamp": arrival,
            "arrival_time": arrival,
            "workload_type": "llm_inference",
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "estimated_work_units": (input_tokens.fillna(0) + output_tokens.fillna(0) * 3) if input_tokens is not None else None,
            "latency_sensitive": True,
            "preemptible": False,
            "region": "azure",
        }
    )
    return out


def _normalize_vm(raw: pd.DataFrame, dataset_id: str, source_file: str) -> pd.DataFrame:
    cols = {c.lower(): c for c in raw.columns}

    def col(*names):
        for n in names:
            if n in cols:
                return raw[cols[n]]
        return None

    n = len(raw)
    base = pd.Timestamp("2019-01-01", tz="UTC")
    starttime = pd.to_numeric(col("starttime", "vmcreated"), errors="coerce")
    endtime = pd.to_numeric(col("endtime", "vmdeleted"), errors="coerce")
    arrival = base + pd.to_timedelta(starttime.fillna(0), unit="s") if starttime is not None else pd.Series([base] * n)
    end = base + pd.to_timedelta(endtime.fillna(0), unit="s") if endtime is not None else None

    out = pd.DataFrame(
        {
            "source_dataset": dataset_id,
            "source_version": source_file,
            "record_id": [str(uuid.uuid4()) for _ in range(n)],
            "job_id": col("vmid", "vm_id").astype(str) if col("vmid", "vm_id") is not None else [f"vm_{i}" for i in range(n)],
            "timestamp": arrival,
            "arrival_time": arrival,
            "start_time": arrival,
            "end_time": end,
            "workload_type": "vm",
            "cpu_request": pd.to_numeric(col("vmcorecountbucket", "core_count"), errors="coerce"),
            "region": "azure",
            "preemptible": False,
        }
    )
    if end is not None:
        out["duration_seconds"] = (out["end_time"] - out["start_time"]).dt.total_seconds().clip(lower=0)
    return out


def _normalize_functions(raw: pd.DataFrame, dataset_id: str, source_file: str) -> pd.DataFrame:
    """Azure Functions 2019 invocation-count files have one row per function
    and 1440 minute-of-day columns (one 24h period per file). This is a
    coarse aggregation, not per-invocation events: each function becomes one
    NormalizedWorkloadRecord with estimated_work_units = total invocations
    that day. Finer-grained (per-minute) records could be derived later if a
    model specifically needs them - this loader keeps it simple and honest
    about being an aggregate.
    """
    minute_cols = [c for c in raw.columns if str(c).isdigit()]
    n = len(raw)
    base = pd.Timestamp("2019-07-01", tz="UTC")

    out = pd.DataFrame(
        {
            "source_dataset": dataset_id,
            "source_version": source_file,
            "record_id": [str(uuid.uuid4()) for _ in range(n)],
            "job_id": raw.get("HashFunction", pd.Series([f"func_{i}" for i in range(n)])).astype(str),
            "timestamp": base,
            "arrival_time": base,
            "workload_type": "serverless",
            "estimated_work_units": raw[minute_cols].sum(axis=1) if minute_cols else None,
            "latency_sensitive": raw.get("Trigger", pd.Series(["http"] * n)).astype(str).str.lower().eq("http"),
            "preemptible": False,
            "region": "azure",
        }
    )
    return out

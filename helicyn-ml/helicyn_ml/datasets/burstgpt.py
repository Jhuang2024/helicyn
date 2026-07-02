"""BurstGPT loader.

Source: https://github.com/HPMLL/BurstGPT
Real-world LLM serving workload trace (ChatGPT/GPT-4 request logs) released
as CSV files directly in the repo / GitHub releases. Columns (per the
BurstGPT README): Timestamp, Model, Request tokens, Response tokens, Total
tokens, Log Type.
"""
from __future__ import annotations

import uuid
from pathlib import Path

import pandas as pd

from helicyn_ml.datasets.dataset_card import DatasetCard
from helicyn_ml.datasets.downloader import DownloadResult, fetch_url
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

REPO_URL = "https://github.com/HPMLL/BurstGPT"

CARD = DatasetCard(
    dataset_id="burstgpt",
    display_name="BurstGPT",
    purpose="Real-world bursty LLM serving workload trace.",
    source_url=REPO_URL,
    raw_subdir="burstgpt",
    teaches=[
        "bursty LLM serving demand over time",
        "request arrival patterns",
        "input/output token length distributions",
        "model mix in a production LLM serving fleet",
    ],
    limitations=[
        "No GPU type, batch size, or facility power information.",
        "Anonymized/aggregated; cannot be tied to a specific real deployment.",
    ],
    requires_credentials=False,
    is_huge=False,
    auto_download_supported=True,
    manual_instructions=(
        f"Download BurstGPT_1.csv (or another release CSV) from {REPO_URL} "
        "and place it under data/raw/burstgpt/."
    ),
    ingest_target="workloads/burstgpt.parquet",
    kind="workload",
)

_SAMPLE_URL = "https://raw.githubusercontent.com/HPMLL/BurstGPT/main/data/BurstGPT_1.csv"


def download(out_dir: Path) -> DownloadResult:
    out_dir = Path(out_dir)
    result = fetch_url(_SAMPLE_URL, out_dir / "BurstGPT_1.csv")
    if not result.success:
        result.manual_instructions = CARD.manual_instructions
        logger.warning(f"[burstgpt] {result.reason}")
        logger.warning(f"[burstgpt] manual: {result.manual_instructions}")
    return result


def ingest(input_dir: Path) -> pd.DataFrame:
    input_dir = Path(input_dir)
    csvs = sorted(input_dir.glob("*.csv"))
    if not csvs:
        logger.warning(f"[burstgpt] no raw CSVs found under {input_dir}; skipping.")
        return pd.DataFrame()

    frames = []
    for csv_path in csvs:
        try:
            raw = pd.read_csv(csv_path)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"[burstgpt] failed to read {csv_path}: {exc}")
            continue
        frames.append(_normalize(raw, csv_path.name))
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def _normalize(raw: pd.DataFrame, source_file: str) -> pd.DataFrame:
    cols = {c.lower().replace(" ", "_"): c for c in raw.columns}

    def col(*names):
        for n in names:
            if n in cols:
                return raw[cols[n]]
        return None

    n = len(raw)
    ts = pd.to_numeric(col("timestamp"), errors="coerce")
    base = pd.Timestamp("2023-01-01", tz="UTC")
    arrival = base + pd.to_timedelta(ts.fillna(0), unit="s") if ts is not None else pd.Series([base] * n)

    input_tokens = pd.to_numeric(col("request_tokens", "input_tokens"), errors="coerce")
    output_tokens = pd.to_numeric(col("response_tokens", "output_tokens"), errors="coerce")
    model = col("model")

    out = pd.DataFrame(
        {
            "source_dataset": "burstgpt",
            "source_version": source_file,
            "record_id": [str(uuid.uuid4()) for _ in range(n)],
            "job_id": [f"burstgpt_{i}" for i in range(n)],
            "timestamp": arrival,
            "arrival_time": arrival,
            "workload_type": "llm_inference",
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "estimated_work_units": input_tokens.fillna(0) + output_tokens.fillna(0) * 3,
            "gpu_request": 1.0,
            "latency_sensitive": True,
            "preemptible": False,
            "region": "burstgpt-fleet",
            "raw_metadata_json": model.astype(str) if model is not None else None,
        }
    )
    return out

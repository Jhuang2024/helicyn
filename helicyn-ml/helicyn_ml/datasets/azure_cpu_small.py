"""Azure VM aggregate CPU usage loader (small, GitHub-hosted).

Source: https://github.com/amcs1729/Predicting-cloud-CPU-usage-on-Azure-data
A single `azure.csv` file (633KB, repo's `master` branch) with columns
`timestamp, min cpu, max cpu, avg cpu` at 5-minute intervals over 30 days
(8,640 rows). Confirmed reachable during recon
(artifacts/reports/github_resource_dataset_recon.md).

IMPORTANT UNIT CAVEAT (discovered during recon, not assumed): despite the
column names, these values are NOT bounded 0-100 - `min cpu` ranges roughly
586K-1.15M, `max cpu` roughly 1.8M-3.5M, `avg cpu` roughly 979K-1.82M. This
looks like some raw aggregate compute-demand magnitude (unit unconfirmed -
possibly summed CPU-cycle or instruction-count-style metric across a VM
fleet), not a single VM's percent utilization. This loader stores the raw
values as-is into the `*_cpu_usage_percent` schema fields (there is no
separate "raw units" field in NormalizedResourceTimeseriesRecord) and
documents this prominently rather than silently rescaling them into a
fabricated 0-100 range, which would misrepresent the data.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from helicyn_ml.datasets.dataset_card import DatasetCard
from helicyn_ml.datasets.downloader import DownloadResult, fetch_url
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

REPO_URL = "https://github.com/amcs1729/Predicting-cloud-CPU-usage-on-Azure-data"
_CSV_URL = "https://raw.githubusercontent.com/amcs1729/Predicting-cloud-CPU-usage-on-Azure-data/master/azure.csv"
INTERVAL_MINUTES = 5.0

CARD = DatasetCard(
    dataset_id="azure-cpu-usage-small",
    display_name="Azure VM Aggregate CPU Usage (small, GitHub-hosted)",
    purpose="CPU-only supplementary time series for ResourcePredictor / demand forecasting.",
    source_url=f"{REPO_URL}",
    source_repo=REPO_URL,
    raw_subdir="azure_cpu_small",
    teaches=[
        "real min/max/avg CPU demand time series at 5-minute resolution over 30 real calendar days",
    ],
    limitations=[
        "CPU-only - no memory, no GPU.",
        "Values are NOT a bounded 0-100 percentage despite the 'cpu' column naming - unit is unconfirmed "
        "(likely a raw aggregate compute-demand magnitude). Never rescaled/fabricated into a percentage here.",
        "Single aggregate series (no per-VM breakdown) - normalized with vm_id='azure_aggregate'.",
        "No resource requests, only measured usage.",
    ],
    requires_credentials=False,
    is_huge=False,
    auto_download_supported=True,
    manual_instructions=f"Download {_CSV_URL} and place it under data/raw/azure_cpu_small/.",
    ingest_target="resources/azure_cpu_small.parquet",
    kind="resource",
)


def download(out_dir: Path) -> DownloadResult:
    out_dir = Path(out_dir)
    result = fetch_url(_CSV_URL, out_dir / "azure.csv")
    if not result.success:
        result.manual_instructions = CARD.manual_instructions
        logger.warning(f"[azure-cpu-small] {result.reason}")
        logger.warning(f"[azure-cpu-small] manual: {result.manual_instructions}")
    return result


def ingest(input_dir: Path) -> pd.DataFrame:
    input_dir = Path(input_dir)
    csvs = sorted(input_dir.glob("*.csv"))
    if not csvs:
        logger.warning(f"[azure-cpu-small] no raw CSVs found under {input_dir}; skipping.")
        return pd.DataFrame()

    frames = []
    for csv_path in csvs:
        try:
            raw = pd.read_csv(csv_path)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"[azure-cpu-small] failed to read {csv_path}: {exc}")
            continue
        frames.append(_normalize(raw, csv_path.name))
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def _normalize(raw: pd.DataFrame, source_file: str) -> pd.DataFrame:
    cols = {c.lower().strip(): c for c in raw.columns}

    def col(*names):
        for n in names:
            if n in cols:
                return raw[cols[n]]
        return None

    n = len(raw)
    ts_col = col("timestamp", "time")
    has_real_timestamp = ts_col is not None
    if has_real_timestamp:
        timestamp = pd.to_datetime(ts_col, utc=True, errors="coerce")
    else:
        timestamp = None

    min_cpu = col("min cpu", "min_cpu", "mincpu")
    max_cpu = col("max cpu", "max_cpu", "maxcpu")
    avg_cpu = col("avg cpu", "avg_cpu", "average cpu", "average_cpu", "avgcpu")

    out = pd.DataFrame(
        {
            "source_dataset": "azure_cpu_usage_small",
            "source_repo": REPO_URL,
            "trace_id": "azure_aggregate",
            "vm_id": "azure_aggregate",
            "timestamp": timestamp if has_real_timestamp else None,
            "time_index": range(n),
            "timestamp_is_relative": not has_real_timestamp,
            "interval_minutes": INTERVAL_MINUTES,
            "min_cpu_usage_percent": pd.to_numeric(min_cpu, errors="coerce") if min_cpu is not None else None,
            "max_cpu_usage_percent": pd.to_numeric(max_cpu, errors="coerce") if max_cpu is not None else None,
            "avg_cpu_usage_percent": pd.to_numeric(avg_cpu, errors="coerce") if avg_cpu is not None else None,
            "raw_file": source_file,
        }
    )
    return out

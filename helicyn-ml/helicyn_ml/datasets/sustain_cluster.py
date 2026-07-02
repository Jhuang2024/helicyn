"""SustainCluster / SustainDC loader.

Source: https://github.com/HewlettPackard/dc-rl (SustainDC) and related
SustainCluster benchmark work. Used as a reference-compatible schema source
for future simulator integration, not as a primary training dataset - we do
not copy its simulator architecture, only align field naming where sensible
(e.g. site/rack/server power and thermal signals).
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from helicyn_ml.datasets.dataset_card import DatasetCard
from helicyn_ml.datasets.downloader import DownloadResult
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

CARD = DatasetCard(
    dataset_id="sustain-cluster",
    display_name="SustainCluster / SustainDC (reference benchmark)",
    purpose="Reference benchmark for schema alignment and future simulator integration; not a primary training source.",
    source_url="https://github.com/HewlettPackard/dc-rl",
    raw_subdir="sustain_cluster",
    teaches=["reference field naming for site/rack/server power and thermal signals used by future simulator work"],
    limitations=[
        "Not used as a primary training dataset in this prototype.",
        "Optional: only loaded if the user places exported data locally.",
    ],
    requires_credentials=False,
    is_huge=False,
    auto_download_supported=False,
    manual_instructions=(
        "Optional. Clone https://github.com/HewlettPackard/dc-rl separately if needed, "
        "export any CSV data of interest, and place it under data/raw/sustain_cluster/. "
        "This project does not reuse its simulator code."
    ),
    ingest_target="workloads/sustain_cluster.parquet",
    kind="workload",
)


def download(out_dir: Path) -> DownloadResult:
    logger.warning("[sustain-cluster] optional reference dataset; no automatic download implemented.")
    logger.warning(f"[sustain-cluster] manual: {CARD.manual_instructions}")
    return DownloadResult("sustain-cluster", False, "optional reference-only dataset; not auto-downloaded", CARD.manual_instructions)


def ingest(input_dir: Path) -> pd.DataFrame:
    input_dir = Path(input_dir)
    csvs = sorted(input_dir.glob("*.csv"))
    if not csvs:
        logger.warning(f"[sustain-cluster] no raw files found under {input_dir}; skipping (optional dataset).")
        return pd.DataFrame()
    logger.info(f"[sustain-cluster] found {len(csvs)} file(s); pass-through ingestion only (schema not standardized).")
    return pd.DataFrame()

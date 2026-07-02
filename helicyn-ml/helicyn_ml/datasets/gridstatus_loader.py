"""GridStatus loader.

Source: https://www.gridstatus.io/ / `gridstatus` python package
(https://github.com/gridstatus/gridstatus). Provides electricity price and
load for CAISO, ERCOT, PJM, NYISO, IESO, AESO. The `gridstatus` package is
an optional dependency: if it isn't installed, or network access to the ISO
is unavailable, this loader generates a deterministic synthetic sample so
the pipeline still runs end-to-end. Never required for tests.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from helicyn_ml.datasets.dataset_card import DatasetCard
from helicyn_ml.datasets.downloader import DownloadResult
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

SUPPORTED_ISOS = ["CAISO", "ERCOT", "PJM", "NYISO", "IESO", "AESO"]

CARD = DatasetCard(
    dataset_id="gridstatus",
    display_name="GridStatus (ISO price/load)",
    purpose="Electricity price and grid load signal for cost-aware scheduling.",
    source_url="https://github.com/gridstatus/gridstatus",
    raw_subdir="gridstatus",
    teaches=["electricity price variation", "grid load patterns usable as a proxy for cost-aware scheduling"],
    limitations=[
        "Requires the optional `gridstatus` package and network access to ISO data portals for real pulls.",
        "Without it, falls back to a generated synthetic price/load sample (clearly labeled).",
    ],
    requires_credentials=False,
    is_huge=False,
    auto_download_supported=True,
    manual_instructions=(
        "pip install gridstatus, then call fetch_iso('CAISO', out_csv) in this module, "
        "or place a CSV with [timestamp, region, price_usd_per_mwh, grid_load_mw] under data/raw/gridstatus/."
    ),
    ingest_target="grid/gridstatus.parquet",
    kind="grid",
)


def fetch_iso(iso: str, out_csv: Path) -> DownloadResult:
    if iso.upper() not in SUPPORTED_ISOS:
        return DownloadResult("gridstatus", False, f"unsupported ISO '{iso}'", CARD.manual_instructions)
    try:
        import gridstatus  # type: ignore
    except ImportError:
        return DownloadResult("gridstatus", False, "gridstatus package not installed (pip install gridstatus)", CARD.manual_instructions)
    try:
        iso_cls = getattr(gridstatus, iso.upper())
        client = iso_cls()
        df = client.get_fuel_mix("today")
        out_csv = Path(out_csv)
        out_csv.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(out_csv, index=False)
        return DownloadResult("gridstatus", True, f"gridstatus {iso}", out_path=str(out_csv))
    except Exception as exc:  # noqa: BLE001
        return DownloadResult("gridstatus", False, f"gridstatus fetch failed: {exc}", CARD.manual_instructions)


def generate_sample(out_csv: Path, hours: int = 24 * 14, region: str = "CAISO", seed: int = 7) -> DownloadResult:
    rng = np.random.default_rng(seed)
    ts = pd.date_range("2024-01-01", periods=hours, freq="h", tz="UTC")
    hour = ts.hour.values
    price = 30 + 40 * np.clip(np.sin((hour - 6) / 24 * 2 * np.pi), 0, None) + rng.normal(0, 5, size=hours)
    load = 20000 + 6000 * np.clip(np.sin((hour - 8) / 24 * 2 * np.pi), -0.3, None) + rng.normal(0, 400, size=hours)

    df = pd.DataFrame(
        {
            "timestamp": ts,
            "region": region,
            "price_usd_per_mwh": np.clip(price, 5, None),
            "grid_load_mw": np.clip(load, 0, None),
            "source_dataset": "synthetic_sample",
        }
    )
    out_csv = Path(out_csv)
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_csv, index=False)
    return DownloadResult("gridstatus", True, "generated synthetic sample (gridstatus unavailable)", out_path=str(out_csv))


def download(out_dir: Path) -> DownloadResult:
    out_dir = Path(out_dir)
    result = fetch_iso("CAISO", out_dir / "caiso_fuel_mix.csv")
    if result.success:
        return result
    logger.warning(f"[gridstatus] {result.reason}; generating synthetic sample instead.")
    return generate_sample(out_dir / "synthetic_price_sample.csv")


def ingest(input_dir: Path) -> pd.DataFrame:
    input_dir = Path(input_dir)
    csvs = sorted(input_dir.glob("*.csv"))
    if not csvs:
        logger.warning(f"[gridstatus] no raw CSVs found under {input_dir}; skipping.")
        return pd.DataFrame()

    frames = []
    for csv_path in csvs:
        try:
            raw = pd.read_csv(csv_path)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"[gridstatus] failed to read {csv_path}: {exc}")
            continue
        frames.append(_normalize(raw, csv_path.name))
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

    source_dataset_col = col("source_dataset")
    source_dataset = source_dataset_col.iloc[0] if source_dataset_col is not None and len(source_dataset_col) else "gridstatus"

    out = pd.DataFrame(
        {
            "source_dataset": source_dataset,
            "timestamp": pd.to_datetime(col("timestamp", "time"), utc=True, errors="coerce"),
            "region": col("region", "iso").astype(str) if col("region", "iso") is not None else "unknown",
            "electricity_price_usd_per_mwh": pd.to_numeric(col("price_usd_per_mwh", "lmp"), errors="coerce"),
            "grid_load_mw": pd.to_numeric(col("grid_load_mw", "load_mw"), errors="coerce"),
        }
    )
    return out

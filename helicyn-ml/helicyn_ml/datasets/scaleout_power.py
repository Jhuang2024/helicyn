"""Scaleout Power Consumption Tutorial Dataset loader.

Source: Scaleout Systems' power-prediction tutorial dataset (small CSV/NPZ
of server utilization -> power draw). No stable public direct-download URL
is guaranteed to persist, so this loader:
  * ingests local `power.npz` / `*.csv` files if the user places them under
    data/raw/scaleout_power/
  * otherwise skips gracefully with manual instructions (does NOT fabricate
    data pretending to be this dataset)

The power PREDICTOR model itself has a separate deterministic analytical
fallback (see helicyn_ml/models/power_predictor.py) for when no real power
dataset - this one or any other NormalizedPowerRecord source - is available.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from helicyn_ml.datasets.dataset_card import DatasetCard
from helicyn_ml.datasets.downloader import DownloadResult
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

CARD = DatasetCard(
    dataset_id="scaleout-power",
    display_name="Scaleout Power Consumption Tutorial Dataset",
    purpose="Small supervised power-prediction demo dataset (utilization -> power draw).",
    source_url="https://github.com/scaleoutsystems",
    raw_subdir="scaleout_power",
    teaches=["mapping from CPU/network utilization to measured power draw"],
    limitations=[
        "No guaranteed stable public direct-download URL; must be placed manually.",
        "Small tutorial-scale dataset, not representative of a full data center.",
    ],
    requires_credentials=False,
    is_huge=False,
    auto_download_supported=False,
    manual_instructions=(
        "Locate the Scaleout power-prediction tutorial dataset (power.npz or "
        "equivalent CSV of utilization + power_kw) and place it under "
        "data/raw/scaleout_power/. If unavailable, the power predictor will "
        "run in analytical-fallback mode instead of training on real data."
    ),
    ingest_target="power/scaleout_power.parquet",
    kind="power",
)


def download(out_dir: Path) -> DownloadResult:
    logger.warning("[scaleout-power] no stable automatic download source; skipping.")
    logger.warning(f"[scaleout-power] manual: {CARD.manual_instructions}")
    return DownloadResult("scaleout-power", False, "no stable public direct-download URL", CARD.manual_instructions)


def ingest(input_dir: Path) -> pd.DataFrame:
    input_dir = Path(input_dir)
    csvs = sorted(input_dir.glob("*.csv"))
    npzs = sorted(input_dir.glob("*.npz"))
    if not csvs and not npzs:
        logger.warning(f"[scaleout-power] no raw files found under {input_dir}; skipping (power predictor will use analytical fallback).")
        return pd.DataFrame()

    frames = []
    for csv_path in csvs:
        try:
            raw = pd.read_csv(csv_path)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"[scaleout-power] failed to read {csv_path}: {exc}")
            continue
        frames.append(_normalize(raw, csv_path.name))
    for npz_path in npzs:
        try:
            arr = np.load(npz_path)
            raw = pd.DataFrame({k: arr[k].ravel() for k in arr.files})
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"[scaleout-power] failed to read {npz_path}: {exc}")
            continue
        frames.append(_normalize(raw, npz_path.name))
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
    ts_col = col("timestamp", "time")
    if ts_col is not None:
        ts = pd.to_datetime(ts_col, utc=True, errors="coerce")
    else:
        ts = pd.date_range("2023-01-01", periods=n, freq="min", tz="UTC")

    power = pd.to_numeric(col("power_kw", "power", "power_watts"), errors="coerce")
    if col("power_watts") is not None and col("power_kw") is None:
        power = power / 1000.0

    out = pd.DataFrame(
        {
            "source_dataset": "scaleout-power",
            "timestamp": ts,
            "site_id": col("site_id").astype(str) if col("site_id") is not None else "scaleout-site",
            "server_id": col("server_id", "node_id").astype(str) if col("server_id", "node_id") is not None else None,
            "cpu_usage": pd.to_numeric(col("cpu_usage", "cpu"), errors="coerce"),
            "network_usage": pd.to_numeric(col("network_usage", "network"), errors="coerce"),
            "power_kw": power,
        }
    )
    return out.dropna(subset=["power_kw"])

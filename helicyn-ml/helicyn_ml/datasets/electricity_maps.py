"""Electricity Maps loader.

Source: https://www.electricitymaps.com/ (API requires a key: ELECTRICITY_MAPS_API_KEY)
Free public CSV history is limited; the supported paths are:
  1. Local CSV placed under data/raw/electricity_maps/ (e.g. manually exported
     from the Electricity Maps app or an existing subscription).
  2. Live API pull if ELECTRICITY_MAPS_API_KEY is set (optional; never
     required for tests or the default demo).
  3. A generated small sample with a realistic diurnal carbon-intensity
     shape, used ONLY when neither of the above is available so the
     end-to-end pipeline still runs. This sample is explicitly labeled
     synthetic and must never be treated as real measured carbon data.
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import pandas as pd
import requests

from helicyn_ml.datasets.dataset_card import DatasetCard
from helicyn_ml.datasets.downloader import DownloadResult
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

API_KEY_ENV = "ELECTRICITY_MAPS_API_KEY"

CARD = DatasetCard(
    dataset_id="electricity-maps-sample",
    display_name="Electricity Maps (carbon intensity)",
    purpose="Grid carbon intensity signal for carbon-aware scheduling.",
    source_url="https://www.electricitymaps.com/",
    raw_subdir="electricity_maps",
    teaches=["temporal/regional carbon intensity patterns for carbon-aware placement"],
    limitations=[
        "Free tier has no historical CSV bulk export; live API needs a paid key for most zones/history depth.",
        "Without ELECTRICITY_MAPS_API_KEY or a manually placed CSV, this loader falls back to a "
        "generated synthetic diurnal carbon-intensity sample (clearly labeled, not real measurements).",
    ],
    requires_credentials=True,
    credential_env_vars=[API_KEY_ENV],
    is_huge=False,
    auto_download_supported=True,
    manual_instructions=(
        f"Set {API_KEY_ENV} and call fetch_api(region, start, end), or export a CSV with columns "
        "[timestamp, region, carbon_intensity_gco2e_per_kwh] from your Electricity Maps account "
        "and place it under data/raw/electricity_maps/."
    ),
    ingest_target="grid/electricity_maps.parquet",
    kind="grid",
)


def fetch_api(region: str, out_csv: Path, hours: int = 24) -> DownloadResult:
    api_key = os.environ.get(API_KEY_ENV)
    if not api_key:
        return DownloadResult("electricity-maps-sample", False, f"{API_KEY_ENV} not set", CARD.manual_instructions)
    try:
        resp = requests.get(
            "https://api.electricitymap.org/v3/carbon-intensity/history",
            params={"zone": region},
            headers={"auth-token": api_key},
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json().get("history", [])
        if not data:
            return DownloadResult("electricity-maps-sample", False, "empty API response", CARD.manual_instructions)
        df = pd.DataFrame(data)
        out_csv = Path(out_csv)
        out_csv.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(out_csv, index=False)
        return DownloadResult("electricity-maps-sample", True, "electricity maps API", out_path=str(out_csv))
    except Exception as exc:  # noqa: BLE001
        return DownloadResult("electricity-maps-sample", False, f"API call failed: {exc}", CARD.manual_instructions)


def generate_sample(out_csv: Path, hours: int = 24 * 14, region: str = "US-CAL-CISO", seed: int = 42) -> DownloadResult:
    """Deterministic synthetic diurnal carbon-intensity sample. Marked with
    source_dataset='synthetic_sample' so it can never be confused with real
    Electricity Maps measurements.
    """
    rng = np.random.default_rng(seed)
    ts = pd.date_range("2024-01-01", periods=hours, freq="h", tz="UTC")
    hour = ts.hour.values
    # Rough diurnal shape: higher at night (more fossil), lower midday (more solar).
    base = 350 + 120 * np.cos((hour - 3) / 24 * 2 * np.pi)
    noise = rng.normal(0, 15, size=hours)
    carbon = np.clip(base + noise, 50, 700)
    renewable = np.clip(40 - 25 * np.cos((hour - 3) / 24 * 2 * np.pi) + rng.normal(0, 5, size=hours), 0, 100)

    df = pd.DataFrame(
        {
            "timestamp": ts,
            "region": region,
            "carbon_intensity_gco2e_per_kwh": carbon,
            "renewable_percentage": renewable,
            "source_dataset": "synthetic_sample",
        }
    )
    out_csv = Path(out_csv)
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_csv, index=False)
    return DownloadResult("electricity-maps-sample", True, "generated synthetic sample (no API key / no local CSV)", out_path=str(out_csv))


def download(out_dir: Path) -> DownloadResult:
    out_dir = Path(out_dir)
    result = fetch_api("US-CAL-CISO", out_dir / "carbon_history.csv")
    if result.success:
        return result
    logger.warning(f"[electricity-maps] {result.reason}; generating synthetic sample instead.")
    return generate_sample(out_dir / "synthetic_carbon_sample.csv")


def ingest(input_dir: Path) -> pd.DataFrame:
    input_dir = Path(input_dir)
    csvs = sorted(input_dir.glob("*.csv"))
    if not csvs:
        logger.warning(f"[electricity-maps] no raw CSVs found under {input_dir}; skipping.")
        return pd.DataFrame()

    frames = []
    for csv_path in csvs:
        try:
            raw = pd.read_csv(csv_path)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"[electricity-maps] failed to read {csv_path}: {exc}")
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
    source_dataset = source_dataset_col.iloc[0] if source_dataset_col is not None and len(source_dataset_col) else "electricity-maps-sample"

    out = pd.DataFrame(
        {
            "source_dataset": source_dataset,
            "timestamp": pd.to_datetime(col("timestamp", "datetime"), utc=True, errors="coerce"),
            "region": col("region", "zone").astype(str) if col("region", "zone") is not None else "unknown",
            "carbon_intensity_gco2e_per_kwh": pd.to_numeric(col("carbon_intensity_gco2e_per_kwh", "carbonintensity"), errors="coerce"),
            "renewable_percentage": pd.to_numeric(col("renewable_percentage", "renewablepercentage"), errors="coerce"),
            "carbon_free_percentage": pd.to_numeric(col("carbon_free_percentage", "fossilfreepercentage"), errors="coerce"),
        }
    )
    return out

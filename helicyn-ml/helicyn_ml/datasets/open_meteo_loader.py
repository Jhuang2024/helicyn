"""Open-Meteo loader.

Source: https://open-meteo.com/ - free weather API, no API key required.
Used as an ambient-temperature / cooling-load proxy signal.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import requests

from helicyn_ml.datasets.dataset_card import DatasetCard
from helicyn_ml.datasets.downloader import DownloadResult
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

CARD = DatasetCard(
    dataset_id="open-meteo-sample",
    display_name="Open-Meteo (ambient weather)",
    purpose="Ambient temperature / humidity signal used as a cooling-load proxy.",
    source_url="https://open-meteo.com/",
    raw_subdir="open_meteo",
    teaches=["ambient temperature patterns relevant to free-cooling / thermal-aware placement"],
    limitations=[
        "No key required, but the historical-forecast API has rate limits and may be unreachable from sandboxed environments.",
        "Falls back to a generated synthetic seasonal temperature sample if the API call fails.",
    ],
    requires_credentials=False,
    is_huge=False,
    auto_download_supported=True,
    manual_instructions=(
        "No credentials needed. If the API call fails (offline sandbox), call "
        "fetch_forecast(lat, lon, out_csv) later, or place a CSV with "
        "[timestamp, region, ambient_temp_c, relative_humidity] under data/raw/open_meteo/."
    ),
    ingest_target="weather/open_meteo.parquet",
    kind="weather",
)

_DEFAULT_COORDS = {"us-west": (37.77, -122.42), "us-east": (39.95, -75.16), "eu-west": (52.52, 13.41)}


def fetch_forecast(lat: float, lon: float, out_csv: Path, region: str = "us-west") -> DownloadResult:
    try:
        resp = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "hourly": "temperature_2m,relative_humidity_2m",
                "past_days": 7,
                "forecast_days": 1,
            },
            timeout=20,
        )
        resp.raise_for_status()
        payload = resp.json()
        hourly = payload.get("hourly", {})
        if not hourly.get("time"):
            return DownloadResult("open-meteo-sample", False, "empty API response", CARD.manual_instructions)
        df = pd.DataFrame(
            {
                "timestamp": hourly["time"],
                "region": region,
                "ambient_temp_c": hourly.get("temperature_2m"),
                "relative_humidity": hourly.get("relative_humidity_2m"),
                "source_dataset": "open-meteo-sample",
            }
        )
        out_csv = Path(out_csv)
        out_csv.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(out_csv, index=False)
        return DownloadResult("open-meteo-sample", True, "open-meteo API", out_path=str(out_csv))
    except Exception as exc:  # noqa: BLE001
        return DownloadResult("open-meteo-sample", False, f"API call failed: {exc}", CARD.manual_instructions)


def generate_sample(out_csv: Path, hours: int = 24 * 14, region: str = "us-west", seed: int = 3) -> DownloadResult:
    rng = np.random.default_rng(seed)
    ts = pd.date_range("2024-01-01", periods=hours, freq="h", tz="UTC")
    hour = ts.hour.values
    temp = 12 + 8 * np.sin((hour - 9) / 24 * 2 * np.pi) + rng.normal(0, 1.5, size=hours)
    humidity = np.clip(60 - 15 * np.sin((hour - 9) / 24 * 2 * np.pi) + rng.normal(0, 5, size=hours), 10, 100)

    df = pd.DataFrame(
        {
            "timestamp": ts,
            "region": region,
            "ambient_temp_c": temp,
            "relative_humidity": humidity,
            "source_dataset": "synthetic_sample",
        }
    )
    out_csv = Path(out_csv)
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_csv, index=False)
    return DownloadResult("open-meteo-sample", True, "generated synthetic sample (API unreachable)", out_path=str(out_csv))


def download(out_dir: Path) -> DownloadResult:
    out_dir = Path(out_dir)
    lat, lon = _DEFAULT_COORDS["us-west"]
    result = fetch_forecast(lat, lon, out_dir / "open_meteo_us_west.csv")
    if result.success:
        return result
    logger.warning(f"[open-meteo] {result.reason}; generating synthetic sample instead.")
    return generate_sample(out_dir / "synthetic_weather_sample.csv")


def ingest(input_dir: Path) -> pd.DataFrame:
    input_dir = Path(input_dir)
    csvs = sorted(input_dir.glob("*.csv"))
    if not csvs:
        logger.warning(f"[open-meteo] no raw CSVs found under {input_dir}; skipping.")
        return pd.DataFrame()

    frames = []
    for csv_path in csvs:
        try:
            raw = pd.read_csv(csv_path)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"[open-meteo] failed to read {csv_path}: {exc}")
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
    source_dataset = source_dataset_col.iloc[0] if source_dataset_col is not None and len(source_dataset_col) else "open-meteo-sample"

    temp_c = pd.to_numeric(col("ambient_temp_c", "temperature_2m"), errors="coerce")
    humidity = pd.to_numeric(col("relative_humidity", "relative_humidity_2m"), errors="coerce")

    # Simple wet-bulb approximation (Stull 2011).
    wet_bulb = None
    if temp_c is not None and humidity is not None:
        t, rh = temp_c, humidity.clip(lower=1, upper=100)
        wet_bulb = (
            t * np.arctan(0.151977 * (rh + 8.313659) ** 0.5)
            + np.arctan(t + rh)
            - np.arctan(rh - 1.676331)
            + 0.00391838 * rh ** 1.5 * np.arctan(0.023101 * rh)
            - 4.686035
        )

    out = pd.DataFrame(
        {
            "source_dataset": source_dataset,
            "timestamp": pd.to_datetime(col("timestamp", "time"), utc=True, errors="coerce"),
            "region": col("region").astype(str) if col("region") is not None else "unknown",
            "ambient_temp_c": temp_c,
            "relative_humidity": humidity,
            "wet_bulb_temp_c": wet_bulb,
        }
    )
    return out.dropna(subset=["ambient_temp_c"])

"""Minimal, optional plotting helpers for a single run's
timeseries_metrics.csv. Not wired into the CLI in Phase 1 -- no dashboard,
no Streamlit. Requires the `plot` extra (`pip install -e ".[plot]"`).
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd


def plot_facility_power(run_dir: str | Path, out_path: str | Path) -> None:
    import matplotlib.pyplot as plt

    df = pd.read_csv(Path(run_dir) / "timeseries_metrics.csv")
    fig, ax = plt.subplots(figsize=(10, 4))
    for site_id, site_df in df.groupby("site_id"):
        ax.plot(pd.to_datetime(site_df["timestamp"]), site_df["facility_power_kw"], label=site_id)
    ax.set_xlabel("time")
    ax.set_ylabel("facility power (kW)")
    ax.set_title("Facility power over time")
    ax.legend()
    fig.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)

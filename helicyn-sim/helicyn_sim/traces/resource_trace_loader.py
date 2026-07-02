"""Optional loader for helicyn-ml's normalized/preprocessed real resource
traces (e.g. `helicyn-ml/data/processed/resources/google_cpu_memory.parquet`,
produced by helicyn-ml's Google cluster-trace preprocessing).

IMPORTANT: this does not give the simulator real job scheduling data. The
trace is dense per-VM CPU/memory utilization time series; there is no job
arrival, deadline, or workload-type information in it. All this loader does
is extract a fleet-wide CPU/memory utilization *shape* (a sequence of
[0, 1] multipliers, one per simulation step) that traces/synthetic.py can
use to bias synthetic job demand up or down over the day, so a "trace
shaped" run has a more realistic diurnal utilization curve than a purely
random one. Job identities, arrival times, deadlines, and workload types
remain synthetic in both modes.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


class ResourceTraceError(RuntimeError):
    pass


def load_resource_trace_shape(path: str | Path, num_steps: int) -> tuple[np.ndarray, np.ndarray]:
    """Return (cpu_multiplier, memory_multiplier), each shape (num_steps,),
    values in [0, 1], derived from the mean utilization across all VMs in
    the trace at each relative time index, resampled/tiled to `num_steps`.
    """
    path = Path(path)
    if not path.exists():
        raise ResourceTraceError(
            f"Resource trace not found at {path}. Generate it in helicyn-ml first, e.g.:\n"
            "  cd helicyn-ml && python -m helicyn_ml ingest --dataset google-cluster-data "
            "--input data/raw/google --out data/processed/resources/google_cpu_memory.parquet"
        )

    df = pd.read_parquet(path)

    cpu_col = _first_present(df, ["cpu_usage_percent", "avg_cpu_usage_percent"])
    mem_col = _first_present(df, ["memory_usage_percent"])
    if cpu_col is None or mem_col is None:
        raise ResourceTraceError(
            f"Resource trace at {path} is missing expected columns "
            "(cpu_usage_percent/avg_cpu_usage_percent and memory_usage_percent). "
            f"Found columns: {list(df.columns)}"
        )

    time_col = _first_present(df, ["time_index"])
    if time_col is not None:
        grouped = df.groupby(time_col)[[cpu_col, mem_col]].mean().sort_index()
        cpu_shape = grouped[cpu_col].to_numpy(dtype=float)
        mem_shape = grouped[mem_col].to_numpy(dtype=float)
    else:
        # No relative time index available: fall back to the raw row order,
        # which is still a real (if unaligned) utilization sequence.
        cpu_shape = df[cpu_col].to_numpy(dtype=float)
        mem_shape = df[mem_col].to_numpy(dtype=float)

    cpu_shape = _normalize_to_unit_interval(cpu_shape)
    mem_shape = _normalize_to_unit_interval(mem_shape)

    cpu_multiplier = _resample_to_length(cpu_shape, num_steps)
    mem_multiplier = _resample_to_length(mem_shape, num_steps)
    return cpu_multiplier, mem_multiplier


def _first_present(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for c in candidates:
        if c in df.columns:
            return c
    return None


def _normalize_to_unit_interval(values: np.ndarray) -> np.ndarray:
    values = np.nan_to_num(values, nan=np.nanmean(values) if np.any(~np.isnan(values)) else 0.0)
    if values.max() > 1.5:
        # values look like a 0-100 percentage rather than a 0-1 fraction
        values = values / 100.0
    return np.clip(values, 0.0, 1.0)


def _resample_to_length(values: np.ndarray, num_steps: int) -> np.ndarray:
    if len(values) == 0:
        return np.full(num_steps, 0.5)
    if len(values) == num_steps:
        return values
    # Tile/truncate to length, then linearly interpolate onto num_steps points
    # so short traces still cover a full run.
    src_idx = np.linspace(0, 1, num=len(values))
    dst_idx = np.linspace(0, 1, num=num_steps)
    return np.interp(dst_idx, src_idx, values)

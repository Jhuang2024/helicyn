"""The `before-after` CLI command: run every built-in policy (and, if
reachable, external_helicyn) under the same config, then write a
comparison summary. See docs/phase2_external_helicyn.md.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Optional

from helicyn_sim.config import load_config
from helicyn_sim.policies import BEFORE_AFTER_BUILTIN_POLICIES, get_policy
from helicyn_sim.policies.external_helicyn import (
    DEFAULT_TIMEOUT_SECONDS,
    ExternalHelicynPolicy,
    ExternalHelicynUnavailableError,
)
from helicyn_sim.simulation.engine import run_and_write

BASELINE_POLICY_NAME = "baseline_first_fit"

SUMMARY_METRIC_COLUMNS = [
    "total_jobs",
    "completed_jobs",
    "rejected_jobs",
    "deadline_misses",
    "sla_violations",
    "total_it_energy_kwh",
    "total_facility_energy_kwh",
    "total_cooling_energy_kwh",
    "total_carbon_kgco2e",
    "total_cost_usd",
    "average_pue",
    "peak_facility_power_kw",
    "average_cpu_utilization",
    "average_memory_utilization",
    "active_server_hours",
    "sleeping_server_hours",
    "max_rack_temp_c",
    "p95_rack_temp_c",
    "thermal_violations",
    "critical_thermal_violations",
]

DELTA_PCT_METRICS = [
    ("total_facility_energy_kwh", "delta_facility_energy_vs_baseline_pct"),
    ("total_carbon_kgco2e", "delta_carbon_vs_baseline_pct"),
    ("total_cost_usd", "delta_cost_vs_baseline_pct"),
]


def run_before_after(
    config_path: str | Path,
    out_dir: str | Path,
    resource_trace_path: Optional[str] = None,
    helicyn_url: Optional[str] = None,
    helicyn_timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict:
    config = load_config(config_path)
    if resource_trace_path is None:
        resource_trace_path = config.workload.resource_trace_path
    out_dir = Path(out_dir)

    results: dict[str, dict] = {}
    for policy_name in BEFORE_AFTER_BUILTIN_POLICIES:
        policy = get_policy(policy_name)
        summary = run_and_write(config, policy, out_dir / policy_name, resource_trace_path=resource_trace_path)
        results[policy_name] = summary

    external_status = "not_requested"
    if helicyn_url:
        policy = ExternalHelicynPolicy(url=helicyn_url, timeout_seconds=helicyn_timeout)
        try:
            policy.check_available()
            summary = run_and_write(
                config, policy, out_dir / "external_helicyn", resource_trace_path=resource_trace_path
            )
            results["external_helicyn"] = summary
            external_status = "included"
        except ExternalHelicynUnavailableError as exc:
            external_status = f"skipped: {exc}"

    comparison_dir = out_dir / "comparison"
    comparison_dir.mkdir(parents=True, exist_ok=True)
    rows = _build_comparison_rows(results)
    _write_summary_csv(comparison_dir / "summary.csv", rows)
    _write_summary_json(comparison_dir / "summary.json", rows)
    _write_report_md(comparison_dir / "report.md", rows, external_status, resource_trace_path)

    return {
        "results": results,
        "external_status": external_status,
        "comparison_dir": str(comparison_dir),
        "rows": rows,
    }


def _pct_delta(value: Optional[float], baseline_value: Optional[float]) -> Optional[float]:
    if value is None or baseline_value is None:
        return None
    if baseline_value == 0:
        return 0.0 if value == 0 else None
    return (value - baseline_value) / baseline_value * 100.0


def _build_comparison_rows(results: dict[str, dict]) -> list[dict]:
    baseline = results.get(BASELINE_POLICY_NAME)
    order = [BASELINE_POLICY_NAME] + [n for n in BEFORE_AFTER_BUILTIN_POLICIES if n != BASELINE_POLICY_NAME]
    if "external_helicyn" in results:
        order.append("external_helicyn")

    rows = []
    for name in order:
        summary = results.get(name)
        if summary is None:
            continue
        row: dict = {"policy_name": name}
        for col in SUMMARY_METRIC_COLUMNS:
            row[col] = summary.get(col)
        for metric_key, delta_key in DELTA_PCT_METRICS:
            row[delta_key] = _pct_delta(summary.get(metric_key), baseline.get(metric_key) if baseline else None)
        row["delta_deadline_misses_vs_baseline"] = (
            (summary.get("deadline_misses", 0) - baseline.get("deadline_misses", 0)) if baseline else None
        )
        rows.append(row)
    return rows


def _write_summary_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        path.write_text("")
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _write_summary_json(path: Path, rows: list[dict]) -> None:
    with path.open("w") as f:
        json.dump(rows, f, indent=2)


def _fmt_pct(value: Optional[float]) -> str:
    if value is None:
        return "n/a"
    return f"{value:+.1f}%"


def _write_report_md(
    path: Path,
    rows: list[dict],
    external_status: str,
    resource_trace_path: Optional[str],
) -> None:
    by_name = {row["policy_name"]: row for row in rows}
    lines: list[str] = []

    lines.append("# Before/after comparison report")
    lines.append("")
    lines.append(
        "**This is a simulated comparison, produced by helicyn-sim under the documented "
        "modeling assumptions in `docs/model_assumptions.md`. It is not a production "
        "measurement, and no number here should be read as a real energy/carbon/cost saving.**"
    )
    lines.append("")
    lines.append(f"Baseline (BEFORE): `{BASELINE_POLICY_NAME}` (`BaselineFirstFitPolicy`) -- fixed-order, "
                  "first-fit, no carbon/price/thermal awareness, no sleep, no DVFS tuning.")
    lines.append("")

    if resource_trace_path:
        lines.append(
            f"Workload demand magnitude was shaped by a resource-trace-shaped synthetic workload "
            f"(`{resource_trace_path}`); job arrivals, deadlines, and identities remain synthetic. "
            "See `docs/model_assumptions.md`."
        )
    else:
        lines.append("Workload was purely synthetic (no `--resource-trace` supplied).")
    lines.append("")

    if external_status == "included":
        lines.append("External Helicyn (`external_helicyn`, calling a running `helicyn-ml serve` "
                      "process) was reachable and included below as an AFTER policy.")
    elif external_status == "not_requested":
        lines.append("External Helicyn was not requested (no `--helicyn-url` given); only built-in "
                      "policies are compared below.")
    else:
        lines.append(f"External Helicyn unavailable; skipped. ({external_status})")
    lines.append("")

    lines.append("## Summary")
    lines.append("")
    lines.append(
        "| policy | completed | rejected | deadline misses | facility energy Δ% | carbon Δ% | cost Δ% |"
    )
    lines.append("|---|---:|---:|---:|---:|---:|---:|")
    for row in rows:
        lines.append(
            f"| {row['policy_name']} | {row['completed_jobs']} | {row['rejected_jobs']} | "
            f"{row['deadline_misses']} | {_fmt_pct(row['delta_facility_energy_vs_baseline_pct'])} | "
            f"{_fmt_pct(row['delta_carbon_vs_baseline_pct'])} | {_fmt_pct(row['delta_cost_vs_baseline_pct'])} |"
        )
    lines.append("")

    lines.append("## What improved what")
    lines.append("")
    for row in rows:
        name = row["policy_name"]
        if name == BASELINE_POLICY_NAME:
            continue
        energy_pct = row["delta_facility_energy_vs_baseline_pct"]
        carbon_pct = row["delta_carbon_vs_baseline_pct"]
        cost_pct = row["delta_cost_vs_baseline_pct"]
        deadline_delta = row["delta_deadline_misses_vs_baseline"]
        thermal_delta = None
        baseline_row = by_name.get(BASELINE_POLICY_NAME)
        if baseline_row is not None and row.get("max_rack_temp_c") is not None:
            thermal_delta = row["max_rack_temp_c"] - baseline_row["max_rack_temp_c"]

        bullet = f"- **{name}**: "
        parts = []
        if energy_pct is not None:
            parts.append(f"facility energy {_fmt_pct(energy_pct)}")
        if carbon_pct is not None:
            parts.append(f"carbon {_fmt_pct(carbon_pct)}")
        if cost_pct is not None:
            parts.append(f"cost {_fmt_pct(cost_pct)}")
        if deadline_delta:
            sign = "+" if deadline_delta > 0 else ""
            parts.append(f"deadline misses {sign}{deadline_delta} vs baseline")
        if thermal_delta is not None and abs(thermal_delta) >= 0.5:
            sign = "+" if thermal_delta > 0 else ""
            parts.append(f"max rack temp {sign}{thermal_delta:.1f}C vs baseline")
        bullet += "; ".join(parts) if parts else "no meaningful difference vs baseline on tracked metrics"
        lines.append(bullet)
    lines.append("")

    lines.append("## Tradeoffs")
    lines.append("")
    lines.append(
        "- `consolidation` sleeps idle servers, which typically produces the largest facility-energy "
        "and cost reduction in this demo fleet (deliberately oversized relative to its synthetic "
        "workload); it can concentrate load (and therefore heat) onto fewer, busier servers."
    )
    lines.append(
        "- `thermal_aware` spreads load across cooler racks first, which can mean using *more* active "
        "servers than a consolidation-style policy -- lower peak rack temperature at the cost of higher "
        "active-server-hours."
    )
    lines.append(
        "- `carbon_aware`/`price_aware` only delay flexible jobs, and force placement once delaying "
        "further would risk a deadline -- any deadline-miss delta they show reflects the config's "
        "modeled slack, not a flaw in the technique itself."
    )
    lines.append(
        "- `dvfs_aware` trades power for headroom on a per-server basis and, in this simulator's power "
        "model, does not change job runtime (see `docs/model_assumptions.md`) -- so a real deployment "
        "where DVFS *does* affect throughput would see this tradeoff differently."
    )
    if external_status == "included":
        lines.append(
            "- `external_helicyn` reflects whatever `helicyn-ml`'s `policy_ranker` currently produces -- "
            "which is teacher-imitation-trained, not outcome-trained (see `docs/ml_integration_plan.md`). "
            "If it performs worse than the baseline above, that is reported as-is, not adjusted."
        )
    lines.append("")

    lines.append("## Limitations")
    lines.append("")
    lines.append(
        "See `docs/limitations.md` for the full list. In short: this is a reduced-order simulation "
        "under documented, hand-specified assumptions (power/PUE/thermal equations, synthetic grid and "
        "weather curves, synthetic job arrivals); it is not validated against a real data center, uses "
        "no real facility telemetry, and makes no GPU-trained claim (helicyn-ml has no real GPU labels)."
    )
    lines.append("")

    path.write_text("\n".join(lines))

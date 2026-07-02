"""`research-run`: the main Phase 3 experiment driver. Runs every research
policy across a scenario x seed matrix under one research config, writes
each run's standard four output files under `runs/<scenario>/<seed>/<policy>/`,
and aggregates everything under `aggregate/`.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import pandas as pd

from helicyn_sim.config import ResearchConfig, load_research_config, resolve_scenario_config
from helicyn_sim.policies import RESEARCH_BUILTIN_POLICIES, get_policy
from helicyn_sim.policies.external_helicyn import (
    DEFAULT_TIMEOUT_SECONDS,
    ExternalHelicynPolicy,
    ExternalHelicynUnavailableError,
)
from helicyn_sim.simulation.engine import run_and_write

QUICK_SCENARIOS = ["normal_load", "carbon_shift_opportunity", "thermal_stress"]
QUICK_SEED_COUNT = 2

DELTA_METRICS = [
    ("total_facility_energy_kwh", "delta_facility_energy_vs_baseline_pct", "pct"),
    ("total_carbon_kgco2e", "delta_carbon_vs_baseline_pct", "pct"),
    ("total_cost_usd", "delta_cost_vs_baseline_pct", "pct"),
    ("deadline_misses", "delta_deadline_misses_vs_baseline", "abs"),
    ("thermal_violations", "delta_thermal_violations_vs_baseline", "abs"),
]

BASELINE_POLICY_NAME = "baseline_first_fit"

NUMERIC_SUMMARY_COLUMNS = [
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


def _select_scenarios(research_config: ResearchConfig, quick: bool):
    if not quick:
        return research_config.scenarios
    by_name = {s.name: s for s in research_config.scenarios}
    selected = [by_name[name] for name in QUICK_SCENARIOS if name in by_name]
    return selected or research_config.scenarios[:1]


def _select_seeds(research_config: ResearchConfig, quick: bool) -> list[int]:
    if quick:
        return research_config.seeds[:QUICK_SEED_COUNT] or [42]
    return research_config.seeds


def run_research_experiment(
    config_path: str | Path,
    out_dir: str | Path,
    quick: bool = False,
    resource_trace_path: Optional[str] = None,
    helicyn_url: Optional[str] = None,
    helicyn_timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict:
    research_config = load_research_config(config_path)
    out_dir = Path(out_dir)
    runs_dir = out_dir / "runs"
    aggregate_dir = out_dir / "aggregate"

    scenarios = _select_scenarios(research_config, quick)
    seeds = _select_seeds(research_config, quick)

    policy_names = list(RESEARCH_BUILTIN_POLICIES)
    external_status = "not_requested"
    if helicyn_url:
        probe = ExternalHelicynPolicy(url=helicyn_url, timeout_seconds=helicyn_timeout)
        try:
            probe.check_available()
            policy_names = policy_names + ["external_helicyn"]
            external_status = "included"
        except ExternalHelicynUnavailableError as exc:
            external_status = f"skipped: {exc}"

    rows: list[dict] = []
    for scenario in scenarios:
        for seed in seeds:
            config = resolve_scenario_config(research_config, scenario)
            config.simulation.seed = seed
            for policy_name in policy_names:
                if policy_name == "external_helicyn":
                    policy = ExternalHelicynPolicy(url=helicyn_url, timeout_seconds=helicyn_timeout)
                else:
                    policy = get_policy(policy_name)

                run_out = runs_dir / scenario.name / str(seed) / policy_name
                summary = run_and_write(config, policy, run_out, resource_trace_path=resource_trace_path)
                summary = dict(summary)
                summary["scenario"] = scenario.name
                summary["seed"] = seed
                rows.append(summary)

    all_runs_df = pd.DataFrame(rows)
    aggregate_dir.mkdir(parents=True, exist_ok=True)
    _write_aggregates(all_runs_df, aggregate_dir)

    return {
        "runs_dir": str(runs_dir),
        "aggregate_dir": str(aggregate_dir),
        "scenarios": [s.name for s in scenarios],
        "seeds": seeds,
        "policies": policy_names,
        "external_status": external_status,
        "total_runs": len(rows),
        "all_runs_df": all_runs_df,
    }


def _write_aggregates(all_runs_df: pd.DataFrame, aggregate_dir: Path) -> None:
    ordered_cols = ["scenario", "seed", "policy_name"] + [
        c for c in all_runs_df.columns if c not in ("scenario", "seed", "policy_name")
    ]
    all_runs_df = all_runs_df[ordered_cols]

    all_runs_df.to_csv(aggregate_dir / "all_runs_summary.csv", index=False)
    all_runs_df.to_json(aggregate_dir / "all_runs_summary.json", orient="records", indent=2)

    numeric_cols = [c for c in NUMERIC_SUMMARY_COLUMNS if c in all_runs_df.columns]

    policy_means = all_runs_df.groupby("policy_name")[numeric_cols].mean().reset_index()
    policy_means.to_csv(aggregate_dir / "policy_means.csv", index=False)

    policy_std = all_runs_df.groupby("policy_name")[numeric_cols].std().reset_index()
    policy_std.to_csv(aggregate_dir / "policy_std.csv", index=False)

    scenario_policy_summary = (
        all_runs_df.groupby(["scenario", "policy_name"])[numeric_cols].mean().reset_index()
    )
    scenario_policy_summary.to_csv(aggregate_dir / "scenario_policy_summary.csv", index=False)

    delta_rows = []
    for (scenario, seed), group in all_runs_df.groupby(["scenario", "seed"]):
        baseline_rows = group[group["policy_name"] == BASELINE_POLICY_NAME]
        if baseline_rows.empty:
            continue
        baseline = baseline_rows.iloc[0]
        for _, row in group.iterrows():
            delta_row = {"scenario": scenario, "seed": seed, "policy_name": row["policy_name"]}
            for metric_key, delta_key, kind in DELTA_METRICS:
                baseline_value = baseline.get(metric_key)
                value = row.get(metric_key)
                if kind == "pct":
                    if baseline_value in (None, 0) or pd.isna(baseline_value):
                        delta_row[delta_key] = 0.0 if value == baseline_value else None
                    else:
                        delta_row[delta_key] = (value - baseline_value) / baseline_value * 100.0
                else:
                    delta_row[delta_key] = (
                        value - baseline_value if not pd.isna(value) and not pd.isna(baseline_value) else None
                    )
            delta_rows.append(delta_row)

    baseline_relative_deltas = pd.DataFrame(delta_rows)
    baseline_relative_deltas.to_csv(aggregate_dir / "baseline_relative_deltas.csv", index=False)

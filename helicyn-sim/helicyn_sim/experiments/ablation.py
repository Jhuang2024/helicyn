"""`ablation`: run every policy, in a fixed stage order, under one
calibrated reference scenario, and show exactly what each additional
coordination behavior costs or buys relative to both the baseline and the
previous stage. `delta_vs_baseline_pct` / `delta_vs_previous_pct` track
total_facility_energy_kwh (the headline scalar the waterfall figures plot);
carbon/cost deltas are included alongside for the same rows so a stage that
trades one metric for another is visible, not hidden behind a single
number. See docs/results_interpretation.md.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import pandas as pd

from helicyn_sim.config import load_research_config, resolve_scenario_config
from helicyn_sim.policies import get_policy
from helicyn_sim.policies.external_helicyn import (
    DEFAULT_TIMEOUT_SECONDS,
    ExternalHelicynPolicy,
    ExternalHelicynUnavailableError,
)
from helicyn_sim.simulation.engine import run_and_write

ABLATION_STAGE_ORDER = [
    "baseline_first_fit",
    "consolidation",
    "thermal_aware",
    "carbon_aware",
    "price_aware",
    "dvfs_aware",
    "integrated_coordination",
]

BASELINE_POLICY_NAME = "baseline_first_fit"


def run_ablation(
    config_path: str | Path,
    out_dir: str | Path,
    quick: bool = False,
    resource_trace_path: Optional[str] = None,
    helicyn_url: Optional[str] = None,
    helicyn_timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict:
    research_config = load_research_config(config_path)
    scenario = research_config.scenarios[0]
    seeds = research_config.seeds[:1] if quick else research_config.seeds

    policy_names = list(ABLATION_STAGE_ORDER)
    external_status = "not_requested"
    if helicyn_url:
        probe = ExternalHelicynPolicy(url=helicyn_url, timeout_seconds=helicyn_timeout)
        try:
            probe.check_available()
            policy_names = policy_names + ["external_helicyn"]
            external_status = "included"
        except ExternalHelicynUnavailableError as exc:
            external_status = f"skipped: {exc}"

    out_dir = Path(out_dir)
    runs_dir = out_dir / "runs"

    per_policy_runs: dict[str, list[dict]] = {name: [] for name in policy_names}
    for seed in seeds:
        config = resolve_scenario_config(research_config, scenario)
        config.simulation.seed = seed
        for policy_name in policy_names:
            policy = (
                ExternalHelicynPolicy(url=helicyn_url, timeout_seconds=helicyn_timeout)
                if policy_name == "external_helicyn"
                else get_policy(policy_name)
            )
            run_out = runs_dir / str(seed) / policy_name
            summary = run_and_write(config, policy, run_out, resource_trace_path=resource_trace_path)
            per_policy_runs[policy_name].append(summary)

    rows = []
    baseline_energy = None
    baseline_carbon = None
    baseline_cost = None
    previous_energy = None
    for stage_idx, policy_name in enumerate(policy_names, start=1):
        runs = per_policy_runs[policy_name]
        mean = lambda key: sum(r[key] for r in runs) / len(runs)  # noqa: E731

        energy = mean("total_facility_energy_kwh")
        carbon = mean("total_carbon_kgco2e")
        cost = mean("total_cost_usd")
        deadline_misses = mean("deadline_misses")
        thermal_violations = mean("thermal_violations")
        max_rack_temp_c = mean("max_rack_temp_c")

        if policy_name == BASELINE_POLICY_NAME:
            baseline_energy, baseline_carbon, baseline_cost = energy, carbon, cost

        delta_vs_baseline_pct = (
            (energy - baseline_energy) / baseline_energy * 100.0 if baseline_energy else 0.0
        )
        delta_vs_previous_pct = (
            (energy - previous_energy) / previous_energy * 100.0 if previous_energy else 0.0
        )
        carbon_delta_vs_baseline_pct = (
            (carbon - baseline_carbon) / baseline_carbon * 100.0 if baseline_carbon else 0.0
        )
        cost_delta_vs_baseline_pct = (cost - baseline_cost) / baseline_cost * 100.0 if baseline_cost else 0.0

        baseline_deadline_misses = per_policy_runs[BASELINE_POLICY_NAME]
        baseline_deadline_mean = sum(r["deadline_misses"] for r in baseline_deadline_misses) / len(
            baseline_deadline_misses
        )
        baseline_thermal_mean = sum(r["thermal_violations"] for r in baseline_deadline_misses) / len(
            baseline_deadline_misses
        )

        tradeoff_notes = _tradeoff_notes(
            policy_name,
            energy_delta_pct=delta_vs_baseline_pct,
            carbon_delta_pct=carbon_delta_vs_baseline_pct,
            deadline_misses=deadline_misses,
            baseline_deadline_misses=baseline_deadline_mean,
            thermal_violations=thermal_violations,
            baseline_thermal_violations=baseline_thermal_mean,
        )

        rows.append(
            {
                "stage": f"{stage_idx}_{policy_name}",
                "policy_name": policy_name,
                "total_facility_energy_kwh": energy,
                "total_carbon_kgco2e": carbon,
                "total_cost_usd": cost,
                "deadline_misses": deadline_misses,
                "thermal_violations": thermal_violations,
                "max_rack_temp_c": max_rack_temp_c,
                "delta_vs_baseline_pct": delta_vs_baseline_pct,
                "delta_vs_previous_pct": delta_vs_previous_pct,
                "carbon_delta_vs_baseline_pct": carbon_delta_vs_baseline_pct,
                "cost_delta_vs_baseline_pct": cost_delta_vs_baseline_pct,
                "tradeoff_notes": tradeoff_notes,
            }
        )
        previous_energy = energy

    df = pd.DataFrame(rows)
    out_dir.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_dir / "ablation_summary.csv", index=False)
    df.to_json(out_dir / "ablation_summary.json", orient="records", indent=2)
    _write_report(df, out_dir / "ablation_report.md", scenario.name, seeds, external_status)

    return {
        "out_dir": str(out_dir),
        "scenario": scenario.name,
        "seeds": seeds,
        "policies": policy_names,
        "external_status": external_status,
        "rows": rows,
    }


def _tradeoff_notes(
    policy_name: str,
    energy_delta_pct: float,
    carbon_delta_pct: float,
    deadline_misses: float,
    baseline_deadline_misses: float,
    thermal_violations: float,
    baseline_thermal_violations: float,
) -> str:
    if policy_name == BASELINE_POLICY_NAME:
        return "Reference stage (BEFORE); every other stage is compared against this."

    notes = []
    if energy_delta_pct < -5:
        note = f"facility energy {energy_delta_pct:+.1f}% vs baseline"
        if policy_name == "consolidation":
            note += " -- mostly from sleeping idle servers; see docs/results_interpretation.md on oversized fleets"
        notes.append(note)
    elif energy_delta_pct > 5:
        notes.append(f"facility energy {energy_delta_pct:+.1f}% vs baseline (a real cost, not a saving)")

    if deadline_misses > baseline_deadline_misses + 0.5:
        notes.append(
            f"deadline misses rose {deadline_misses - baseline_deadline_misses:+.1f} vs baseline "
            "-- any energy/carbon saving above comes with worse SLA outcomes here"
        )
    elif deadline_misses < baseline_deadline_misses - 0.5:
        notes.append(f"deadline misses fell {deadline_misses - baseline_deadline_misses:+.1f} vs baseline")

    if thermal_violations > baseline_thermal_violations + 0.5:
        notes.append(f"thermal violations rose {thermal_violations - baseline_thermal_violations:+.1f} vs baseline")
    elif thermal_violations < baseline_thermal_violations - 0.5:
        notes.append(f"thermal violations fell {thermal_violations - baseline_thermal_violations:+.1f} vs baseline")

    if policy_name == "external_helicyn" and abs(energy_delta_pct) < 2 and abs(carbon_delta_pct) < 2:
        notes.append(
            "no material difference from baseline in this run -- helicyn-ml's policy_ranker is "
            "teacher-imitation only, not outcome-trained (see docs/ml_integration_plan.md)"
        )

    return "; ".join(notes) if notes else "no material difference from baseline on tracked metrics"


def _write_report(df: pd.DataFrame, path: Path, scenario_name: str, seeds: list[int], external_status: str) -> None:
    lines = [
        "# Ablation report",
        "",
        "**Simulated, under this simulator's documented modeling assumptions "
        "(docs/model_assumptions.md). Not a production measurement.**",
        "",
        f"Scenario: `{scenario_name}` (see configs/ablation.yaml). Seeds averaged: {seeds}.",
        f"External Helicyn: {external_status}.",
        "",
        "Each stage is a full independent run of one policy under the same scenario -- this is "
        "policy-by-policy staging, not feature-level ML ablation. `delta_vs_baseline_pct` / "
        "`delta_vs_previous_pct` track total_facility_energy_kwh.",
        "",
        "| stage | facility energy (kWh) | Δ vs baseline % | Δ vs previous % | carbon Δ % | "
        "deadline misses | thermal violations |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for _, row in df.iterrows():
        lines.append(
            f"| {row['stage']} | {row['total_facility_energy_kwh']:.2f} | {row['delta_vs_baseline_pct']:+.1f}% | "
            f"{row['delta_vs_previous_pct']:+.1f}% | {row['carbon_delta_vs_baseline_pct']:+.1f}% | "
            f"{row['deadline_misses']:.1f} | {row['thermal_violations']:.1f} |"
        )
    lines.append("")
    lines.append("## Tradeoff notes")
    lines.append("")
    for _, row in df.iterrows():
        lines.append(f"- **{row['policy_name']}**: {row['tradeoff_notes']}")
    lines.append("")
    lines.append(
        "See docs/limitations.md and docs/results_interpretation.md before drawing any conclusion "
        "from this table."
    )
    path.write_text("\n".join(lines))

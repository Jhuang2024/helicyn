"""`dashboard-snapshot`: a static markdown summary of the same overview
information the dashboard's Overview page shows, useful when Streamlit
isn't running (CI, a quick check, sharing a summary without launching a
server).
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import pandas as pd

from helicyn_sim.dashboard import data_loader

BASELINE_POLICY_NAME = "baseline_first_fit"


def _best_policy(means: pd.DataFrame, metric: str) -> str:
    if metric not in means.columns or means[metric].dropna().empty:
        return "n/a"
    return str(means[metric].idxmin())


def _worst_policy(means: pd.DataFrame, metric: str) -> str:
    if metric not in means.columns or means[metric].dropna().empty:
        return "n/a"
    return str(means[metric].idxmax())


def generate_dashboard_snapshot(results_dir: str | Path, out_path: str | Path) -> Path:
    results_dir = Path(results_dir)
    out_path = Path(out_path)
    research_outputs_root = results_dir.parent

    ablation_dir = research_outputs_root / "ablation"
    sensitivity_dir = research_outputs_root / "sensitivity"
    figures_dir = research_outputs_root / "figures"
    tables_dir = research_outputs_root / "tables"
    claims_audit_path = research_outputs_root / "claims_audit.md"

    lines: list[str] = []
    lines.append("# Dashboard snapshot")
    lines.append("")
    lines.append(
        "**Simulated output, under this simulator's documented modeling assumptions "
        "(docs/model_assumptions.md). Not a production measurement.**"
    )
    lines.append("")
    lines.append(f"Results root: `{results_dir}`")
    lines.append("")

    all_runs = data_loader.load_all_runs_summary(results_dir)
    if all_runs is None or all_runs.empty:
        lines.append(
            "_No research-run aggregate found. Run `python -m helicyn_sim research-run "
            f"--config configs/research_matrix.yaml --out {results_dir} --quick` first._"
        )
    else:
        lines.append("## Overview KPIs")
        lines.append("")
        lines.append(f"- Scenarios: {all_runs['scenario'].nunique() if 'scenario' in all_runs.columns else 'n/a'}")
        lines.append(f"- Policies: {all_runs['policy_name'].nunique()}")
        lines.append(f"- Seeds: {all_runs['seed'].nunique() if 'seed' in all_runs.columns else 'n/a'}")
        lines.append(f"- Total runs: {len(all_runs)}")
        lines.append("")

        means = all_runs.groupby("policy_name").mean(numeric_only=True)
        lines.append("## Best / worst policies (mean across scenarios/seeds)")
        lines.append("")
        for metric, label in [
            ("total_facility_energy_kwh", "facility energy"),
            ("total_carbon_kgco2e", "carbon"),
            ("total_cost_usd", "cost"),
            ("deadline_misses", "deadline misses"),
            ("thermal_violations", "thermal violations"),
        ]:
            lines.append(f"- {label}: best=`{_best_policy(means, metric)}`, worst=`{_worst_policy(means, metric)}`")
        lines.append("")

    lines.append("## Main output files")
    lines.append("")
    lines.append(f"- Figures (`{figures_dir}`): " + (", ".join(p.name for p in data_loader.list_figures(figures_dir)) or "none found"))
    lines.append(f"- Tables (`{tables_dir}`): " + (", ".join(p.name for p in data_loader.list_tables(tables_dir)) or "none found"))
    lines.append(f"- Ablation summary: `{ablation_dir}/ablation_summary.csv`" + ("" if (ablation_dir / "ablation_summary.csv").exists() else " (not found)"))
    lines.append(f"- Sensitivity summary: `{sensitivity_dir}/sensitivity_summary.csv`" + ("" if (sensitivity_dir / "sensitivity_summary.csv").exists() else " (not found)"))
    lines.append(f"- Claims audit: `{claims_audit_path}`" + ("" if claims_audit_path.exists() else " (not found)"))
    lines.append("")

    lines.append("## Limitations")
    lines.append("")
    lines.append(
        "This is a reduced-order, CPU/memory-first simulation under documented, hand-specified "
        "assumptions. No real GPU-trained behavior, no real facility telemetry, no real PUE/cooling "
        "validation, no real SLA prediction. `integrated_coordination` is an explicit heuristic, not "
        "trained ML. `external_helicyn` calls a teacher-imitation-only policy_ranker. See "
        "docs/limitations.md for the full list."
    )
    lines.append("")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines))
    return out_path

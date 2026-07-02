"""`paper-tables`: copy-pasteable CSV + Markdown tables summarizing a
research-run + ablation + sensitivity output set for a paper draft.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import pandas as pd
import yaml

POLICY_COMPARISON_COLUMNS = [
    "policy_name",
    "total_facility_energy_kwh",
    "total_carbon_kgco2e",
    "total_cost_usd",
    "deadline_misses",
    "thermal_violations",
    "average_pue",
    "active_server_hours",
]

LIMITATIONS = [
    ("Not production validation", "No claim here has been checked against a real data center."),
    ("No real GPU-trained model", "helicyn-ml has no real GPU labels; GPU fields are inert scaffolding."),
    ("No real facility telemetry", "Power, PUE, and thermal numbers come from analytical models, not real sensors."),
    ("Thermal model is not CFD", "A lumped, single-value-per-rack, first-order heat-balance proxy only."),
    ("Power model is assumption-based", "CPU exponent, memory coefficient, fan thresholds are engineering choices."),
    ("Synthetic grid/weather", "Carbon intensity, price, and ambient temperature are deterministic synthetic curves."),
    ("Synthetic workload", "Job arrivals, demand, and deadlines are hand-specified, not fit to production traces."),
    ("external_helicyn is experimental", "A validated adapter around whatever helicyn-ml returns; not tuned or hardened."),
    ("policy_ranker is teacher-imitation", "Trained to imitate a heuristic score, not from real outcomes or rollouts."),
    (
        "integrated_coordination is a simulator-native heuristic",
        "An explicit, hand-weighted scoring function -- not trained ML, not a production Helicyn controller.",
    ),
    ("Results are scenario-relative only", "Every number is a comparison between simulated policies under one model."),
]


def generate_paper_tables(
    results_dir: str | Path,
    out_dir: str | Path,
    ablation_dir: Optional[str | Path] = None,
    sensitivity_dir: Optional[str | Path] = None,
) -> dict:
    results_dir = Path(results_dir)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    generated: list[str] = []

    setup_df = experimental_setup_table(results_dir)
    setup_df.to_csv(out_dir / "table_experimental_setup.csv", index=False)
    generated.append("table_experimental_setup.csv")

    assumptions_df = _model_assumptions_table()
    assumptions_df.to_csv(out_dir / "table_model_assumptions.csv", index=False)
    generated.append("table_model_assumptions.csv")

    policy_comparison_df = _policy_comparison_table(results_dir)
    if policy_comparison_df is not None:
        policy_comparison_df.to_csv(out_dir / "table_policy_comparison.csv", index=False)
        generated.append("table_policy_comparison.csv")

    ablation_df = None
    if ablation_dir is not None:
        ablation_path = Path(ablation_dir) / "ablation_summary.csv"
        if ablation_path.exists():
            ablation_df = pd.read_csv(ablation_path)
            ablation_df.to_csv(out_dir / "table_ablation_results.csv", index=False)
            generated.append("table_ablation_results.csv")

    sensitivity_df = None
    if sensitivity_dir is not None:
        sensitivity_path = Path(sensitivity_dir) / "sensitivity_summary.csv"
        if sensitivity_path.exists():
            sensitivity_df = pd.read_csv(sensitivity_path)
            sensitivity_df.to_csv(out_dir / "table_sensitivity_results.csv", index=False)
            generated.append("table_sensitivity_results.csv")

    limitations_df = pd.DataFrame(LIMITATIONS, columns=["limitation", "detail"])
    limitations_df.to_csv(out_dir / "table_limitations.csv", index=False)
    generated.append("table_limitations.csv")

    _write_markdown(
        out_dir / "paper_tables.md",
        setup_df,
        assumptions_df,
        policy_comparison_df,
        ablation_df,
        sensitivity_df,
        limitations_df,
    )
    generated.append("paper_tables.md")

    return {"out_dir": str(out_dir), "generated": generated}


def _find_a_config_resolved(results_dir: Path) -> Optional[dict]:
    runs_dir = results_dir / "runs"
    if not runs_dir.exists():
        return None
    for path in sorted(runs_dir.rglob("config_resolved.yaml")):
        with path.open() as f:
            return yaml.safe_load(f)
    return None


def experimental_setup_table(results_dir: Path) -> pd.DataFrame:
    rows = []
    all_runs_path = results_dir / "aggregate" / "all_runs_summary.csv"
    config = _find_a_config_resolved(results_dir)

    if config is not None:
        fleet = config.get("fleet", {})
        sites = fleet.get("sites", [])
        server_profile = fleet.get("server_profile", {})
        total_servers = sum(s.get("racks", 0) * s.get("servers_per_rack", 0) for s in sites)
        rows.append(("sites", len(sites)))
        rows.append(("total_servers", total_servers))
        rows.append(("server_cpu_capacity_units", server_profile.get("cpu_capacity_units")))
        rows.append(("server_memory_capacity_gb", server_profile.get("memory_capacity_gb")))
        rows.append(("timestep_minutes", config.get("simulation", {}).get("timestep_minutes")))
        rows.append(("duration_hours", config.get("simulation", {}).get("duration_hours")))

    if all_runs_path.exists():
        df = pd.read_csv(all_runs_path)
        rows.append(("scenarios", df["scenario"].nunique() if "scenario" in df.columns else None))
        rows.append(("scenario_names", ", ".join(sorted(df["scenario"].unique())) if "scenario" in df.columns else None))
        rows.append(("seeds", df["seed"].nunique() if "seed" in df.columns else None))
        rows.append(("seed_values", ", ".join(str(s) for s in sorted(df["seed"].unique())) if "seed" in df.columns else None))
        rows.append(("policies_compared", df["policy_name"].nunique() if "policy_name" in df.columns else None))
        rows.append(("policy_names", ", ".join(sorted(df["policy_name"].unique())) if "policy_name" in df.columns else None))
        rows.append(("total_runs", len(df)))

    rows.append(("resource_trace_dataset", "helicyn-ml Google cluster CPU/memory trace (optional, --resource-trace)"))
    rows.append(("workload_datasets_used_by_helicyn_ml", "BurstGPT (workload_forecaster), Google cluster CPU/memory (resource_predictor)"))

    return pd.DataFrame(rows, columns=["field", "value"])


def _model_assumptions_table() -> pd.DataFrame:
    rows = [
        ("Server power", "idle_power_w + max_cpu_dynamic_power_w * cpu_util^1.4 * dvfs_mult + memory_power_coeff * mem_util + fan_overhead_w * fan_factor"),
        ("Dynamic PUE", "base_pue + ambient_temp_coefficient * max(0, ambient_temp_c - cooling_reference_temp_c), clamped [1.05, 2.20]"),
        ("Rack thermal proxy", "Lumped first-order heat balance: heat gain from IT power, loss from capped cooling effort, weak pull toward ambient. Not CFD."),
        ("Carbon", "facility_energy_kwh * carbon_intensity_gco2e_per_kwh / 1000"),
        ("Cost", "facility_energy_kwh * electricity_price_usd_per_mwh / 1000"),
        ("DVFS", "power_multiplier scales CPU dynamic power only; does not change job progress rate in this simulator"),
        ("Job progress", "1 work-unit per simulated minute while running, independent of allocated CPU/memory or DVFS state"),
        ("Grid/weather", "Deterministic seeded synthetic curves, directionally representative, not real operator/station data"),
        ("integrated_coordination scoring", "Weighted sum: SLA risk, incremental power, normalized carbon/price, thermal risk, fragmentation, delay penalty, minus utilization and consolidation reward"),
    ]
    return pd.DataFrame(rows, columns=["component", "equation_summary"])


def _policy_comparison_table(results_dir: Path) -> Optional[pd.DataFrame]:
    path = results_dir / "aggregate" / "policy_means.csv"
    if not path.exists():
        return None
    df = pd.read_csv(path)
    cols = [c for c in POLICY_COMPARISON_COLUMNS if c in df.columns]
    return df[cols]


def df_to_markdown(df: pd.DataFrame, max_rows: int = 40) -> str:
    if df is None or df.empty:
        return "_(no data)_"
    display_df = df.head(max_rows)
    header = "| " + " | ".join(str(c) for c in display_df.columns) + " |"
    sep = "|" + "|".join(["---"] * len(display_df.columns)) + "|"
    lines = [header, sep]
    for _, row in display_df.iterrows():
        lines.append("| " + " | ".join(str(v) for v in row.to_list()) + " |")
    return "\n".join(lines)


def _write_markdown(
    path: Path,
    setup_df: pd.DataFrame,
    assumptions_df: pd.DataFrame,
    policy_comparison_df: Optional[pd.DataFrame],
    ablation_df: Optional[pd.DataFrame],
    sensitivity_df: Optional[pd.DataFrame],
    limitations_df: pd.DataFrame,
) -> None:
    lines = [
        "# Paper-ready tables",
        "",
        "Copy-pasteable tables generated from a helicyn-sim research-run + ablation + sensitivity "
        "output set. All numbers are simulated, under this simulator's documented modeling "
        "assumptions -- see docs/model_assumptions.md and docs/limitations.md before using any of "
        "these in a claim.",
        "",
        "## Experimental setup",
        "",
        df_to_markdown(setup_df),
        "",
        "## Model assumptions (equations, summarized)",
        "",
        df_to_markdown(assumptions_df),
        "",
        "## Policy comparison (mean across scenarios/seeds)",
        "",
        df_to_markdown(policy_comparison_df) if policy_comparison_df is not None else "_(no research-run aggregate found)_",
        "",
        "## Ablation results",
        "",
        df_to_markdown(ablation_df) if ablation_df is not None else "_(no ablation results found)_",
        "",
        "## Sensitivity results",
        "",
        df_to_markdown(sensitivity_df) if sensitivity_df is not None else "_(no sensitivity results found)_",
        "",
        "## Limitations",
        "",
        df_to_markdown(limitations_df),
        "",
    ]
    path.write_text("\n".join(lines))

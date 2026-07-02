"""`research-report`: the single markdown document a reader (or the next
phase) should start from. Pulls together the research-run, ablation,
sensitivity, and claims-audit outputs into one narrative with explicit
caveats throughout.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import pandas as pd

from helicyn_sim.experiments.paper_tables import df_to_markdown, experimental_setup_table


def generate_research_report(
    results_dir: str | Path,
    out_path: str | Path,
    ablation_dir: Optional[str | Path] = None,
    sensitivity_dir: Optional[str | Path] = None,
    claims_audit_path: Optional[str | Path] = None,
) -> Path:
    results_dir = Path(results_dir)
    out_path = Path(out_path)

    all_runs_path = results_dir / "aggregate" / "all_runs_summary.csv"
    scenario_policy_path = results_dir / "aggregate" / "scenario_policy_summary.csv"
    delta_path = results_dir / "aggregate" / "baseline_relative_deltas.csv"

    all_runs_df = pd.read_csv(all_runs_path) if all_runs_path.exists() else None
    scenario_policy_df = pd.read_csv(scenario_policy_path) if scenario_policy_path.exists() else None
    delta_df = pd.read_csv(delta_path) if delta_path.exists() else None

    setup_df = experimental_setup_table(results_dir)

    ablation_df = None
    if ablation_dir is not None:
        ablation_path = Path(ablation_dir) / "ablation_summary.csv"
        if ablation_path.exists():
            ablation_df = pd.read_csv(ablation_path)

    sensitivity_df = None
    if sensitivity_dir is not None:
        sensitivity_path = Path(sensitivity_dir) / "sensitivity_summary.csv"
        if sensitivity_path.exists():
            sensitivity_df = pd.read_csv(sensitivity_path)

    claims_text = ""
    if claims_audit_path is not None and Path(claims_audit_path).exists():
        claims_text = Path(claims_audit_path).read_text()

    lines: list[str] = []
    lines.append("# Helicyn Research Prototype Results")
    lines.append("")
    lines.append(
        "**Everything in this report is simulated output from `helicyn-sim`, under the documented "
        "modeling assumptions in `docs/model_assumptions.md`. Nothing here is a production "
        "measurement, a validated real-world result, or a claim about a real data center. See "
        "`docs/limitations.md` and the Limitations section below before citing anything from this "
        "report.**"
    )
    lines.append("")

    # 1. Overview
    lines.append("## 1. Overview")
    lines.append("")
    lines.append(
        "helicyn-sim is an independent, discrete-time (5-minute default timestep) data-center "
        "scheduling simulator. This report evaluates whether a simulator-native coordination "
        "heuristic (`integrated_coordination`) and helicyn-ml's real HTTP policy service "
        "(`external_helicyn`) change simulated energy/carbon/cost/thermal/SLA outcomes relative to "
        "a dumb fixed-order baseline (`baseline_first_fit`) and five single-objective heuristics, "
        "across a calibrated scenario matrix."
    )
    lines.append("")

    # 2. ML components used
    lines.append("## 2. ML components used")
    lines.append("")
    lines.append("From `helicyn-ml` (see `docs/ml_integration_plan.md` for full detail):")
    lines.append("")
    lines.append("- `workload_forecaster`: trains on real BurstGPT LLM request traces.")
    lines.append(
        "- `resource_predictor`: trains on real/preprocessed Google cluster CPU/memory traces "
        "(`research_usable=yes` for CPU/memory targets); this is the dataset `--resource-trace` shapes demand from."
    )
    lines.append("- `runtime_predictor`: skipped (no real job-runtime-labeled dataset auto-downloads).")
    lines.append("- `sla_risk_model`: unavailable/degenerate (no real SLA-violation labels).")
    lines.append("- `power_predictor`: synthetic-only (no real facility power telemetry).")
    lines.append(
        "- `policy_ranker`: teacher-imitation only -- trained to imitate a hand-written heuristic "
        "score, not from real outcomes or simulator rollouts. This is what `external_helicyn` calls."
    )
    lines.append("- No GPU labels exist in any dataset either project ingests.")
    lines.append("")

    # 3. Simulator setup
    lines.append("## 3. Simulator setup")
    lines.append("")
    lines.append(df_to_markdown(setup_df))
    lines.append("")

    # 4. Workload and fleet assumptions
    lines.append("## 4. Workload and fleet assumptions")
    lines.append("")
    lines.append(
        "CPU/memory-first (GPU fields are inert scaffolding). Job arrivals are a per-workload-type "
        "Poisson process with hand-specified, time-of-day-varying rates; demand magnitudes are "
        "uniform-random within a configured range unless `--resource-trace` is supplied, in which "
        "case magnitude (not arrival process or identity) is shaped by a real Google cluster "
        "CPU/memory trace. Carbon intensity, electricity price, and ambient temperature are "
        "deterministic synthetic curves, not real grid/weather data. See `docs/model_assumptions.md`."
    )
    lines.append("")

    # 5. Policies compared
    lines.append("## 5. Policies compared")
    lines.append("")
    policy_list = sorted(all_runs_df["policy_name"].unique()) if all_runs_df is not None else []
    for p in policy_list:
        lines.append(f"- `{p}`")
    lines.append("")
    lines.append(
        "`integrated_coordination` is a simulator-native, hand-weighted, explicit coordination-layer "
        "heuristic -- NOT trained ML, NOT the same thing as `external_helicyn`, and NOT a production "
        "Helicyn controller. `external_helicyn` calls a real running `helicyn-ml serve` process and "
        "validates every recommended action against the simulator's actual constraints before "
        "applying it (see `docs/phase2_external_helicyn.md`)."
    )
    lines.append("")

    # 6. Main results
    lines.append("## 6. Main results")
    lines.append("")
    if all_runs_df is not None:
        lines.append(
            f"Total runs: {len(all_runs_df)}. Scenarios: {sorted(all_runs_df['scenario'].unique())}. "
            f"Seeds: {sorted(all_runs_df['seed'].unique())}."
        )
        lines.append("")
    if scenario_policy_df is not None:
        cols = [
            c
            for c in [
                "scenario",
                "policy_name",
                "total_facility_energy_kwh",
                "total_carbon_kgco2e",
                "total_cost_usd",
                "deadline_misses",
                "thermal_violations",
            ]
            if c in scenario_policy_df.columns
        ]
        lines.append(df_to_markdown(scenario_policy_df[cols], max_rows=100))
    else:
        lines.append("_(no research-run aggregate found at the given --results path)_")
    lines.append("")
    lines.append(f"Full outputs: `{results_dir}/aggregate/` (all_runs_summary.csv, policy_means.csv, "
                  "policy_std.csv, baseline_relative_deltas.csv, scenario_policy_summary.csv).")
    lines.append("")

    # 7. Ablation results
    lines.append("## 7. Ablation results")
    lines.append("")
    if ablation_df is not None:
        cols = [c for c in ablation_df.columns if c != "tradeoff_notes"]
        lines.append(df_to_markdown(ablation_df[cols]))
        lines.append("")
        lines.append("Tradeoff notes:")
        lines.append("")
        for _, row in ablation_df.iterrows():
            lines.append(f"- **{row['policy_name']}**: {row['tradeoff_notes']}")
    else:
        lines.append("_(no ablation results provided -- pass --ablation)_")
    lines.append("")

    # 8. Sensitivity analysis
    lines.append("## 8. Sensitivity analysis")
    lines.append("")
    if sensitivity_df is not None:
        lines.append(df_to_markdown(sensitivity_df, max_rows=100))
    else:
        lines.append("_(no sensitivity results provided -- pass --sensitivity)_")
    lines.append("")

    # 9. Interpretation
    lines.append("## 9. Interpretation")
    lines.append("")
    lines.append(
        "See `docs/results_interpretation.md` for the full guide. Key points: energy savings alone "
        "are not the whole story -- check deadline misses and thermal violations in the same row "
        "before calling a delta a win. Consolidation-style savings can look artificially large on an "
        "oversized fleet (Phase 2's demo fleet showed this directly); the scenario matrix here was "
        "recalibrated (see `configs/research_matrix.yaml`'s header) specifically to reduce that "
        "artifact, though `consolidation`/`integrated_coordination` can still show large savings "
        "under `normal_load` because the calibrated fleet still has meaningful idle time by design "
        "(target ~35-55% utilization, not 100%)."
    )
    lines.append("")

    # 10. Limitations
    lines.append("## 10. Limitations")
    lines.append("")
    lines.append("See `docs/limitations.md` in full. Highlights relevant to this report specifically:")
    lines.append("")
    lines.append("- No real GPU-trained behavior, no real facility telemetry, no real PUE/cooling validation.")
    lines.append("- `external_helicyn` calls `policy_ranker`, which is teacher-imitation only.")
    lines.append("- `integrated_coordination` is an explicit heuristic, not trained ML.")
    lines.append("- The thermal model is a reduced-order proxy, not CFD.")
    lines.append("- All grid/weather/workload signals are synthetic, documented, seeded curves.")
    lines.append("")

    # 11. Paper-ready claims
    lines.append("## 11. Paper-ready claims")
    lines.append("")
    if claims_text:
        lines.append(claims_text)
    else:
        lines.append("_(no claims audit provided -- pass --claims)_")
    lines.append("")

    # 12. Next work
    lines.append("## 12. Next work")
    lines.append("")
    lines.append(
        "- A dashboard/reporting layer over these outputs (explicitly out of scope until this "
        "evidence package exists -- it now does)."
    )
    lines.append(
        "- Training `helicyn-ml`'s `policy_ranker` against simulator rollouts instead of only a "
        "static heuristic teacher, now that `helicyn-sim` can generate labeled outcome data."
    )
    lines.append("- Real GPU-labeled data, if a suitable public dataset becomes available.")
    lines.append("- Expanding the scenario matrix (more fleet sizes, more grid regions).")
    lines.append("")

    out_path.write_text("\n".join(lines))
    return out_path

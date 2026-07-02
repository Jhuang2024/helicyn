"""Overview page: high-level summary of the research prototype."""
from __future__ import annotations

import streamlit as st

from helicyn_sim.dashboard import components, data_loader


def render(ctx) -> None:
    all_runs = data_loader.load_all_runs_summary(ctx.results_root)

    st.subheader("Key numbers")
    if all_runs is None or all_runs.empty:
        components.render_missing(
            f"No research-run aggregate found at `{ctx.results_root}/aggregate/all_runs_summary.csv`. "
            "Run research-run to populate this page.",
            "python -m helicyn_sim research-run --config configs/research_matrix.yaml "
            "--out research_outputs/main_experiment --quick",
        )
    else:
        kpis = {
            "Scenarios": str(all_runs["scenario"].nunique()) if "scenario" in all_runs.columns else "n/a",
            "Policies": str(all_runs["policy_name"].nunique()),
            "Seeds": str(all_runs["seed"].nunique()) if "seed" in all_runs.columns else "n/a",
            "Total runs": str(len(all_runs)),
        }
        components.render_kpi_cards(kpis)

        means = all_runs.groupby("policy_name").mean(numeric_only=True)

        def best(metric: str) -> str:
            if metric not in means.columns or means[metric].dropna().empty:
                return "n/a"
            return str(means[metric].idxmin())

        best_kpis = {
            "Best policy (facility energy)": best("total_facility_energy_kwh"),
            "Best policy (carbon)": best("total_carbon_kgco2e"),
            "Best policy (cost)": best("total_cost_usd"),
            "Lowest deadline misses": best("deadline_misses"),
            "Lowest thermal violations": best("thermal_violations"),
        }
        components.render_kpi_cards(best_kpis)
        st.caption(
            "\"Best\" = lowest mean value across all scenarios/seeds in this results directory. "
            "A policy can be best on one metric and worse on another -- see Policy Comparison for tradeoffs."
        )

    st.divider()
    st.subheader("Helicyn ML v1")
    st.markdown(
        "- `workload_forecaster` trained on real BurstGPT LLM request traces.\n"
        "- `resource_predictor` trained on preprocessed Google Cluster CPU/memory traces "
        "(`research_usable=yes` for CPU/memory targets).\n"
        "- **GPU labels are unavailable** in any dataset either project ingests.\n"
        "- `runtime_predictor` skipped; `sla_risk_model` unavailable/degenerate; `power_predictor` synthetic-only.\n"
        "- `policy_ranker` is teacher-imitation only, not trained from real or simulated outcomes."
    )

    st.subheader("Simulator")
    st.markdown(
        "- Reduced-order, CPU/memory-first data-center scheduling simulator (discrete-time, 5-minute default step).\n"
        "- Synthetic multi-site fleet and workload; optional resource-trace-shaped demand from a real "
        "Google cluster CPU/memory trace (magnitude only, not job identity/arrival).\n"
        "- Power, PUE, thermal, carbon, and cost equations are documented in `docs/equations.md`."
    )

    st.subheader("Policies")
    st.markdown(
        "- `baseline_first_fit` (the BEFORE)\n"
        "- `consolidation`, `thermal_aware`, `carbon_aware`, `price_aware`, `dvfs_aware` "
        "(single-objective heuristics)\n"
        "- `integrated_coordination` (simulator-native, multi-objective coordination-layer heuristic -- "
        "not trained ML)\n"
        "- `external_helicyn` (calls a real running `helicyn-ml serve` process), when reachable at run time"
    )

    st.divider()
    st.error(
        "Use these results as concept-feasibility evidence, not real-world operational claims. "
        "See docs/limitations.md and docs/claims_audit.md."
    )

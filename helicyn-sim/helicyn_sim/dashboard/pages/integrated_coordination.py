"""Integrated Coordination page: inspect the simulator-native
integrated_coordination policy specifically."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from helicyn_sim.dashboard import components, data_loader
from helicyn_sim.policies.integrated_coordination import DEFAULT_WEIGHTS

POLICY_NAME = "integrated_coordination"
BASELINE_POLICY_NAME = "baseline_first_fit"

SCORE_FORMULA = """score =
    w_sla * sla_risk
  + w_power * incremental_power_kw
  + w_carbon * normalized_carbon_intensity
  + w_price * normalized_price
  + w_thermal * thermal_risk
  + w_fragmentation * fragmentation
  + w_delay * delay_penalty
  - w_utilization * useful_utilization
  - w_consolidation * consolidation_benefit"""


def _find_integrated_decisions(ctx) -> pd.DataFrame | None:
    runs_root = ctx.results_root / "runs"
    if not runs_root.exists():
        return None
    for path in sorted(runs_root.rglob(f"{POLICY_NAME}/policy_decisions.csv")):
        df = data_loader.read_csv_safe(path)
        if df is not None and not df.empty:
            return df
    return None


def render(ctx) -> None:
    st.markdown(
        "`integrated_coordination` is a **simulator-native, hand-weighted coordination-layer heuristic**. "
        "It coordinates consolidation, thermal awareness, carbon awareness, price awareness, DVFS "
        "selection, and deadline/SLA protection in one explicit scoring function -- picking, for each "
        "queued job, the candidate server that minimizes the score below (or delaying a flexible job if "
        "a meaningfully better carbon/price window is coming within its deadline slack)."
    )
    st.error(
        "This is **not trained ML** and **not** the same thing as `external_helicyn`. It is not "
        "\"production Helicyn,\" not a \"validated AI optimizer,\" and not a \"real-world controller\" -- "
        "see `helicyn_sim/policies/integrated_coordination.py`'s module docstring."
    )

    st.subheader("Score function")
    st.code(SCORE_FORMULA, language="text")

    st.subheader("Weights (defaults)")
    weight_df = pd.DataFrame(sorted(DEFAULT_WEIGHTS.items()), columns=["weight", "value"])
    st.dataframe(weight_df, use_container_width=True, hide_index=True)

    st.divider()
    st.subheader(f"{POLICY_NAME} vs {BASELINE_POLICY_NAME}")
    all_runs = data_loader.load_all_runs_summary(ctx.results_root)
    if all_runs is None or all_runs.empty or POLICY_NAME not in all_runs["policy_name"].unique():
        components.render_missing(
            f"No `{POLICY_NAME}` runs found in `{ctx.results_root}`.",
            "python -m helicyn_sim research-run --config configs/research_matrix.yaml "
            "--out research_outputs/main_experiment --quick",
        )
    else:
        means = all_runs.groupby("policy_name").mean(numeric_only=True)
        if BASELINE_POLICY_NAME not in means.index:
            st.info("No baseline_first_fit rows present -- cannot compute deltas.")
        else:
            baseline = means.loc[BASELINE_POLICY_NAME]
            integrated = means.loc[POLICY_NAME]

            def pct(metric: str) -> str:
                b = baseline.get(metric)
                v = integrated.get(metric)
                if not b:
                    return "n/a"
                return f"{(v - b) / b * 100:+.1f}%"

            def absolute(metric: str) -> str:
                b = baseline.get(metric)
                v = integrated.get(metric)
                if b is None or v is None:
                    return "n/a"
                return f"{v - b:+.1f}"

            components.render_kpi_cards(
                {
                    "Facility energy Δ": pct("total_facility_energy_kwh"),
                    "Carbon Δ": pct("total_carbon_kgco2e"),
                    "Cost Δ": pct("total_cost_usd"),
                    "Deadline misses Δ": absolute("deadline_misses"),
                    "Thermal violations Δ": absolute("thermal_violations"),
                }
            )

            energy_improved = integrated.get("total_facility_energy_kwh", 0) < baseline.get(
                "total_facility_energy_kwh", 0
            )
            sla_worse = integrated.get("deadline_misses", 0) > baseline.get("deadline_misses", 0) + 0.5
            thermal_worse = integrated.get("thermal_violations", 0) > baseline.get("thermal_violations", 0) + 0.5
            if energy_improved and (sla_worse or thermal_worse):
                worse_bits = []
                if sla_worse:
                    worse_bits.append("deadline misses")
                if thermal_worse:
                    worse_bits.append("thermal violations")
                st.warning(
                    f"integrated_coordination reduced facility energy in this results set, but "
                    f"{' and '.join(worse_bits)} simulated *worse* than baseline -- this is a real tradeoff "
                    "in these scenarios, not hidden here. See docs/results_interpretation.md."
                )
            elif energy_improved:
                st.success(
                    "integrated_coordination reduced facility energy without a simulated deadline-miss or "
                    "thermal-violation regression, in this results set."
                )

    st.divider()
    st.subheader("Representative decisions")
    decisions_df = _find_integrated_decisions(ctx)
    if decisions_df is None or decisions_df.empty:
        components.render_missing(f"No `{POLICY_NAME}` policy_decisions.csv found under `{ctx.results_root}/runs`.")
    else:
        for keyword, label in [
            ("active server", "Placed on active server"),
            ("avoided rack", "Avoided a hot/risky rack"),
            ("delayed flexible", "Delayed a flexible job"),
            ("high_performance", "Used high_performance DVFS"),
            ("power_saver", "Used power_saver DVFS"),
        ]:
            matches = decisions_df[decisions_df["reason"].astype(str).str.contains(keyword, case=False, na=False)]
            if not matches.empty:
                st.markdown(f"**{label}** ({len(matches)} decisions)")
                st.dataframe(matches.head(3), use_container_width=True, hide_index=True)

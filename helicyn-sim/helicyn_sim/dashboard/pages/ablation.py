"""Ablation page: policy-by-policy staging under one reference scenario."""
from __future__ import annotations

import streamlit as st

from helicyn_sim.dashboard import components, data_loader
from helicyn_sim.dashboard.charts import bar_by_group, waterfall

BASELINE_POLICY_NAME = "baseline_first_fit"


def render(ctx) -> None:
    df = data_loader.load_ablation_summary(ctx.ablation_dir)
    if df is None or df.empty:
        components.render_missing(
            f"No ablation_summary.csv found at `{ctx.ablation_dir}`.",
            "python -m helicyn_sim ablation --config configs/ablation.yaml --out research_outputs/ablation --quick",
        )
        return

    st.caption(f"Source: `{ctx.ablation_dir}/ablation_summary.csv`")
    st.subheader("Ablation table")
    st.dataframe(df, use_container_width=True, hide_index=True)

    st.subheader("Charts")
    col1, col2 = st.columns(2)
    with col1:
        st.pyplot(waterfall(df, "stage", "total_facility_energy_kwh", "Facility energy by stage", "kWh"))
        st.pyplot(bar_by_group(df, "stage", "deadline_misses", None, "Deadline misses by stage", "deadline misses"))
    with col2:
        st.pyplot(waterfall(df, "stage", "total_carbon_kgco2e", "Carbon by stage", "kgCO2e"))
        st.pyplot(
            bar_by_group(df, "stage", "thermal_violations", None, "Thermal violations by stage", "violations")
        )
    st.pyplot(waterfall(df, "stage", "total_cost_usd", "Cost by stage", "USD"))

    st.subheader("Interpretation")
    st.markdown(_interpretation(df))

    st.warning("Ablation is simulated and policy-specific, not proof of production savings.")


def _interpretation(df) -> str:
    lines = []
    non_baseline = df[df["policy_name"] != BASELINE_POLICY_NAME]

    if not non_baseline.empty:
        best_energy = non_baseline.loc[non_baseline["total_facility_energy_kwh"].idxmin()]
        lines.append(
            f"- **{best_energy['policy_name']}** contributed the largest facility-energy improvement "
            f"({best_energy['delta_vs_baseline_pct']:+.1f}% vs baseline) in this scenario."
        )

        worsened = non_baseline[non_baseline["delta_vs_baseline_pct"] > 5]
        if not worsened.empty:
            names = ", ".join(worsened["policy_name"].tolist())
            lines.append(f"- **{names}** *increased* facility energy vs baseline -- a real cost, not a saving.")

    if "integrated_coordination" in df["policy_name"].values:
        integrated_row = df[df["policy_name"] == "integrated_coordination"].iloc[0]
        single_objective = non_baseline[non_baseline["policy_name"] != "integrated_coordination"]
        if not single_objective.empty:
            better_than_all = (integrated_row["total_facility_energy_kwh"] <= single_objective["total_facility_energy_kwh"]).all()
            if better_than_all:
                lines.append(
                    "- `integrated_coordination` matched or beat every single-objective heuristic on facility "
                    "energy in this scenario."
                )
            else:
                beaten_by = single_objective[
                    single_objective["total_facility_energy_kwh"] < integrated_row["total_facility_energy_kwh"]
                ]["policy_name"].tolist()
                lines.append(
                    f"- `integrated_coordination` did **not** beat {', '.join(beaten_by)} on facility energy in "
                    "this scenario -- coordinating multiple objectives does not guarantee winning on any single one."
                )

    if "external_helicyn" in df["policy_name"].values:
        lines.append("- `external_helicyn` was included as a stage (helicyn-ml serve was reachable).")
    else:
        lines.append("- `external_helicyn` was not included in this ablation run (no reachable --helicyn-url).")

    return "\n".join(lines) if lines else "_No interpretable pattern in this table._"

"""Sensitivity page: one-factor-at-a-time sweep results."""
from __future__ import annotations

import streamlit as st

from helicyn_sim.dashboard import components, data_loader
from helicyn_sim.dashboard.charts import heatmap, line_by_category

BASELINE_POLICY_NAME = "baseline_first_fit"
INTEGRATED_POLICY_NAME = "integrated_coordination"


def render(ctx) -> None:
    df = data_loader.load_sensitivity_summary(ctx.sensitivity_dir)
    if df is None or df.empty:
        components.render_missing(
            f"No sensitivity_summary.csv found at `{ctx.sensitivity_dir}`.",
            "python -m helicyn_sim sensitivity --config configs/sensitivity.yaml "
            "--out research_outputs/sensitivity --quick",
        )
        return

    st.caption(f"Source: `{ctx.sensitivity_dir}/sensitivity_summary.csv`")
    st.info(
        "This is a one-factor-at-a-time sweep: each row changes exactly one variable, holding "
        "everything else at the base scenario's value. There is no scenario dimension here (that's "
        "research-run's job) and no full cartesian product across variables, so 2D heatmaps below "
        "show variable x value for one metric, not a true two-variable interaction."
    )

    col1, col2 = st.columns(2)
    with col1:
        variables = sorted(df["variable"].unique())
        variable_filter = st.multiselect("Variable", variables, default=variables)
    with col2:
        policies = sorted(df["policy_name"].unique())
        policy_filter = st.multiselect("Policy", policies, default=policies)

    filtered = df[df["variable"].isin(variable_filter) & df["policy_name"].isin(policy_filter)]

    metric = st.selectbox(
        "Metric",
        [
            ("delta_energy_vs_baseline_pct", "Facility energy Δ% vs baseline"),
            ("delta_carbon_vs_baseline_pct", "Carbon Δ% vs baseline"),
            ("delta_cost_vs_baseline_pct", "Cost Δ% vs baseline"),
            ("delta_deadline_misses_vs_baseline", "Deadline misses Δ vs baseline"),
            ("thermal_violations", "Thermal violations (absolute)"),
        ],
        format_func=lambda pair: pair[1],
    )
    metric_col, metric_label = metric

    st.subheader("Charts (one per variable)")
    for variable_name in variable_filter:
        sub = filtered[filtered["variable"] == variable_name]
        if sub.empty or metric_col not in sub.columns:
            continue
        st.pyplot(
            line_by_category(sub, "value", metric_col, "policy_name", f"{metric_label} vs {variable_name}", metric_label)
        )

    st.subheader(f"Heatmap: variable x value ({INTEGRATED_POLICY_NAME})")
    integrated = df[df["policy_name"] == INTEGRATED_POLICY_NAME]
    if integrated.empty:
        st.info(f"No `{INTEGRATED_POLICY_NAME}` rows to build a heatmap from.")
    else:
        pivot = integrated.pivot_table(index="variable", columns="value", values=metric_col, aggfunc="mean")
        st.pyplot(heatmap(pivot, f"{metric_label} ({INTEGRATED_POLICY_NAME})", metric_label))

    st.subheader("Interpretation")
    st.markdown(_interpretation(df))


def _interpretation(df) -> str:
    if INTEGRATED_POLICY_NAME not in df["policy_name"].unique() or BASELINE_POLICY_NAME not in df["policy_name"].unique():
        return "_Need both baseline_first_fit and integrated_coordination rows to interpret._"

    lines = []
    for variable_name, sub in df.groupby("variable"):
        integrated_rows = sub[sub["policy_name"] == INTEGRATED_POLICY_NAME]
        if integrated_rows.empty or "delta_energy_vs_baseline_pct" not in integrated_rows.columns:
            continue
        helps = (integrated_rows["delta_energy_vs_baseline_pct"] < -2).all()
        hurts = (integrated_rows["delta_energy_vs_baseline_pct"] > 2).any()
        if helps:
            lines.append(f"- **{variable_name}**: integrated_coordination reduced facility energy across every swept value.")
        elif hurts:
            lines.append(
                f"- **{variable_name}**: integrated_coordination *increased* facility energy for at least one "
                "swept value -- coordination does not universally help here."
            )
        else:
            lines.append(f"- **{variable_name}**: mixed or negligible effect across swept values.")

    return "\n".join(lines) if lines else "_No interpretable pattern found._"

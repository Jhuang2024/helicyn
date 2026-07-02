"""Policy Comparison page: aggregate research-run results across policies
and scenarios, with a cautious auto-generated interpretation panel.
"""
from __future__ import annotations

import glob
from pathlib import Path

import pandas as pd
import streamlit as st

from helicyn_sim.dashboard import components, data_loader
from helicyn_sim.dashboard.charts import bar_by_group

KNOWN_SCENARIOS = [
    "normal_load",
    "high_load",
    "carbon_shift_opportunity",
    "thermal_stress",
    "price_spike",
    "mixed_stress",
]

BAR_METRICS = [
    ("total_facility_energy_kwh", "Facility energy (kWh)"),
    ("total_carbon_kgco2e", "Carbon (kgCO2e)"),
    ("total_cost_usd", "Cost (USD)"),
    ("deadline_misses", "Deadline misses"),
    ("thermal_violations", "Thermal violations"),
    ("active_server_hours", "Active server-hours"),
]

BASELINE_POLICY_NAME = "baseline_first_fit"


def _find_before_after_summary(repo_root: Path) -> pd.DataFrame | None:
    for path_str in sorted(glob.glob(str(repo_root / "runs" / "before_after*" / "comparison" / "summary.csv"))):
        df = data_loader.read_csv_safe(path_str)
        if df is not None:
            return df
    return None


def render(ctx) -> None:
    all_runs = data_loader.load_all_runs_summary(ctx.results_root)
    source = f"{ctx.results_root}/aggregate/all_runs_summary.csv"

    if all_runs is None or all_runs.empty:
        before_after = _find_before_after_summary(ctx.repo_root)
        if before_after is not None:
            all_runs = before_after
            all_runs["scenario"] = "before_after"
            source = "runs/before_after*/comparison/summary.csv (Phase 2 fallback -- no scenario/seed matrix)"
        else:
            components.render_missing(
                "No research-run aggregate or before-after summary found.",
                "python -m helicyn_sim research-run --config configs/research_matrix.yaml "
                "--out research_outputs/main_experiment --quick",
            )
            return

    st.caption(f"Source: `{source}`")

    if "scenario" in all_runs.columns:
        scenarios_present = [s for s in KNOWN_SCENARIOS if s in all_runs["scenario"].unique()] or sorted(
            all_runs["scenario"].unique()
        )
        selected_scenarios = st.multiselect("Scenario filter", scenarios_present, default=scenarios_present)
        filtered = all_runs[all_runs["scenario"].isin(selected_scenarios)] if selected_scenarios else all_runs
    else:
        filtered = all_runs

    if "resource_trace_used" in filtered.columns:
        filtered = filtered.copy()
        filtered["data_mode"] = filtered["resource_trace_used"].apply(
            lambda v: "trace-shaped" if isinstance(v, str) and v else "synthetic"
        )

    st.subheader("Policy comparison table")
    display_cols = [
        c
        for c in [
            "policy_name",
            "scenario",
            "seed",
            "data_mode",
            "total_facility_energy_kwh",
            "total_carbon_kgco2e",
            "total_cost_usd",
            "deadline_misses",
            "thermal_violations",
        ]
        if c in filtered.columns
    ]
    summary_table = (
        filtered.groupby([c for c in ("scenario", "policy_name") if c in filtered.columns])[
            [c for c in display_cols if c not in ("policy_name", "scenario", "seed", "data_mode")]
        ]
        .mean(numeric_only=True)
        .reset_index()
    )
    st.dataframe(summary_table, use_container_width=True)

    st.subheader("Charts")
    cols = st.columns(2)
    for i, (metric, ylabel) in enumerate(BAR_METRICS):
        if metric not in filtered.columns:
            continue
        with cols[i % 2]:
            group = "scenario" if "scenario" in filtered.columns and filtered["scenario"].nunique() > 1 else None
            st.pyplot(bar_by_group(filtered, "policy_name", metric, group, f"{ylabel} by policy", ylabel))

    st.subheader("Interpretation (auto-generated, cautious)")
    st.markdown(_interpretation(filtered))
    st.caption(
        "Simulated results under this scenario's model assumptions, relative to baseline_first_fit. "
        "Not proof of real-world savings."
    )


def _interpretation(df: pd.DataFrame) -> str:
    if "policy_name" not in df.columns or BASELINE_POLICY_NAME not in df["policy_name"].unique():
        return "_No baseline_first_fit rows in the current filter -- cannot compute relative interpretation._"

    means = df.groupby("policy_name").mean(numeric_only=True)
    baseline = means.loc[BASELINE_POLICY_NAME]

    lines = []
    for metric, label in [
        ("total_facility_energy_kwh", "facility energy"),
        ("total_carbon_kgco2e", "carbon"),
        ("total_cost_usd", "cost"),
    ]:
        if metric not in means.columns or baseline.get(metric, 0) in (0, None):
            continue
        best_policy = means[metric].idxmin()
        if best_policy == BASELINE_POLICY_NAME:
            continue
        delta_pct = (means.loc[best_policy, metric] - baseline[metric]) / baseline[metric] * 100.0
        lines.append(
            f"- Under these scenarios, **{best_policy}** simulated the lowest mean {label} "
            f"({delta_pct:+.1f}% relative to baseline)."
        )

    if "deadline_misses" in means.columns:
        worse = means[means["deadline_misses"] > baseline.get("deadline_misses", 0) + 0.5]
        worse = worse[worse.index != BASELINE_POLICY_NAME]
        if not worse.empty:
            names = ", ".join(worse.index.tolist())
            lines.append(
                f"- **{names}** simulated *more* deadline misses than baseline in this filter -- check "
                "whether an energy/carbon win above comes from the same policy before calling it a clean win."
            )

    if "consolidation" in means.index and "active_server_hours" in means.columns:
        cons_energy_delta = (
            (means.loc["consolidation", "total_facility_energy_kwh"] - baseline["total_facility_energy_kwh"])
            / baseline["total_facility_energy_kwh"]
            * 100.0
            if baseline.get("total_facility_energy_kwh")
            else 0
        )
        cons_hours_delta = (
            (means.loc["consolidation", "active_server_hours"] - baseline["active_server_hours"])
            / baseline["active_server_hours"]
            * 100.0
            if baseline.get("active_server_hours")
            else 0
        )
        if cons_energy_delta < -5 and cons_hours_delta < -20:
            lines.append(
                f"- `consolidation`'s energy saving ({cons_energy_delta:+.1f}%) is accompanied by a large drop "
                f"in active-server-hours ({cons_hours_delta:+.1f}%) -- this saving is dominated by sleeping "
                "idle servers, not smarter placement. See docs/results_interpretation.md."
            )

    if not lines:
        lines.append("- No clear pattern in the current filter -- try selecting more scenarios or a different metric.")

    return "\n".join(lines)

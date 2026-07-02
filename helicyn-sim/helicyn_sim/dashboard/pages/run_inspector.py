"""Single Run Inspector page: everything about one policy's run."""
from __future__ import annotations

import json

import pandas as pd
import streamlit as st

from helicyn_sim.dashboard import components, data_loader
from helicyn_sim.dashboard.charts import line_over_time

SUM_COLS = [
    "it_power_kw",
    "facility_power_kw",
    "cooling_power_kw",
    "cumulative_it_energy_kwh",
    "cumulative_facility_energy_kwh",
    "cumulative_cooling_energy_kwh",
    "cumulative_carbon_kgco2e",
    "cumulative_cost_usd",
    "active_servers",
    "sleeping_servers",
    "running_jobs",
    "completed_jobs",
    "thermal_violations",
]
MEAN_COLS = [
    "dynamic_pue",
    "carbon_intensity_gco2e_per_kwh",
    "electricity_price_usd_per_mwh",
    "ambient_temp_c",
    "average_cpu_utilization",
    "average_memory_utilization",
]
FIRST_COLS = ["queued_jobs", "rejected_jobs", "deadline_misses"]  # fleet-wide, duplicated per site row
MAX_COLS = ["max_rack_temp_c", "p95_rack_temp_c"]


def _aggregate_fleet_wide(df: pd.DataFrame) -> pd.DataFrame:
    agg = {}
    for col in SUM_COLS:
        if col in df.columns:
            agg[col] = "sum"
    for col in MEAN_COLS:
        if col in df.columns:
            agg[col] = "mean"
    for col in FIRST_COLS:
        if col in df.columns:
            agg[col] = "first"
    for col in MAX_COLS:
        if col in df.columns:
            agg[col] = "max"
    return df.groupby("timestamp", as_index=False).agg(agg)


def render(ctx) -> None:
    run_dir = ctx.run_dir
    st.caption(f"Run folder: `{run_dir}`")

    summary = data_loader.load_run_summary(run_dir)
    if summary is None:
        components.render_missing(
            f"No `run_summary.json` found at `{run_dir}`. Enter a valid run folder in the sidebar, or run:",
            "python -m helicyn_sim run --config configs/demo.yaml --policy baseline_first_fit "
            "--out runs/demo_baseline",
        )
        return

    st.subheader("Run summary")
    components.render_kpi_cards(
        {
            "Policy": str(summary.get("policy_name", "n/a")),
            "Total jobs": str(summary.get("total_jobs", "n/a")),
            "Completed": str(summary.get("completed_jobs", "n/a")),
            "Rejected": str(summary.get("rejected_jobs", "n/a")),
        }
    )
    components.render_kpi_cards(
        {
            "Deadline misses": str(summary.get("deadline_misses", "n/a")),
            "Facility energy (kWh)": f"{summary.get('total_facility_energy_kwh', 0):.2f}",
            "Carbon (kgCO2e)": f"{summary.get('total_carbon_kgco2e', 0):.2f}",
            "Cost (USD)": f"{summary.get('total_cost_usd', 0):.2f}",
        }
    )
    components.render_kpi_cards(
        {
            "Average PUE": f"{summary.get('average_pue', 0):.3f}",
            "Peak facility power (kW)": f"{summary.get('peak_facility_power_kw', 0):.2f}",
            "Max rack temp (C)": f"{summary.get('max_rack_temp_c', 0):.1f}",
            "Thermal violations": str(summary.get("thermal_violations", "n/a")),
        }
    )

    st.divider()
    st.subheader("Timeseries")
    ts = data_loader.load_timeseries_metrics(run_dir)
    if ts is None or ts.empty:
        components.render_missing("No `timeseries_metrics.csv` found or it is empty.")
    else:
        fleet = _aggregate_fleet_wide(ts)

        col1, col2 = st.columns(2)
        with col1:
            st.pyplot(
                line_over_time(fleet, "timestamp", ["it_power_kw", "facility_power_kw"], "IT vs facility power", "kW")
            )
            st.pyplot(line_over_time(fleet, "timestamp", ["dynamic_pue"], "PUE over time (fleet mean)", "PUE"))
            st.pyplot(
                line_over_time(
                    fleet,
                    "timestamp",
                    ["cumulative_facility_energy_kwh", "cumulative_carbon_kgco2e", "cumulative_cost_usd"],
                    "Cumulative energy / carbon / cost",
                    "value (mixed units)",
                )
            )
            st.pyplot(
                line_over_time(
                    fleet,
                    "timestamp",
                    ["average_cpu_utilization", "average_memory_utilization"],
                    "CPU/memory utilization (awake servers)",
                    "fraction",
                )
            )
        with col2:
            if "site_id" in ts.columns:
                st.pyplot(
                    line_over_time(
                        ts[ts["site_id"] == ts["site_id"].iloc[0]],
                        "timestamp",
                        ["carbon_intensity_gco2e_per_kwh"],
                        f"Carbon intensity ({ts['site_id'].iloc[0]})",
                        "gCO2e/kWh",
                    )
                )
                st.pyplot(
                    line_over_time(
                        ts[ts["site_id"] == ts["site_id"].iloc[0]],
                        "timestamp",
                        ["electricity_price_usd_per_mwh"],
                        f"Electricity price ({ts['site_id'].iloc[0]})",
                        "$/MWh",
                    )
                )
            st.pyplot(
                line_over_time(
                    fleet,
                    "timestamp",
                    ["queued_jobs", "running_jobs", "completed_jobs", "rejected_jobs"],
                    "Job counts over time",
                    "jobs",
                )
            )
            st.pyplot(
                line_over_time(fleet, "timestamp", ["max_rack_temp_c", "p95_rack_temp_c"], "Rack temperature", "C")
            )

    st.divider()
    st.subheader("Job results")
    jobs = data_loader.load_job_results(run_dir)
    if jobs is None or jobs.empty:
        components.render_missing("No `job_results.csv` found or it is empty.")
    else:
        col1, col2 = st.columns(2)
        with col1:
            workload_types = ["(all)"] + sorted(jobs["workload_type"].dropna().unique().tolist())
            workload_filter = st.selectbox("Workload type", workload_types)
        with col2:
            status_filter = st.selectbox("Status", ["(all)", "completed", "rejected", "deadline_missed"])

        filtered = jobs
        if workload_filter != "(all)":
            filtered = filtered[filtered["workload_type"] == workload_filter]
        if status_filter != "(all)":
            filtered = filtered[filtered[status_filter] == True]  # noqa: E712

        st.dataframe(filtered, use_container_width=True, height=300)

    st.divider()
    st.subheader("Policy decisions")
    decisions = data_loader.load_policy_decisions(run_dir)
    if decisions is None or decisions.empty:
        components.render_missing("No `policy_decisions.csv` found or it is empty.")
    else:
        col1, col2 = st.columns(2)
        with col1:
            actions = ["(all)"] + sorted(decisions["action"].dropna().unique().tolist())
            action_filter = st.selectbox("Action", actions)
        with col2:
            reason_search = st.text_input("Search reason text", value="")

        filtered = decisions
        if action_filter != "(all)":
            filtered = filtered[filtered["action"] == action_filter]
        if reason_search:
            filtered = filtered[filtered["reason"].astype(str).str.contains(reason_search, case=False, na=False)]

        rejected_count = (decisions["action"] == "rejected_external_action").sum()
        if rejected_count:
            st.warning(f"{rejected_count} rejected_external_action decisions in this run (external_helicyn only).")

        st.dataframe(filtered, use_container_width=True, height=300)

    st.divider()
    st.subheader("Downloads")
    dl_cols = st.columns(4)
    if summary is not None:
        dl_cols[0].download_button(
            "run_summary.json", data=json.dumps(summary, indent=2), file_name="run_summary.json", mime="application/json"
        )
    if ts is not None:
        dl_cols[1].download_button(
            "timeseries_metrics.csv", data=ts.to_csv(index=False), file_name="timeseries_metrics.csv", mime="text/csv"
        )
    if jobs is not None:
        dl_cols[2].download_button(
            "job_results.csv", data=jobs.to_csv(index=False), file_name="job_results.csv", mime="text/csv"
        )
    if decisions is not None:
        dl_cols[3].download_button(
            "policy_decisions.csv", data=decisions.to_csv(index=False), file_name="policy_decisions.csv", mime="text/csv"
        )

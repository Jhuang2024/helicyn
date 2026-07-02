"""Run Policy Comparison page: run every built-in policy (and, if
reachable, external_helicyn) under one config from the dashboard, without
typing `python -m helicyn_sim before-after ...`.

Calls the same internal `run_before_after` function the CLI uses. Output
folder names are validated by `run_control.validate_output_folder_name` so
this page can never write outside `runs/`.
"""
from __future__ import annotations

import io
import contextlib
import traceback

import streamlit as st

from helicyn_sim.dashboard import components, data_loader, run_control
from helicyn_sim.dashboard.charts import bar_by_group
from helicyn_sim.experiments.before_after import run_before_after

CHART_METRICS = [
    ("total_facility_energy_kwh", "Facility energy (kWh)"),
    ("total_carbon_kgco2e", "Carbon (kgCO2e)"),
    ("total_cost_usd", "Cost (USD)"),
    ("deadline_misses", "Deadline misses"),
    ("thermal_violations", "Thermal violations"),
]


def render(ctx) -> None:
    st.markdown(
        "Run baseline_first_fit plus every built-in heuristic policy (and, if reachable, "
        "external_helicyn) under one config, then compare them -- no terminal required. This calls "
        "the same internal function as `python -m helicyn_sim before-after`."
    )

    configs = run_control.list_available_configs(ctx.repo_root)
    if not configs:
        components.render_missing(f"No config files found in `{ctx.repo_root / 'configs'}`.")
        return

    config_name = st.selectbox("Config file", configs, key="cmp_config")

    trace_path = run_control.default_resource_trace_path(ctx.repo_root)
    use_trace = False
    if trace_path is not None:
        use_trace = st.checkbox(f"Use resource trace ({trace_path.name})", value=False)
    else:
        st.caption("No resource trace found next to this checkout -- comparison will use synthetic demand only.")

    include_external = st.checkbox("Include external_helicyn", value=False)
    helicyn_url = None
    if include_external:
        helicyn_url = st.text_input(
            "Helicyn ML server URL", value=run_control.DEFAULT_EXTERNAL_HELICYN_URL, key="cmp_helicyn_url"
        )
        if st.button("Check server", key="cmp_check_server"):
            is_up, message = run_control.check_external_helicyn_server(helicyn_url)
            if is_up:
                st.success(message)
            else:
                st.error(
                    "External Helicyn ML server is not running. Start it first, or leave "
                    f"'Include external_helicyn' unchecked. Detail: {message}"
                )

    folder_name = st.text_input("Output folder name (under runs/)", value="dashboard_comparison")

    if st.button("Run comparison", type="primary"):
        try:
            safe_folder = run_control.validate_output_folder_name(folder_name)
        except run_control.UnsafeOutputFolderError as exc:
            st.error(str(exc))
            return

        out_dir = run_control.resolve_run_output_dir(ctx.repo_root, safe_folder)
        config_path = ctx.repo_root / "configs" / config_name
        trace_arg = str(trace_path) if (use_trace and trace_path is not None) else None

        log_buffer = io.StringIO()
        with st.spinner(f"Running policy comparison on {config_name}... this runs several full simulations."):
            try:
                with contextlib.redirect_stdout(log_buffer), contextlib.redirect_stderr(log_buffer):
                    result = run_before_after(
                        config_path=config_path,
                        out_dir=out_dir,
                        resource_trace_path=trace_arg,
                        helicyn_url=helicyn_url if include_external else None,
                    )
                ok = True
            except Exception:
                ok = False
                result = None
                log_buffer.write(traceback.format_exc())

        with st.expander("Run log (stdout/stderr)", expanded=not ok):
            log_text = log_buffer.getvalue()
            st.code(log_text if log_text else "(no output)", language="text")

        if not ok:
            st.error(f"Comparison run failed. Partial outputs (if any) at `{out_dir}`.")
            return

        st.success(f"Comparison complete. external_helicyn status: {result['external_status']}")
        st.session_state["_last_comparison_dir"] = result["comparison_dir"]

    last_comparison_dir = st.session_state.get("_last_comparison_dir")
    if last_comparison_dir:
        st.divider()
        st.subheader(f"Latest comparison: `{last_comparison_dir}`")
        summary = data_loader.read_csv_safe(f"{last_comparison_dir}/summary.csv")
        report = data_loader.load_markdown_doc(f"{last_comparison_dir}/report.md")

        if summary is None or summary.empty:
            components.render_missing("comparison/summary.csv not found or empty for this run yet.")
            return

        st.subheader("Policy comparison table")
        st.dataframe(summary, use_container_width=True)

        st.subheader("Charts")
        cols = st.columns(2)
        for i, (metric, ylabel) in enumerate(CHART_METRICS):
            if metric not in summary.columns:
                continue
            with cols[i % 2]:
                st.pyplot(bar_by_group(summary, "policy_name", metric, None, f"{ylabel} by policy", ylabel))

        if report:
            st.subheader("Report")
            st.markdown(report)

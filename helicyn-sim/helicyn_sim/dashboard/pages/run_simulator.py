"""Run Simulator page: run one simulation from the dashboard without
typing a `python -m helicyn_sim run ...` command.

Calls the same internal `run_experiment` function the CLI's `run` command
uses -- no subprocess, no shell, no new simulator behavior. Output folder
names are validated by `run_control.validate_output_folder_name` so this
page can never write outside `runs/`.
"""
from __future__ import annotations

import io
import contextlib
import traceback

import streamlit as st

from helicyn_sim.dashboard import components, data_loader, run_control
from helicyn_sim.experiments.run import run_experiment
from helicyn_sim.policies.external_helicyn import ExternalHelicynUnavailableError

KPI_METRICS = [
    ("total_facility_energy_kwh", "Facility energy (kWh)", "{:.1f}"),
    ("total_it_energy_kwh", "IT energy (kWh)", "{:.1f}"),
    ("total_carbon_kgco2e", "Carbon (kgCO2e)", "{:.1f}"),
    ("total_cost_usd", "Cost (USD)", "${:.2f}"),
    ("completed_jobs", "Completed jobs", "{:.0f}"),
    ("rejected_jobs", "Rejected jobs", "{:.0f}"),
    ("deadline_misses", "Deadline misses", "{:.0f}"),
    ("thermal_violations", "Thermal violations", "{:.0f}"),
    ("average_pue", "Average PUE", "{:.3f}"),
    ("peak_facility_power_kw", "Peak facility power (kW)", "{:.1f}"),
]


def render(ctx) -> None:
    st.markdown(
        "Run one simulation without a terminal. This calls the same internal simulator function "
        "as `python -m helicyn_sim run` -- no equations, policies, or configs are changed here."
    )

    configs = run_control.list_available_configs(ctx.repo_root)
    if not configs:
        components.render_missing(f"No config files found in `{ctx.repo_root / 'configs'}`.")
        return

    config_name = st.selectbox("Config file", configs)
    policy = st.selectbox("Policy", run_control.DASHBOARD_POLICY_CHOICES)

    trace_path = run_control.default_resource_trace_path(ctx.repo_root)
    trace_choices = ["none"]
    if trace_path is not None:
        trace_choices.append(str(trace_path))
    resource_trace = st.selectbox("Resource trace", trace_choices)
    if trace_path is None:
        st.caption(
            "No resource trace found at ../helicyn-ml/data/processed/resources/google_cpu_memory.parquet -- "
            "using synthetic demand only (not an error)."
        )

    folder_name = st.text_input("Output folder name (under runs/)", value="dashboard_run")

    helicyn_url = None
    if policy == "external_helicyn":
        st.info(
            "`external_helicyn` requires a running helicyn-ml server. `integrated_coordination` needs no "
            "external server and is the closest built-in policy to Helicyn's coordination logic."
        )
        helicyn_url = st.text_input("Helicyn ML server URL", value=run_control.DEFAULT_EXTERNAL_HELICYN_URL)
        if st.button("Check server", key="run_sim_check_server"):
            is_up, message = run_control.check_external_helicyn_server(helicyn_url)
            if is_up:
                st.success(message)
            else:
                st.error(
                    "External Helicyn ML server is not running. Start it first "
                    f"(see helicyn-sim/docs/how_to_use_without_terminal.md), or use integrated_coordination "
                    f"instead. Detail: {message}"
                )

    if st.button("Run simulation", type="primary"):
        try:
            safe_folder = run_control.validate_output_folder_name(folder_name)
        except run_control.UnsafeOutputFolderError as exc:
            st.error(str(exc))
            return

        out_dir = run_control.resolve_run_output_dir(ctx.repo_root, safe_folder)
        config_path = ctx.repo_root / "configs" / config_name
        trace_arg = None if resource_trace == "none" else resource_trace

        if policy == "external_helicyn":
            is_up, message = run_control.check_external_helicyn_server(
                helicyn_url or run_control.DEFAULT_EXTERNAL_HELICYN_URL
            )
            if not is_up:
                st.error(
                    "External Helicyn ML server is not running. Start it first, or use "
                    f"integrated_coordination instead. Detail: {message}"
                )
                return

        log_buffer = io.StringIO()
        with st.spinner(f"Running {policy} on {config_name}..."):
            try:
                with contextlib.redirect_stdout(log_buffer), contextlib.redirect_stderr(log_buffer):
                    summary = run_experiment(
                        config_path=config_path,
                        policy_name=policy,
                        out_dir=out_dir,
                        resource_trace_path=trace_arg,
                        helicyn_url=helicyn_url,
                    )
                ok = True
            except ExternalHelicynUnavailableError as exc:
                ok = False
                summary = None
                log_buffer.write(f"external_helicyn unavailable: {exc}\n")
            except Exception:
                ok = False
                summary = None
                log_buffer.write(traceback.format_exc())

        with st.expander("Run log (stdout/stderr)", expanded=not ok):
            log_text = log_buffer.getvalue()
            st.code(log_text if log_text else "(no output)", language="text")

        if not ok:
            st.error(f"Run failed. Output written (partially) to `{out_dir}`.")
            return

        st.success(f"Run complete. Outputs written to `{out_dir}`.")
        st.session_state["_last_run_dir"] = str(out_dir)

    last_run_dir = st.session_state.get("_last_run_dir")
    if last_run_dir:
        st.divider()
        st.subheader(f"Latest run: `{last_run_dir}`")
        summary = data_loader.load_run_summary(last_run_dir)
        if summary is None:
            components.render_missing("run_summary.json not found for this run yet.")
        else:
            kpis = {}
            for key, label, fmt in KPI_METRICS:
                value = summary.get(key)
                kpis[label] = fmt.format(value) if isinstance(value, (int, float)) else "n/a"
            components.render_kpi_cards(kpis)

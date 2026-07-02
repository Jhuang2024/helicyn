"""Helicyn Sim research dashboard entrypoint.

Launch with:
    streamlit run helicyn_sim/dashboard/app.py
or:
    python -m helicyn_sim dashboard

This is a local research cockpit for inspecting simulator runs and the
Phase 3 research evidence package -- NOT a marketing dashboard, NOT the
public website, NOT helicyn.com/control-plane. See docs/dashboard.md.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

import streamlit as st

# Allow `streamlit run helicyn_sim/dashboard/app.py` to find the package
# when launched directly from a checkout without `pip install -e .`.
_PACKAGE_ROOT = Path(__file__).resolve().parents[2]
if str(_PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(_PACKAGE_ROOT))

from helicyn_sim.dashboard import components, data_loader  # noqa: E402
from helicyn_sim.dashboard.pages import (  # noqa: E402
    ablation as ablation_page,
    claims_audit as claims_audit_page,
    external_helicyn as external_helicyn_page,
    integrated_coordination as integrated_coordination_page,
    methodology as methodology_page,
    overview as overview_page,
    paper_outputs as paper_outputs_page,
    policy_comparison as policy_comparison_page,
    run_inspector as run_inspector_page,
    sensitivity as sensitivity_page,
)

PAGES = {
    "Overview": overview_page,
    "Single Run Inspector": run_inspector_page,
    "Policy Comparison": policy_comparison_page,
    "Integrated Coordination": integrated_coordination_page,
    "External Helicyn": external_helicyn_page,
    "Ablation": ablation_page,
    "Sensitivity": sensitivity_page,
    "Paper Outputs": paper_outputs_page,
    "Claims Audit": claims_audit_page,
    "Methodology / Assumptions": methodology_page,
}


@dataclass
class DashboardContext:
    repo_root: Path
    results_root: Path  # a research-run output dir, e.g. research_outputs/main_experiment
    run_dir: Path  # a single-policy run dir, e.g. runs/demo_baseline
    ablation_dir: Path
    sensitivity_dir: Path
    figures_dir: Path
    tables_dir: Path
    claims_audit_path: Path
    research_report_path: Path
    docs_dir: Path


def _default_run_dir(repo_root: Path) -> str:
    candidates = data_loader.discover_run_dirs(repo_root / "runs", max_results=1)
    if candidates:
        return str(candidates[0].relative_to(repo_root))
    return "runs/demo_baseline"


def _build_context() -> DashboardContext:
    repo_root = Path.cwd()

    st.sidebar.title("Helicyn Sim")
    st.sidebar.caption("Research cockpit -- not the marketing site.")

    results_root_str = st.sidebar.text_input(
        "Results root (research-run output)", value="research_outputs/main_experiment"
    )
    results_root = (repo_root / results_root_str).resolve()
    research_outputs_root = results_root.parent

    run_dir_str = st.sidebar.text_input("Run folder (single run)", value=_default_run_dir(repo_root))
    run_dir = (repo_root / run_dir_str).resolve()

    with st.sidebar.expander("Advanced paths", expanded=False):
        ablation_dir = Path(
            st.text_input("Ablation dir", value=str((research_outputs_root / "ablation")))
        )
        sensitivity_dir = Path(
            st.text_input("Sensitivity dir", value=str((research_outputs_root / "sensitivity")))
        )
        figures_dir = Path(st.text_input("Figures dir", value=str((research_outputs_root / "figures"))))
        tables_dir = Path(st.text_input("Tables dir", value=str((research_outputs_root / "tables"))))
        claims_audit_path = Path(
            st.text_input("Claims audit file", value=str((research_outputs_root / "claims_audit.md")))
        )
        research_report_path = Path(
            st.text_input("Research report file", value=str((research_outputs_root / "research_report.md")))
        )

    page_name = st.sidebar.radio("Page", list(PAGES.keys()))

    components.render_safety_warning()

    availability = data_loader.data_availability(
        results_root,
        ablation_dir=ablation_dir,
        sensitivity_dir=sensitivity_dir,
        figures_dir=figures_dir,
        tables_dir=tables_dir,
        claims_audit_path=claims_audit_path,
    )
    components.render_data_availability(availability)

    st.session_state["_page_name"] = page_name

    return DashboardContext(
        repo_root=repo_root,
        results_root=results_root,
        run_dir=run_dir,
        ablation_dir=ablation_dir,
        sensitivity_dir=sensitivity_dir,
        figures_dir=figures_dir,
        tables_dir=tables_dir,
        claims_audit_path=claims_audit_path,
        research_report_path=research_report_path,
        docs_dir=(repo_root / "docs").resolve(),
    )


def main() -> None:
    st.set_page_config(page_title="Helicyn Sim Research Cockpit", layout="wide")
    ctx = _build_context()
    page_name = st.session_state["_page_name"]
    st.title(page_name)
    PAGES[page_name].render(ctx)


if __name__ == "__main__":
    main()

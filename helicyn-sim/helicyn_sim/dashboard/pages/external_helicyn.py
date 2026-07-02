"""External Helicyn page: inspect external_helicyn results and check
whether a helicyn-ml serve process is currently reachable.
"""
from __future__ import annotations

import streamlit as st

from helicyn_sim.dashboard import components, data_loader
from helicyn_sim.policies.external_helicyn import ExternalHelicynPolicy, ExternalHelicynUnavailableError

POLICY_NAME = "external_helicyn"
BASELINE_POLICY_NAME = "baseline_first_fit"

START_SERVER_CMD = """cd /home/user/helicyn/helicyn-ml
python -m helicyn_ml serve --models artifacts/models --host 127.0.0.1 --port 8765"""

RUN_BEFORE_AFTER_CMD = """cd /home/user/helicyn/helicyn-sim
python -m helicyn_sim before-after \\
  --config configs/before_after.yaml \\
  --helicyn-url http://127.0.0.1:8765/recommend \\
  --resource-trace ../helicyn-ml/data/processed/resources/google_cpu_memory.parquet \\
  --out runs/before_after_with_helicyn_trace_shaped"""


def _find_external_decisions(ctx):
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
        "`external_helicyn` calls a real running `helicyn-ml serve` process over HTTP "
        "(`POST /recommend`) and validates every recommended action against the simulator's actual "
        "capacity/state before applying it (unaddressed or invalid actions fall back to safe "
        "first-fit placement). See `docs/phase2_external_helicyn.md`."
    )
    st.warning(
        "The current `helicyn-ml` `policy_ranker` is **teacher-imitation only** -- trained to imitate "
        "a hand-written heuristic score, not from real or simulated outcomes (see "
        "`docs/ml_integration_plan.md`). `external_helicyn` may therefore show no material improvement "
        "over baseline yet; that is an expected, honest finding, not a broken adapter."
    )

    st.subheader("Server status")
    url = st.text_input("helicyn-ml /recommend URL", value="http://127.0.0.1:8765/recommend")
    if st.button("Check health"):
        policy = ExternalHelicynPolicy(url=url)
        try:
            policy.check_available()
            st.success(f"Reachable: {policy.health_url()}")
        except ExternalHelicynUnavailableError as exc:
            st.error(f"Unavailable: {exc}")

    st.divider()
    st.subheader("Results")
    all_runs = data_loader.load_all_runs_summary(ctx.results_root)
    has_external = all_runs is not None and not all_runs.empty and POLICY_NAME in all_runs["policy_name"].unique()

    if not has_external:
        components.render_missing(
            f"No `{POLICY_NAME}` run found in `{ctx.results_root}`. Start helicyn-ml serve and run "
            "before-after (or research-run) with --helicyn-url.",
        )
        st.markdown("**1. Start helicyn-ml serve:**")
        st.code(START_SERVER_CMD, language="bash")
        st.markdown("**2. Run before-after with external Helicyn:**")
        st.code(RUN_BEFORE_AFTER_CMD, language="bash")
        return

    means = all_runs.groupby("policy_name").mean(numeric_only=True)
    if BASELINE_POLICY_NAME not in means.index:
        st.info("No baseline_first_fit rows present -- cannot compute deltas.")
    else:
        baseline = means.loc[BASELINE_POLICY_NAME]
        external = means.loc[POLICY_NAME]

        def pct(metric: str) -> str:
            b = baseline.get(metric)
            v = external.get(metric)
            if not b:
                return "n/a"
            return f"{(v - b) / b * 100:+.1f}%"

        def absolute(metric: str) -> str:
            b, v = baseline.get(metric), external.get(metric)
            return "n/a" if b is None or v is None else f"{v - b:+.1f}"

        components.render_kpi_cards(
            {
                "Facility energy Δ": pct("total_facility_energy_kwh"),
                "Carbon Δ": pct("total_carbon_kgco2e"),
                "Cost Δ": pct("total_cost_usd"),
                "Deadline misses Δ": absolute("deadline_misses"),
                "Thermal violations Δ": absolute("thermal_violations"),
            }
        )
        if abs(external.get("total_carbon_kgco2e", 0) - baseline.get("total_carbon_kgco2e", 0)) < 1e-6:
            st.info(
                "external_helicyn's simulated results are effectively identical to baseline_first_fit "
                "in this results set -- consistent with the untrained/fallback policy_ranker above."
            )

    st.subheader("Actions taken by external_helicyn")
    decisions = _find_external_decisions(ctx)
    if decisions is None or decisions.empty:
        components.render_missing("No policy_decisions.csv found for external_helicyn under this results root.")
    else:
        action_counts = decisions["action"].value_counts()
        st.dataframe(action_counts.rename("count").reset_index().rename(columns={"index": "action"}), hide_index=True)

        rejected = decisions[decisions["action"] == "rejected_external_action"]
        st.metric("Rejected external actions", len(rejected))
        if not rejected.empty:
            st.markdown("**Rejection reasons:**")
            st.dataframe(
                rejected["reason"].value_counts().rename("count").reset_index().rename(columns={"index": "reason"}),
                hide_index=True,
            )

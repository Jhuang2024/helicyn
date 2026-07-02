"""Methodology / Assumptions page: renders the project's own docs so the
dashboard is self-contained (no need to leave the browser to read them).
"""
from __future__ import annotations

import streamlit as st

from helicyn_sim.dashboard import components, data_loader

DOCS = [
    ("model_assumptions.md", "Model assumptions"),
    ("equations.md", "Equations"),
    ("experimental_methodology.md", "Experimental methodology"),
    ("results_interpretation.md", "Results interpretation"),
    ("limitations.md", "Limitations"),
]


def render(ctx) -> None:
    st.markdown(
        "This page renders `docs/*.md` directly so the dashboard is self-contained: timestep, fleet "
        "model, workload model, resource-trace shaping, power/PUE/thermal/carbon/cost equations, "
        "policy definitions, ML integration status, and limitations."
    )

    tabs = st.tabs([label for _, label in DOCS])
    for tab, (filename, label) in zip(tabs, DOCS):
        with tab:
            path = ctx.docs_dir / filename
            text = data_loader.load_markdown_doc(path)
            if text is None:
                components.render_missing(f"`{path}` not found.")
            else:
                st.caption(f"Source: `{path}`")
                st.markdown(text)

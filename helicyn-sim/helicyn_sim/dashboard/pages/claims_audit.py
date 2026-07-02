"""Claims Audit page: what this project can and cannot claim, with
visual supported / partially_supported / unsupported badges.
"""
from __future__ import annotations

import streamlit as st

from helicyn_sim.dashboard import components, data_loader
from helicyn_sim.experiments.claims_audit import build_claims_audit

BANNED_TOPICS = [
    "Production savings",
    "Real-world validation",
    "Real GPU optimization",
    "Real cooling optimization",
    "Real PUE prediction",
    "Real SLA prediction",
]


def render(ctx) -> None:
    st.error(
        "This project must **never** claim: " + ", ".join(BANNED_TOPICS) + ". "
        "Every claim below is categorized explicitly so it's obvious which ones are off-limits."
    )

    on_disk_path = ctx.claims_audit_path if ctx.claims_audit_path.exists() else (ctx.docs_dir / "claims_audit.md")
    on_disk_text = data_loader.load_claims_audit(on_disk_path)

    # Structured, live-computed view (same logic that generates the .md file) drives the badges;
    # the raw file (if present) is shown alongside for the literal generated document.
    claims = build_claims_audit(ctx.results_root)

    for status, title in [
        ("supported", "Supported"),
        ("partially_supported", "Partially supported"),
        ("unsupported", "Unsupported"),
    ]:
        section = [c for c in claims if c.status == status]
        if not section:
            continue
        st.subheader(title)
        for c in section:
            badge = components.render_status_badge(c.status)
            st.markdown(f"{badge} **{c.claim}**", unsafe_allow_html=True)
            st.caption(f"Evidence: {c.evidence_file}")
            st.caption(f"Caveat: {c.caveat}")
            st.markdown("")

    st.divider()
    if on_disk_text:
        st.caption(f"Raw generated file: `{on_disk_path}`")
        with st.expander("Raw claims_audit.md"):
            st.markdown(on_disk_text)
        st.download_button("Download claims_audit.md", data=on_disk_text, file_name="claims_audit.md", mime="text/markdown")
    else:
        components.render_missing(
            f"No generated claims_audit.md found at `{ctx.claims_audit_path}` (showing a live-computed "
            "audit above instead). To persist it to disk:",
            "python -m helicyn_sim claims-audit --results research_outputs/main_experiment "
            "--out research_outputs/claims_audit.md",
        )

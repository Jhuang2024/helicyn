"""Small reusable Streamlit UI pieces shared across dashboard pages."""
from __future__ import annotations

from typing import Optional

import streamlit as st

SAFETY_WARNING_TEXT = (
    "All results are simulated under documented assumptions. They are not "
    "production savings or real facility validation. See docs/limitations.md."
)

STATUS_BADGE_STYLE = {
    "supported": ("#1a7f37", "#dafbe1"),
    "partially_supported": ("#9a6700", "#fff8c5"),
    "unsupported": ("#cf222e", "#ffebe9"),
}


def render_safety_warning() -> None:
    st.warning(SAFETY_WARNING_TEXT)


def render_data_availability(availability: dict[str, bool]) -> None:
    st.caption("Data availability")
    labels = {
        "main_experiment": "research-run (main_experiment)",
        "ablation": "ablation",
        "sensitivity": "sensitivity",
        "figures": "figures",
        "tables": "tables",
        "claims_audit": "claims audit",
    }
    for key, label in labels.items():
        found = availability.get(key, False)
        icon = "✅" if found else "❌"
        st.markdown(f"{icon} {label}")


def render_missing(message: str, hint_command: Optional[str] = None) -> None:
    st.info(message)
    if hint_command:
        st.code(hint_command, language="bash")


def render_kpi_cards(kpis: dict[str, str], columns_per_row: int = 4) -> None:
    items = list(kpis.items())
    for row_start in range(0, len(items), columns_per_row):
        row_items = items[row_start : row_start + columns_per_row]
        cols = st.columns(len(row_items))
        for col, (label, value) in zip(cols, row_items):
            col.metric(label, value)


def render_status_badge(status: str) -> str:
    color, background = STATUS_BADGE_STYLE.get(status, ("#57606a", "#f6f8fa"))
    label = status.replace("_", " ").title()
    return (
        f'<span style="background-color:{background}; color:{color}; '
        f'padding:2px 8px; border-radius:10px; font-size:0.85em; font-weight:600;">'
        f"{label}</span>"
    )


def render_download_button(label: str, data, file_name: str, mime: str = "text/plain", key: Optional[str] = None) -> None:
    st.download_button(label=label, data=data, file_name=file_name, mime=mime, key=key)

"""Paper Outputs page: figures, tables, and the research report, ready to
copy-paste into a paper draft.
"""
from __future__ import annotations

import streamlit as st

from helicyn_sim.dashboard import components, data_loader


def render(ctx) -> None:
    st.subheader("Figures")
    figures = data_loader.list_figures(ctx.figures_dir)
    if not figures:
        components.render_missing(
            f"No figures found at `{ctx.figures_dir}`.",
            "python -m helicyn_sim paper-figures --results research_outputs/main_experiment "
            "--ablation research_outputs/ablation --sensitivity research_outputs/sensitivity "
            "--out research_outputs/figures",
        )
    else:
        st.caption(f"Source: `{ctx.figures_dir}`")
        captions = data_loader.load_captions(ctx.figures_dir)
        cols = st.columns(2)
        for i, fig_path in enumerate(figures):
            with cols[i % 2]:
                st.image(str(fig_path), caption=fig_path.name, use_container_width=True)
                caption_text = captions.get(fig_path.name)
                if caption_text:
                    st.caption(caption_text)
                st.download_button(
                    f"Download {fig_path.name}",
                    data=fig_path.read_bytes(),
                    file_name=fig_path.name,
                    mime="image/png",
                    key=f"dl_{fig_path.name}",
                )
                st.code(str(fig_path))

    st.divider()
    st.subheader("Tables")
    tables = data_loader.list_tables(ctx.tables_dir)
    paper_tables_md = data_loader.load_paper_tables_md(ctx.tables_dir)
    if not tables and not paper_tables_md:
        components.render_missing(
            f"No tables found at `{ctx.tables_dir}`.",
            "python -m helicyn_sim paper-tables --results research_outputs/main_experiment "
            "--ablation research_outputs/ablation --sensitivity research_outputs/sensitivity "
            "--out research_outputs/tables",
        )
    else:
        st.caption(f"Source: `{ctx.tables_dir}`")
        if paper_tables_md:
            with st.expander("paper_tables.md (rendered)", expanded=True):
                st.markdown(paper_tables_md)
            st.download_button(
                "Download paper_tables.md", data=paper_tables_md, file_name="paper_tables.md", mime="text/markdown"
            )
        for table_path in tables:
            df = data_loader.read_csv_safe(table_path)
            with st.expander(table_path.name):
                if df is not None:
                    st.dataframe(df, use_container_width=True)
                st.download_button(
                    f"Download {table_path.name}",
                    data=table_path.read_bytes(),
                    file_name=table_path.name,
                    mime="text/csv",
                    key=f"dl_table_{table_path.name}",
                )
                st.code(str(table_path))

    st.divider()
    st.subheader("Research report")
    report_text = data_loader.load_research_report(ctx.research_report_path)
    if not report_text:
        components.render_missing(
            f"No research report found at `{ctx.research_report_path}`.",
            "python -m helicyn_sim research-report --results research_outputs/main_experiment "
            "--ablation research_outputs/ablation --sensitivity research_outputs/sensitivity "
            "--claims research_outputs/claims_audit.md --out research_outputs/research_report.md",
        )
    else:
        st.caption(f"Source: `{ctx.research_report_path}`")
        with st.expander("research_report.md (rendered)", expanded=False):
            st.markdown(report_text)
        st.download_button(
            "Download research_report.md", data=report_text, file_name="research_report.md", mime="text/markdown"
        )

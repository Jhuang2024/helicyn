"""Matplotlib chart builders for the dashboard (no seaborn/plotly -- see
docs/dashboard.md for why: plotly isn't an existing project dependency and
Task B says prefer it only if already present). Every function returns a
`Figure` for `st.pyplot(fig)`; none of them save to disk (that's
paper_figures.py's job for the static evidence package).
"""
from __future__ import annotations

from typing import Optional

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402


def bar_by_group(
    df: pd.DataFrame, x: str, y: str, group: Optional[str], title: str, ylabel: str
) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(9, 4.5))
    if group and group in df.columns:
        pivot = df.pivot_table(index=x, columns=group, values=y, aggfunc="mean")
        pivot.plot(kind="bar", ax=ax)
        ax.legend(title=group, fontsize="small")
    else:
        grouped = df.groupby(x)[y].mean()
        ax.bar(grouped.index.astype(str), grouped.to_numpy())
    ax.set_ylabel(ylabel)
    ax.set_xlabel(x)
    ax.set_title(title)
    plt.setp(ax.get_xticklabels(), rotation=30, ha="right")
    fig.tight_layout()
    return fig


def line_over_time(df: pd.DataFrame, time_col: str, value_cols: list[str], title: str, ylabel: str) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(9, 4))
    x = pd.to_datetime(df[time_col])
    for col in value_cols:
        if col in df.columns:
            ax.plot(x, df[col], label=col)
    ax.set_xlabel("time")
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.legend(fontsize="small")
    fig.tight_layout()
    return fig


def waterfall(df: pd.DataFrame, x: str, y: str, title: str, ylabel: str) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(9, 4.5))
    baseline = df[y].iloc[0] if len(df) else 0.0
    colors = ["#4c72b0" if i == 0 else ("#55a868" if v <= baseline else "#c44e52") for i, v in enumerate(df[y])]
    ax.bar(df[x].astype(str), df[y], color=colors)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    plt.setp(ax.get_xticklabels(), rotation=30, ha="right")
    fig.tight_layout()
    return fig


def heatmap(pivot: pd.DataFrame, title: str, cbar_label: str) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(7.5, 4))
    im = ax.imshow(pivot.to_numpy(), cmap="RdYlGn_r", aspect="auto")
    ax.set_xticks(range(len(pivot.columns)))
    ax.set_xticklabels([str(c) for c in pivot.columns])
    ax.set_yticks(range(len(pivot.index)))
    ax.set_yticklabels([str(i) for i in pivot.index])
    for i in range(pivot.shape[0]):
        for j in range(pivot.shape[1]):
            value = pivot.to_numpy()[i, j]
            if pd.notna(value):
                ax.text(j, i, f"{value:.1f}", ha="center", va="center", fontsize=8)
    fig.colorbar(im, ax=ax, label=cbar_label)
    ax.set_title(title)
    fig.tight_layout()
    return fig


def line_by_category(df: pd.DataFrame, x: str, y: str, category: str, title: str, ylabel: str) -> plt.Figure:
    fig, ax = plt.subplots(figsize=(8, 4.5))
    for cat_value, sub in df.groupby(category):
        sorted_sub = sub.sort_values(x)
        ax.plot(sorted_sub[x].astype(str), sorted_sub[y], marker="o", label=str(cat_value))
    ax.set_xlabel(x)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.legend(title=category, fontsize="small")
    fig.tight_layout()
    return fig

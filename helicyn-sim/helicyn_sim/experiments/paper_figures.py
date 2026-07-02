"""`paper-figures`: matplotlib-only (no seaborn) figures from a completed
research-run + ablation + sensitivity output set. Every caption is written
in careful, non-claiming language -- see captions.md and
docs/results_interpretation.md.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

BAR_METRICS = [
    ("total_facility_energy_kwh", "facility_energy_by_policy.png", "Total facility energy (kWh)"),
    ("total_carbon_kgco2e", "carbon_by_policy.png", "Total carbon (kgCO2e)"),
    ("total_cost_usd", "cost_by_policy.png", "Total cost (USD)"),
    ("deadline_misses", "deadline_misses_by_policy.png", "Deadline misses"),
    ("thermal_violations", "thermal_violations_by_policy.png", "Thermal violations (steps > 32C)"),
    ("average_pue", "average_pue_by_policy.png", "Average PUE"),
    ("active_server_hours", "active_server_hours_by_policy.png", "Active server-hours"),
]

CAPTION_PREFIX = "Simulated result, under this scenario's model assumptions (docs/model_assumptions.md)."


def generate_paper_figures(
    results_dir: str | Path,
    out_dir: str | Path,
    ablation_dir: Optional[str | Path] = None,
    sensitivity_dir: Optional[str | Path] = None,
) -> dict:
    results_dir = Path(results_dir)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    captions: dict[str, str] = {}
    generated: list[str] = []

    scenario_policy_summary_path = results_dir / "aggregate" / "scenario_policy_summary.csv"
    if scenario_policy_summary_path.exists():
        summary_df = pd.read_csv(scenario_policy_summary_path)
        for metric, filename, ylabel in BAR_METRICS:
            if metric not in summary_df.columns:
                continue
            _grouped_bar_chart(summary_df, metric, ylabel, out_dir / filename)
            captions[filename] = (
                f"{CAPTION_PREFIX} {ylabel} by policy, grouped by scenario, relative to baseline_first_fit "
                f"where shown. Source: {scenario_policy_summary_path}."
            )
            generated.append(filename)

    ts_captions, ts_generated = _timeseries_figures(results_dir, out_dir)
    captions.update(ts_captions)
    generated.extend(ts_generated)

    if ablation_dir is not None:
        ablation_dir = Path(ablation_dir)
        ab_path = ablation_dir / "ablation_summary.csv"
        if ab_path.exists():
            ab_df = pd.read_csv(ab_path)
            _waterfall_chart(
                ab_df, "total_facility_energy_kwh", "Facility energy (kWh)", out_dir / "ablation_energy_waterfall.png"
            )
            captions["ablation_energy_waterfall.png"] = (
                f"{CAPTION_PREFIX} Facility energy by ablation stage (policy-by-policy staging under one "
                f"reference scenario), relative to the previous stage. Source: {ab_path}."
            )
            generated.append("ablation_energy_waterfall.png")

            _waterfall_chart(
                ab_df, "total_carbon_kgco2e", "Carbon (kgCO2e)", out_dir / "ablation_carbon_waterfall.png"
            )
            captions["ablation_carbon_waterfall.png"] = (
                f"{CAPTION_PREFIX} Carbon by ablation stage, relative to the previous stage. Source: {ab_path}."
            )
            generated.append("ablation_carbon_waterfall.png")

    if sensitivity_dir is not None:
        sensitivity_dir = Path(sensitivity_dir)
        sens_path = sensitivity_dir / "sensitivity_summary.csv"
        if sens_path.exists():
            sens_df = pd.read_csv(sens_path)
            _sensitivity_heatmap(
                sens_df, "delta_energy_vs_baseline_pct", out_dir / "sensitivity_energy_heatmap.png",
                "Facility energy Δ% vs baseline_first_fit (integrated_coordination)",
            )
            captions["sensitivity_energy_heatmap.png"] = (
                f"{CAPTION_PREFIX} integrated_coordination's facility energy percent change relative to "
                f"baseline_first_fit, under a one-factor-at-a-time sweep. Source: {sens_path}."
            )
            generated.append("sensitivity_energy_heatmap.png")

            _sensitivity_heatmap(
                sens_df, "delta_carbon_vs_baseline_pct", out_dir / "sensitivity_carbon_heatmap.png",
                "Carbon Δ% vs baseline_first_fit (integrated_coordination)",
            )
            captions["sensitivity_carbon_heatmap.png"] = (
                f"{CAPTION_PREFIX} integrated_coordination's carbon percent change relative to "
                f"baseline_first_fit, under a one-factor-at-a-time sweep. Source: {sens_path}."
            )
            generated.append("sensitivity_carbon_heatmap.png")

    _write_captions(out_dir / "captions.md", captions)

    return {"out_dir": str(out_dir), "generated": generated}


def _grouped_bar_chart(df: pd.DataFrame, metric: str, ylabel: str, out_path: Path) -> None:
    pivot = df.pivot_table(index="policy_name", columns="scenario", values=metric, aggfunc="mean")
    fig, ax = plt.subplots(figsize=(10, 5))
    pivot.plot(kind="bar", ax=ax)
    ax.set_ylabel(ylabel)
    ax.set_xlabel("policy")
    ax.set_title(f"{ylabel} by policy (simulated)")
    ax.legend(title="scenario", fontsize="small")
    plt.xticks(rotation=30, ha="right")
    fig.tight_layout()
    fig.savefig(out_path, dpi=120)
    plt.close(fig)


def _waterfall_chart(df: pd.DataFrame, metric: str, ylabel: str, out_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(9, 5))
    colors = ["#4c72b0" if i == 0 else ("#55a868" if v <= df[metric].iloc[0] else "#c44e52") for i, v in enumerate(df[metric])]
    ax.bar(df["stage"], df[metric], color=colors)
    ax.set_ylabel(ylabel)
    ax.set_title(f"{ylabel} by ablation stage (simulated)")
    plt.xticks(rotation=30, ha="right")
    fig.tight_layout()
    fig.savefig(out_path, dpi=120)
    plt.close(fig)


def _sensitivity_heatmap(df: pd.DataFrame, metric: str, out_path: Path, title: str) -> None:
    sub = df[df["policy_name"] == "integrated_coordination"]
    pivot = sub.pivot_table(index="variable", columns="value", values=metric, aggfunc="mean")
    fig, ax = plt.subplots(figsize=(8, 4.5))
    im = ax.imshow(pivot.to_numpy(), cmap="RdYlGn_r", aspect="auto")
    ax.set_xticks(range(len(pivot.columns)))
    ax.set_xticklabels([str(c) for c in pivot.columns])
    ax.set_yticks(range(len(pivot.index)))
    ax.set_yticklabels(list(pivot.index))
    for i in range(pivot.shape[0]):
        for j in range(pivot.shape[1]):
            value = pivot.to_numpy()[i, j]
            if pd.notna(value):
                ax.text(j, i, f"{value:.1f}", ha="center", va="center", fontsize=8)
    fig.colorbar(im, ax=ax, label="% change vs baseline")
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(out_path, dpi=120)
    plt.close(fig)


def _find_run(results_dir: Path, scenario: str, policy: str) -> Optional[Path]:
    scenario_dir = results_dir / "runs" / scenario
    if not scenario_dir.exists():
        return None
    for seed_dir in sorted(scenario_dir.iterdir()):
        candidate = seed_dir / policy / "timeseries_metrics.csv"
        if candidate.exists():
            return candidate
    return None


def _timeseries_figures(results_dir: Path, out_dir: Path) -> tuple[dict[str, str], list[str]]:
    captions: dict[str, str] = {}
    generated: list[str] = []
    runs_dir = results_dir / "runs"
    if not runs_dir.exists():
        return captions, generated

    scenarios = sorted(p.name for p in runs_dir.iterdir() if p.is_dir())
    if not scenarios:
        return captions, generated

    default_scenario = scenarios[0]
    baseline_path = _find_run(results_dir, default_scenario, "baseline_first_fit")
    integrated_path = _find_run(results_dir, default_scenario, "integrated_coordination")
    if baseline_path is not None and integrated_path is not None:
        _power_timeseries_chart(baseline_path, integrated_path, out_dir / "power_timeseries_baseline_vs_integrated.png")
        captions["power_timeseries_baseline_vs_integrated.png"] = (
            f"{CAPTION_PREFIX} Facility power over time, baseline_first_fit vs integrated_coordination, "
            f"scenario `{default_scenario}`. Source: {baseline_path.parent}, {integrated_path.parent}."
        )
        generated.append("power_timeseries_baseline_vs_integrated.png")

        _carbon_vs_load_chart(baseline_path, out_dir / "carbon_intensity_vs_load_timeseries.png")
        captions["carbon_intensity_vs_load_timeseries.png"] = (
            f"{CAPTION_PREFIX} Carbon intensity and running-job count over time under baseline_first_fit, "
            f"scenario `{default_scenario}`. Source: {baseline_path.parent}."
        )
        generated.append("carbon_intensity_vs_load_timeseries.png")

    thermal_scenario = "thermal_stress" if "thermal_stress" in scenarios else default_scenario
    thermal_baseline = _find_run(results_dir, thermal_scenario, "baseline_first_fit")
    thermal_aware_path = _find_run(results_dir, thermal_scenario, "thermal_aware")
    if thermal_baseline is not None and thermal_aware_path is not None:
        _rack_temp_chart(thermal_baseline, thermal_aware_path, out_dir / "rack_temperature_timeseries.png")
        captions["rack_temperature_timeseries.png"] = (
            f"{CAPTION_PREFIX} Max rack temperature over time, baseline_first_fit vs thermal_aware, scenario "
            f"`{thermal_scenario}`. Rack temperature here is a reduced-order proxy, not a CFD prediction "
            f"(docs/model_assumptions.md). Source: {thermal_baseline.parent}, {thermal_aware_path.parent}."
        )
        generated.append("rack_temperature_timeseries.png")

    return captions, generated


def _load_site_summed(path: Path, value_col: str) -> pd.Series:
    df = pd.read_csv(path)
    grouped = df.groupby("timestamp")[value_col].sum()
    grouped.index = pd.to_datetime(grouped.index)
    return grouped.sort_index()


def _power_timeseries_chart(baseline_path: Path, integrated_path: Path, out_path: Path) -> None:
    baseline = _load_site_summed(baseline_path, "facility_power_kw")
    integrated = _load_site_summed(integrated_path, "facility_power_kw")
    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(baseline.index, baseline.to_numpy(), label="baseline_first_fit")
    ax.plot(integrated.index, integrated.to_numpy(), label="integrated_coordination")
    ax.set_xlabel("time")
    ax.set_ylabel("facility power (kW, summed across sites)")
    ax.set_title("Facility power over time (simulated)")
    ax.legend()
    fig.tight_layout()
    fig.savefig(out_path, dpi=120)
    plt.close(fig)


def _carbon_vs_load_chart(baseline_path: Path, out_path: Path) -> None:
    df = pd.read_csv(baseline_path)
    grouped = df.groupby("timestamp").agg(
        carbon_intensity_gco2e_per_kwh=("carbon_intensity_gco2e_per_kwh", "mean"),
        running_jobs=("running_jobs", "sum"),
    )
    grouped.index = pd.to_datetime(grouped.index)
    grouped = grouped.sort_index()

    fig, ax1 = plt.subplots(figsize=(10, 4))
    ax1.plot(grouped.index, grouped["carbon_intensity_gco2e_per_kwh"], color="#c44e52", label="carbon intensity")
    ax1.set_ylabel("carbon intensity (gCO2e/kWh, avg across sites)", color="#c44e52")
    ax1.set_xlabel("time")

    ax2 = ax1.twinx()
    ax2.plot(grouped.index, grouped["running_jobs"], color="#4c72b0", label="running jobs")
    ax2.set_ylabel("running jobs (fleet-wide)", color="#4c72b0")

    ax1.set_title("Carbon intensity vs. running-job count over time (simulated)")
    fig.tight_layout()
    fig.savefig(out_path, dpi=120)
    plt.close(fig)


def _rack_temp_chart(baseline_path: Path, thermal_aware_path: Path, out_path: Path) -> None:
    baseline = pd.read_csv(baseline_path).groupby("timestamp")["max_rack_temp_c"].max()
    thermal_aware = pd.read_csv(thermal_aware_path).groupby("timestamp")["max_rack_temp_c"].max()
    baseline.index = pd.to_datetime(baseline.index)
    thermal_aware.index = pd.to_datetime(thermal_aware.index)

    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(baseline.sort_index().index, baseline.sort_index().to_numpy(), label="baseline_first_fit")
    ax.plot(
        thermal_aware.sort_index().index, thermal_aware.sort_index().to_numpy(), label="thermal_aware"
    )
    ax.axhline(32.0, color="orange", linestyle="--", linewidth=1, label="hot threshold (32C)")
    ax.set_xlabel("time")
    ax.set_ylabel("max rack temperature (C, reduced-order proxy)")
    ax.set_title("Rack temperature over time (simulated)")
    ax.legend()
    fig.tight_layout()
    fig.savefig(out_path, dpi=120)
    plt.close(fig)


def _write_captions(path: Path, captions: dict[str, str]) -> None:
    lines = [
        "# Figure captions",
        "",
        "All figures are simulated output from helicyn-sim under the documented modeling "
        "assumptions in docs/model_assumptions.md. Treat every number as scenario-relative "
        "simulation output only, not as a claim about any real deployment -- see docs/limitations.md.",
        "",
    ]
    for filename, caption in captions.items():
        lines.append(f"## {filename}")
        lines.append("")
        lines.append(caption)
        lines.append("")
    path.write_text("\n".join(lines))

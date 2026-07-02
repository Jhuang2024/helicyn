"""`sensitivity`: one-factor-at-a-time sensitivity sweep. For each of the
five variables in configs/sensitivity.yaml, run baseline_first_fit and
integrated_coordination (+ external_helicyn if reachable) under the base
scenario with just that one variable changed, holding everything else at
its base value. Goal: show where coordinated control helps and where it
does not (see docs/results_interpretation.md), not to find an optimum.
"""
from __future__ import annotations

from pathlib import Path
from typing import Callable, Optional

import pandas as pd

from helicyn_sim.config import Config, load_sensitivity_config
from helicyn_sim.models.grid import CARBON_PROFILES
from helicyn_sim.policies import get_policy
from helicyn_sim.policies.external_helicyn import (
    DEFAULT_TIMEOUT_SECONDS,
    ExternalHelicynPolicy,
    ExternalHelicynUnavailableError,
)
from helicyn_sim.simulation.engine import run_and_write

SENSITIVITY_POLICIES = ["baseline_first_fit", "integrated_coordination"]
BASELINE_POLICY_NAME = "baseline_first_fit"

_ARRIVAL_RATE_FIELDS = [
    "llm_inference_jobs_per_hour_peak",
    "llm_inference_jobs_per_hour_offpeak",
    "batch_jobs_per_hour_day",
    "batch_jobs_per_hour_night",
    "online_service_jobs_per_hour",
    "maintenance_jobs_per_day",
]

_DEADLINE_TIGHTNESS_PRESETS = {
    "loose": dict(max_delay_minutes_flexible=240.0, latency_sensitive_deadline_slack_minutes=30.0),
    "normal": dict(max_delay_minutes_flexible=120.0, latency_sensitive_deadline_slack_minutes=15.0),
    "tight": dict(max_delay_minutes_flexible=45.0, latency_sensitive_deadline_slack_minutes=5.0),
}

# "medium" carbon variability keeps the base config's own site profiles;
# "low"/"high" force every site to a low/high-amplitude carbon profile,
# regardless of what the base config had configured.
_CARBON_VARIABILITY_PROFILE = {
    "low": "flat_grid",
    "high": "solar_duck_curve",
}


def _apply_load_multiplier(config: Config, value: float) -> Config:
    config = config.model_copy(deep=True)
    for field_name in _ARRIVAL_RATE_FIELDS:
        setattr(config.workload, field_name, getattr(config.workload, field_name) * value)
    return config


def _apply_carbon_variability(config: Config, value: str) -> Config:
    config = config.model_copy(deep=True)
    if value == "medium":
        return config
    profile = _CARBON_VARIABILITY_PROFILE[value]
    assert profile in CARBON_PROFILES
    for site in config.fleet.sites:
        site.carbon_profile = profile
    return config


def _apply_ambient_temperature_offset_c(config: Config, value: float) -> Config:
    config = config.model_copy(deep=True)
    for site in config.fleet.sites:
        site.ambient_temp_offset_c = value
    return config


def _apply_deadline_tightness(config: Config, value: str) -> Config:
    config = config.model_copy(deep=True)
    preset = _DEADLINE_TIGHTNESS_PRESETS[value]
    config.workload.max_delay_minutes_flexible = preset["max_delay_minutes_flexible"]
    config.workload.latency_sensitive_deadline_slack_minutes = preset["latency_sensitive_deadline_slack_minutes"]
    return config


def _apply_server_idle_power_w(config: Config, value: float) -> Config:
    config = config.model_copy(deep=True)
    config.fleet.server_profile.idle_power_w = value
    return config


VARIABLE_APPLIERS: dict[str, Callable[[Config, object], Config]] = {
    "load_multiplier": _apply_load_multiplier,
    "carbon_variability": _apply_carbon_variability,
    "ambient_temperature_offset_c": _apply_ambient_temperature_offset_c,
    "deadline_tightness": _apply_deadline_tightness,
    "server_idle_power_w": _apply_server_idle_power_w,
}


def run_sensitivity(
    config_path: str | Path,
    out_dir: str | Path,
    quick: bool = False,
    resource_trace_path: Optional[str] = None,
    helicyn_url: Optional[str] = None,
    helicyn_timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict:
    sensitivity_config = load_sensitivity_config(config_path)
    variables = sensitivity_config.quick_variables if (quick and sensitivity_config.quick_variables) else sensitivity_config.variables
    seeds = sensitivity_config.seeds[:1] if quick else sensitivity_config.seeds

    policy_names = list(SENSITIVITY_POLICIES)
    external_status = "not_requested"
    if helicyn_url:
        probe = ExternalHelicynPolicy(url=helicyn_url, timeout_seconds=helicyn_timeout)
        try:
            probe.check_available()
            policy_names = policy_names + ["external_helicyn"]
            external_status = "included"
        except ExternalHelicynUnavailableError as exc:
            external_status = f"skipped: {exc}"

    out_dir = Path(out_dir)
    runs_dir = out_dir / "runs"

    rows: list[dict] = []
    for variable_name, values in variables.items():
        applier = VARIABLE_APPLIERS[variable_name]
        for value in values:
            per_policy_means: dict[str, dict] = {}
            for policy_name in policy_names:
                per_seed_summaries = []
                for seed in seeds:
                    config = applier(sensitivity_config.base, value)
                    config.simulation.seed = seed
                    policy = (
                        ExternalHelicynPolicy(url=helicyn_url, timeout_seconds=helicyn_timeout)
                        if policy_name == "external_helicyn"
                        else get_policy(policy_name)
                    )
                    run_out = runs_dir / variable_name / str(value) / str(seed) / policy_name
                    summary = run_and_write(config, policy, run_out, resource_trace_path=resource_trace_path)
                    per_seed_summaries.append(summary)

                mean = {
                    key: sum(s[key] for s in per_seed_summaries) / len(per_seed_summaries)
                    for key in (
                        "total_facility_energy_kwh",
                        "total_carbon_kgco2e",
                        "total_cost_usd",
                        "deadline_misses",
                        "thermal_violations",
                        "average_cpu_utilization",
                    )
                }
                per_policy_means[policy_name] = mean

            baseline_mean = per_policy_means[BASELINE_POLICY_NAME]
            for policy_name, mean in per_policy_means.items():

                def pct_delta(key: str) -> Optional[float]:
                    b = baseline_mean[key]
                    return (mean[key] - b) / b * 100.0 if b else None

                rows.append(
                    {
                        "variable": variable_name,
                        "value": value,
                        "policy_name": policy_name,
                        **mean,
                        "delta_energy_vs_baseline_pct": pct_delta("total_facility_energy_kwh"),
                        "delta_carbon_vs_baseline_pct": pct_delta("total_carbon_kgco2e"),
                        "delta_cost_vs_baseline_pct": pct_delta("total_cost_usd"),
                        "delta_deadline_misses_vs_baseline": mean["deadline_misses"]
                        - baseline_mean["deadline_misses"],
                    }
                )

    df = pd.DataFrame(rows)
    out_dir.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_dir / "sensitivity_summary.csv", index=False)
    _write_report(df, out_dir / "sensitivity_report.md", variables, seeds, external_status)

    return {
        "out_dir": str(out_dir),
        "variables": list(variables.keys()),
        "seeds": seeds,
        "policies": policy_names,
        "external_status": external_status,
        "rows": rows,
    }


def _write_report(df: pd.DataFrame, path: Path, variables: dict, seeds: list[int], external_status: str) -> None:
    lines = [
        "# Sensitivity analysis report",
        "",
        "**Simulated, under this simulator's documented modeling assumptions "
        "(docs/model_assumptions.md). Not a production measurement.**",
        "",
        f"One-factor-at-a-time sweep: each row changes exactly one variable from the base "
        f"scenario (configs/sensitivity.yaml), holding everything else fixed. Seeds averaged: {seeds}. "
        f"External Helicyn: {external_status}.",
        "",
        "Goal: show where `integrated_coordination` helps relative to `baseline_first_fit`, and "
        "where it does not -- not to find an optimal configuration.",
        "",
    ]

    for variable_name in variables:
        sub = df[df["variable"] == variable_name]
        lines.append(f"## {variable_name}")
        lines.append("")
        lines.append("| value | policy | facility energy Δ% | carbon Δ% | deadline misses Δ |")
        lines.append("|---|---|---:|---:|---:|")
        for _, row in sub.iterrows():
            e = row["delta_energy_vs_baseline_pct"]
            c = row["delta_carbon_vs_baseline_pct"]
            d = row["delta_deadline_misses_vs_baseline"]
            e_str = "n/a" if pd.isna(e) else f"{e:+.1f}%"
            c_str = "n/a" if pd.isna(c) else f"{c:+.1f}%"
            lines.append(f"| {row['value']} | {row['policy_name']} | {e_str} | {c_str} | {d:+.1f} |")
        lines.append("")

    lines.append("See docs/limitations.md and docs/results_interpretation.md before drawing any conclusion.")
    path.write_text("\n".join(lines))

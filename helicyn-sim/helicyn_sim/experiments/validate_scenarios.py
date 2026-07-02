"""`validate-scenarios`: a quick, honest sanity check for a research
scenario matrix, run under baseline_first_fit before spending time on a
full research-run. Reports actual utilization/deadline-miss/thermal
numbers and flags scenarios that don't look calibrated for what their name
claims -- it does not auto-tune anything (see module docstring in
configs/research_matrix.yaml for why fleet size/rates were hand-picked).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from helicyn_sim.config import ResearchConfig, ScenarioSpec, load_research_config, resolve_scenario_config
from helicyn_sim.models.grid import CARBON_PROFILES, PRICE_PROFILES
from helicyn_sim.models.thermal import WARM_THRESHOLD_C
from helicyn_sim.policies import get_policy
from helicyn_sim.simulation.engine import run_simulation

LOW_UTILIZATION_WARNING_THRESHOLD = 0.15
HIGH_UTILIZATION_WARNING_THRESHOLD = 0.90
OVERLOADED_REJECTED_FRACTION_THRESHOLD = 0.10
LOW_FLEXIBLE_JOB_FRACTION_THRESHOLD = 0.05
CARBON_VARIATION_THRESHOLD_GCO2E = 20.0
PRICE_VARIATION_THRESHOLD_USD = 10.0


@dataclass
class ScenarioValidationResult:
    scenario_name: str
    average_cpu_utilization: float
    average_memory_utilization: float
    total_jobs: int
    completed_jobs: int
    rejected_jobs: int
    deadline_misses: int
    peak_facility_power_kw: float
    thermal_violations: int
    max_rack_temp_c: float
    flexible_job_fraction: float
    warnings: list[str] = field(default_factory=list)


def _carbon_profile_amplitude(profile_name: str) -> float:
    p = CARBON_PROFILES[profile_name]
    return p["midday_dip"] + p["evening_peak"]


def _price_profile_amplitude(profile_name: str) -> float:
    p = PRICE_PROFILES[profile_name]
    return p["midday_dip"] + p["evening_peak"]


def validate_scenario(research_config: ResearchConfig, scenario: ScenarioSpec) -> ScenarioValidationResult:
    config = resolve_scenario_config(research_config, scenario)
    policy = get_policy("baseline_first_fit")
    state, recorder, accs = run_simulation(config, policy)
    summary = recorder.finalize(state, accs)

    flexible_types = {"batch", "maintenance"}
    flexible_jobs = sum(1 for j in state.all_jobs.values() if j.workload_type.value in flexible_types)
    flexible_fraction = flexible_jobs / summary["total_jobs"] if summary["total_jobs"] else 0.0

    warnings: list[str] = []

    if summary["average_cpu_utilization"] < LOW_UTILIZATION_WARNING_THRESHOLD:
        warnings.append(
            f"fleet too oversized: average CPU utilization only "
            f"{summary['average_cpu_utilization'] * 100:.1f}% -- consider a smaller fleet or higher arrival rates"
        )
    if summary["average_cpu_utilization"] > HIGH_UTILIZATION_WARNING_THRESHOLD:
        warnings.append(
            f"fleet overloaded: average CPU utilization {summary['average_cpu_utilization'] * 100:.1f}% "
            "-- results may mostly reflect capacity collapse, not policy differences"
        )
    rejected_fraction = summary["rejected_jobs"] / summary["total_jobs"] if summary["total_jobs"] else 0.0
    if rejected_fraction > OVERLOADED_REJECTED_FRACTION_THRESHOLD:
        warnings.append(
            f"fleet overloaded: {rejected_fraction * 100:.1f}% of jobs rejected under baseline_first_fit"
        )

    carbon_profiles = {site.carbon_profile for site in config.fleet.sites}
    max_carbon_amplitude = max(_carbon_profile_amplitude(p) for p in carbon_profiles)
    if len(carbon_profiles) == 1 and max_carbon_amplitude < CARBON_VARIATION_THRESHOLD_GCO2E:
        warnings.append(
            "no carbon variation: every site uses the same low-amplitude carbon profile "
            f"({sorted(carbon_profiles)}) -- carbon-aware policies have little to react to"
        )

    price_profiles = {site.price_profile for site in config.fleet.sites}
    max_price_amplitude = max(_price_profile_amplitude(p) for p in price_profiles)
    if len(price_profiles) == 1 and max_price_amplitude < PRICE_VARIATION_THRESHOLD_USD:
        warnings.append(
            "no meaningful price variation: every site uses the same low-amplitude price profile "
            f"({sorted(price_profiles)}) -- price-aware policies have little to react to"
        )

    if flexible_fraction < LOW_FLEXIBLE_JOB_FRACTION_THRESHOLD:
        warnings.append(
            f"no flexible jobs: only {flexible_fraction * 100:.1f}% of jobs are carbon/price-flexible "
            "(batch/maintenance) -- carbon/price-aware and integrated policies have almost nothing to delay"
        )

    if summary["max_rack_temp_c"] < WARM_THRESHOLD_C:
        warnings.append(
            f"no thermal stress: max rack temperature ({summary['max_rack_temp_c']:.1f}C) never reached the "
            f"warm threshold ({WARM_THRESHOLD_C}C) -- thermal-aware policies have nothing to avoid"
        )

    return ScenarioValidationResult(
        scenario_name=scenario.name,
        average_cpu_utilization=summary["average_cpu_utilization"],
        average_memory_utilization=summary["average_memory_utilization"],
        total_jobs=summary["total_jobs"],
        completed_jobs=summary["completed_jobs"],
        rejected_jobs=summary["rejected_jobs"],
        deadline_misses=summary["deadline_misses"],
        peak_facility_power_kw=summary["peak_facility_power_kw"],
        thermal_violations=summary["thermal_violations"],
        max_rack_temp_c=summary["max_rack_temp_c"],
        flexible_job_fraction=flexible_fraction,
        warnings=warnings,
    )


def validate_scenarios(config_path: str | Path) -> list[ScenarioValidationResult]:
    research_config = load_research_config(config_path)
    return [validate_scenario(research_config, scenario) for scenario in research_config.scenarios]

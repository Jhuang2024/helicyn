"""Config loading. YAML -> validated pydantic Config. `resolve_config` fills
every default explicitly so the exact parameters of a run can be written to
`config_resolved.yaml` in the run's output directory for reproducibility.
"""
from __future__ import annotations

from pathlib import Path
from typing import List, Optional

import yaml
from pydantic import BaseModel, ConfigDict, Field


class ServerProfileConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cpu_capacity_units: float = 100.0
    memory_capacity_gb: float = 512.0
    gpu_capacity_units: float = 0.0  # scaffold only, see docs/model_assumptions.md
    idle_power_w: float = 180.0
    max_cpu_dynamic_power_w: float = 470.0
    fan_overhead_w: float = 40.0
    sleep_power_w: float = 15.0


class SiteConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    site_id: str
    region: str
    racks: int = Field(gt=0)
    servers_per_rack: int = Field(gt=0)
    base_pue: float = 1.3
    cooling_reference_temp_c: float = 20.0
    carbon_profile: str = "mixed_grid"
    price_profile: str = "moderate_price"
    weather_profile: str = "cool_weather"
    ambient_temp_coefficient: float = 0.008
    ambient_temp_offset_c: float = 0.0


class FleetConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sites: List[SiteConfig]
    server_profile: ServerProfileConfig = Field(default_factory=ServerProfileConfig)


class SimulationConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timestep_minutes: float = 5.0
    duration_hours: float = 24.0
    seed: int = 42


class WorkloadConfig(BaseModel):
    """Parameters for the synthetic job generator (traces/synthetic.py).
    Rates are jobs/hour arriving fleet-wide; see traces/synthetic.py for how
    burstiness and day/night mixing are applied on top of these rates.
    """

    model_config = ConfigDict(extra="forbid")

    llm_inference_jobs_per_hour_peak: float = 40.0
    llm_inference_jobs_per_hour_offpeak: float = 8.0
    batch_jobs_per_hour_day: float = 3.0
    batch_jobs_per_hour_night: float = 10.0
    online_service_jobs_per_hour: float = 15.0
    maintenance_jobs_per_day: float = 2.0

    cpu_demand_min_units: float = 2.0
    cpu_demand_max_units: float = 20.0
    memory_demand_min_gb: float = 2.0
    memory_demand_max_gb: float = 32.0

    llm_work_units_min: float = 1.0
    llm_work_units_max: float = 8.0
    batch_work_units_min: float = 20.0
    batch_work_units_max: float = 180.0
    online_work_units_min: float = 5.0
    online_work_units_max: float = 60.0
    maintenance_work_units_min: float = 30.0
    maintenance_work_units_max: float = 90.0

    max_delay_minutes_flexible: float = 120.0
    latency_sensitive_deadline_slack_minutes: float = 15.0

    resource_trace_path: Optional[str] = None


class PolicyConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = "baseline_first_fit"
    dvfs_state: str = "balanced"


class Config(BaseModel):
    model_config = ConfigDict(extra="forbid")

    simulation: SimulationConfig = Field(default_factory=SimulationConfig)
    fleet: FleetConfig
    workload: WorkloadConfig = Field(default_factory=WorkloadConfig)
    policy: PolicyConfig = Field(default_factory=PolicyConfig)
    memory_power_coefficient_w: float = 60.0


def load_config(path: str | Path) -> Config:
    path = Path(path)
    with path.open("r") as f:
        raw = yaml.safe_load(f)
    return Config.model_validate(raw)


def write_resolved_config(config: Config, out_path: str | Path) -> None:
    out_path = Path(out_path)
    with out_path.open("w") as f:
        yaml.safe_dump(config.model_dump(mode="json"), f, sort_keys=False)


# ---------------------------------------------------------------------------
# Phase 3: research/scenario configs. A single YAML file describes a `base`
# Config plus a list of named `scenarios`, each a partial dict of overrides
# deep-merged onto `base` before being re-validated as a full Config. This
# keeps configs/research_matrix.yaml (six scenarios) from having to repeat
# the entire fleet/workload block six times -- most scenarios only touch a
# handful of fields.
# ---------------------------------------------------------------------------


class ScenarioSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: str = ""
    overrides: dict = Field(default_factory=dict)


class ResearchConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base: Config
    seeds: List[int] = Field(default_factory=lambda: [42])
    scenarios: List[ScenarioSpec] = Field(default_factory=list)


def _deep_merge(base: dict, overrides: dict) -> dict:
    result = dict(base)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def resolve_scenario_config(research_config: ResearchConfig, scenario: ScenarioSpec) -> Config:
    base_dict = research_config.base.model_dump(mode="json")
    merged = _deep_merge(base_dict, scenario.overrides)
    return Config.model_validate(merged)


def load_research_config(path: str | Path) -> ResearchConfig:
    path = Path(path)
    with path.open("r") as f:
        raw = yaml.safe_load(f)
    return ResearchConfig.model_validate(raw)


class SensitivityFileConfig(BaseModel):
    """configs/sensitivity.yaml's shape: a base Config plus named sweep
    variables (see helicyn_sim/experiments/sensitivity.py for how each
    variable name maps onto actual Config field mutations -- unlike
    ResearchConfig's scenarios, these aren't generic dict overrides,
    because e.g. "load_multiplier: 1.3" means "scale every arrival-rate
    field," not a literal field path.
    """

    model_config = ConfigDict(extra="forbid")

    base: Config
    seeds: List[int] = Field(default_factory=lambda: [42])
    variables: dict = Field(default_factory=dict)
    quick_variables: dict = Field(default_factory=dict)


def load_sensitivity_config(path: str | Path) -> SensitivityFileConfig:
    path = Path(path)
    with path.open("r") as f:
        raw = yaml.safe_load(f)
    return SensitivityFileConfig.model_validate(raw)

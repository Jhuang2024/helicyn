"""Builds the numeric/categorical feature dict for one (job, candidate
action, fleet state, model predictions) tuple. Shared by:
  * training/train_policy_ranker.py (to build the imitation-learning
    training table, alongside heuristic_teacher.teacher_score as the label)
  * policies/helicyn_policy.py (at inference time, feeding the same
    features into either the trained PolicyRanker or the heuristic teacher
    fallback)

Normalization constants (CARBON_NORMALIZATION_CEILING_GCO2E_PER_KWH etc.)
are engineering assumptions for putting heterogeneous units on a roughly
[0, 1] scale for the heuristic teacher - they are not measured constants.
"""
from __future__ import annotations

from typing import Dict, Optional

from helicyn_ml.schemas import CandidateAction, FleetState, QueuedJob

CARBON_NORMALIZATION_CEILING_GCO2E_PER_KWH = 700.0
PRICE_NORMALIZATION_CEILING_USD_PER_MWH = 200.0
THERMAL_COMFORT_FLOOR_C = 15.0
THERMAL_NORMALIZATION_RANGE_C = 25.0


def _fleet_utilization(fleet_state: FleetState) -> Dict[str, float]:
    servers = [s for s in fleet_state.servers if not s.asleep]
    total_cpu = sum(s.cpu_capacity for s in servers) or 1.0
    total_gpu = sum(s.gpu_capacity for s in servers) or 1.0
    total_mem = sum(s.memory_capacity_gb for s in servers) or 1.0
    used_cpu = sum(s.cpu_used for s in servers)
    used_gpu = sum(s.gpu_used for s in servers)
    used_mem = sum(s.memory_used_gb for s in servers)
    return {
        "current_cpu_utilization": used_cpu / total_cpu,
        "current_gpu_utilization": used_gpu / total_gpu,
        "current_memory_utilization": used_mem / total_mem,
    }


def _site_remaining(fleet_state: FleetState, site_id: Optional[str]):
    if site_id is None:
        return 0.0, 0.0, 0.0
    rack_ids = {r.rack_id for r in fleet_state.racks if r.site_id == site_id}
    servers = [s for s in fleet_state.servers if s.rack_id in rack_ids and not s.asleep]
    remaining_cpu = sum(max(s.cpu_capacity - s.cpu_used, 0) for s in servers)
    remaining_gpu = sum(max(s.gpu_capacity - s.gpu_used, 0) for s in servers)
    remaining_mem = sum(max(s.memory_capacity_gb - s.memory_used_gb, 0) for s in servers)
    return remaining_cpu, remaining_gpu, remaining_mem


def _grid_signal_for_site(fleet_state: FleetState, site_id: Optional[str]):
    site = next((s for s in fleet_state.sites if s.site_id == site_id), None)
    region = site.region if site else None
    signal = next((g for g in fleet_state.grid_signals if g.region == region), None)
    if signal is None and fleet_state.grid_signals:
        signal = fleet_state.grid_signals[0]
    return signal


def _weather_signal_for_site(fleet_state: FleetState, site_id: Optional[str]):
    site = next((s for s in fleet_state.sites if s.site_id == site_id), None)
    region = site.region if site else None
    signal = next((w for w in fleet_state.weather_signals if w.region == region), None)
    if signal is None and fleet_state.weather_signals:
        signal = fleet_state.weather_signals[0]
    return signal


def compute_action_features(
    job: Optional[QueuedJob],
    action: CandidateAction,
    fleet_state: FleetState,
    predicted_runtime_seconds: float,
    predicted_resource_usage: float,
    predicted_sla_risk: float,
    predicted_power_delta_kw: float,
    predicted_future_demand: float = 0.0,
) -> Dict[str, object]:
    util = _fleet_utilization(fleet_state)
    remaining_cpu, remaining_gpu, remaining_mem = _site_remaining(fleet_state, action.target_site_id)
    grid = _grid_signal_for_site(fleet_state, action.target_site_id)
    weather = _weather_signal_for_site(fleet_state, action.target_site_id)

    carbon = grid.carbon_intensity_gco2e_per_kwh if grid and grid.carbon_intensity_gco2e_per_kwh is not None else 0.0
    price = grid.electricity_price_usd_per_mwh if grid and grid.electricity_price_usd_per_mwh is not None else 0.0
    ambient = weather.ambient_temp_c if weather else 20.0

    delay_minutes = action.delay_minutes or 0.0

    if job is not None and job.deadline is not None:
        slack = (job.deadline - fleet_state.timestamp).total_seconds() - predicted_runtime_seconds - delay_minutes * 60
    else:
        slack = 3600.0 - delay_minutes * 60

    thermal_proxy = max(0.0, min(1.0, (ambient - THERMAL_COMFORT_FLOOR_C) / THERMAL_NORMALIZATION_RANGE_C))

    total_remaining = remaining_cpu + remaining_gpu * 8 + 1e-6
    fragmentation = abs((remaining_cpu / total_remaining) - (remaining_gpu * 8 / total_remaining)) if total_remaining > 0 else 0.0
    consolidation = util["current_cpu_utilization"]

    workload_type = job.workload_type.value if job is not None else "unknown"

    return {
        "current_cpu_utilization": util["current_cpu_utilization"],
        "current_gpu_utilization": util["current_gpu_utilization"],
        "current_memory_utilization": util["current_memory_utilization"],
        "candidate_remaining_cpu": remaining_cpu,
        "candidate_remaining_gpu": remaining_gpu,
        "candidate_remaining_memory": remaining_mem,
        "candidate_carbon_intensity": carbon,
        "candidate_price": price,
        "candidate_ambient_temp_c": ambient,
        "predicted_future_demand": predicted_future_demand,
        "predicted_runtime_seconds": predicted_runtime_seconds,
        "predicted_resource_usage": predicted_resource_usage,
        "sla_slack_seconds": slack,
        "thermal_proxy_score": thermal_proxy,
        "fragmentation_score": fragmentation,
        "consolidation_score": consolidation,
        "delay_minutes": delay_minutes,
        "action_type": action.action_type.value,
        "workload_type": workload_type,
        # teacher-only normalized inputs:
        "sla_risk": predicted_sla_risk,
        "predicted_power_delta": predicted_power_delta_kw,
        "normalized_carbon_intensity": min(1.0, carbon / CARBON_NORMALIZATION_CEILING_GCO2E_PER_KWH),
        "normalized_price": min(1.0, max(0.0, price) / PRICE_NORMALIZATION_CEILING_USD_PER_MWH),
        "thermal_risk": thermal_proxy,
        "fragmentation": fragmentation,
        "delay_penalty": delay_minutes / 60.0,
        "useful_utilization": util["current_cpu_utilization"],
        "consolidation_benefit": consolidation,
    }

from __future__ import annotations

from typing import Optional, Tuple

from helicyn_ml.schemas import ActionType, CandidateAction, FleetState, QueuedJob

HIGH_SLA_RISK_THRESHOLD = 0.6


def _site_remaining_capacity(fleet_state: FleetState, site_id: str) -> Tuple[float, float, float]:
    rack_ids = {r.rack_id for r in fleet_state.racks if r.site_id == site_id}
    servers = [s for s in fleet_state.servers if s.rack_id in rack_ids]
    remaining_cpu = sum(max(s.cpu_capacity - s.cpu_used, 0) for s in servers if not s.asleep)
    remaining_gpu = sum(max(s.gpu_capacity - s.gpu_used, 0) for s in servers if not s.asleep)
    remaining_mem = sum(max(s.memory_capacity_gb - s.memory_used_gb, 0) for s in servers if not s.asleep)
    return remaining_cpu, remaining_gpu, remaining_mem


def check_constraints(
    action: CandidateAction,
    job: Optional[QueuedJob],
    fleet_state: FleetState,
    predicted_sla_risk: Optional[float] = None,
) -> Tuple[bool, Optional[str]]:
    """Returns (is_valid, rejection_reason). All checks are deterministic
    rule evaluations - no model is involved in accepting/rejecting.
    """
    if action.action_type == ActionType.PLACE:
        if action.target_site_id is None:
            return False, "place action missing target_site_id"
        if job is None:
            return False, "place action references unknown job"
        remaining_cpu, remaining_gpu, remaining_mem = _site_remaining_capacity(fleet_state, action.target_site_id)
        if (job.cpu_request or 0) > remaining_cpu:
            return False, "would exceed CPU capacity at target site"
        if (job.gpu_request or 0) > remaining_gpu:
            return False, "would exceed GPU capacity at target site"
        if (job.memory_request_gb or 0) > remaining_mem:
            return False, "would exceed memory capacity at target site"
        if job.site_affinity and action.target_site_id != job.site_affinity:
            return False, "violates job site affinity"

    if action.action_type == ActionType.DELAY:
        if job is None:
            return False, "delay action references unknown job"
        if job.latency_sensitive and not job.delayable:
            return False, "cannot delay a non-delayable latency-sensitive job"
        if job.max_delay_minutes is not None and (action.delay_minutes or 0) > job.max_delay_minutes:
            return False, "requested delay exceeds job's max_delay_minutes"

    if action.action_type == ActionType.CHANGE_DVFS:
        if action.dvfs_state == "power_saver" and predicted_sla_risk is not None and predicted_sla_risk > HIGH_SLA_RISK_THRESHOLD:
            return False, "power_saver DVFS rejected: predicted deadline-miss risk too high"

    if action.action_type == ActionType.SLEEP_SERVER:
        target = next((s for s in fleet_state.servers if s.server_id == action.target_server_id), None)
        if target is None:
            return False, "sleep_server target server not found"
        if target.running_job_ids:
            return False, "cannot sleep a server with running jobs"

    if action.action_type == ActionType.MIGRATE:
        if job is not None and not job.migratable:
            return False, "job is not migratable"
        running = next((r for r in fleet_state.running_jobs if r.job_id == action.job_id), None)
        if running is not None and not running.migratable:
            return False, "running job is not migratable"

    return True, None

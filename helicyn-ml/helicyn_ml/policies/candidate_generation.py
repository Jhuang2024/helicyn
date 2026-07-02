from __future__ import annotations

from typing import Dict, List, Optional

from helicyn_ml.schemas import ActionType, CandidateAction, FleetState, QueuedJob, Site

DVFS_STATES = ["high_performance", "balanced", "power_saver"]
DELAY_OPTIONS_MINUTES = [15.0, 30.0, 60.0]


def _site_capacity(fleet_state: FleetState, site: Site) -> Dict[str, float]:
    rack_ids = set(site.rack_ids)
    server_ids = {r.rack_id for r in fleet_state.racks if r.site_id == site.site_id}
    servers = [s for s in fleet_state.servers if s.rack_id in server_ids or s.rack_id in rack_ids]
    remaining_cpu = sum(max(s.cpu_capacity - s.cpu_used, 0) for s in servers if not s.asleep)
    remaining_gpu = sum(max(s.gpu_capacity - s.gpu_used, 0) for s in servers if not s.asleep)
    remaining_mem = sum(max(s.memory_capacity_gb - s.memory_used_gb, 0) for s in servers if not s.asleep)
    total_cpu = sum(s.cpu_capacity for s in servers) or 1.0
    total_gpu = sum(s.gpu_capacity for s in servers) or 1.0
    used_cpu = sum(s.cpu_used for s in servers)
    used_gpu = sum(s.gpu_used for s in servers)
    return {
        "remaining_cpu": remaining_cpu,
        "remaining_gpu": remaining_gpu,
        "remaining_memory": remaining_mem,
        "utilization_cpu": used_cpu / total_cpu,
        "utilization_gpu": used_gpu / total_gpu,
        "n_servers": len(servers),
    }


def rank_sites_by_fit(fleet_state: FleetState, job: QueuedJob, top_n: int = 2) -> List[Site]:
    scored = []
    for site in fleet_state.sites:
        cap = _site_capacity(fleet_state, site)
        cpu_ok = cap["remaining_cpu"] >= (job.cpu_request or 0)
        gpu_ok = cap["remaining_gpu"] >= (job.gpu_request or 0)
        mem_ok = cap["remaining_memory"] >= (job.memory_request_gb or 0)
        fits = cpu_ok and gpu_ok and mem_ok
        if job.site_affinity and site.site_id != job.site_affinity:
            continue
        scored.append((fits, cap["remaining_cpu"] + cap["remaining_gpu"] * 10, site))
    scored.sort(key=lambda t: (not t[0], -t[1]))
    return [s for _, _, s in scored[:top_n]] if scored else []


def generate_candidates(job: QueuedJob, fleet_state: FleetState) -> List[CandidateAction]:
    """The eight candidate actions described in the model design doc: place
    now at each of the top-2 fitting sites, delay 15/30/60 minutes (kept at
    the best-fit site), and run at each of the three DVFS states (placed at
    the best-fit site).
    """
    candidates: List[CandidateAction] = []
    top_sites = rank_sites_by_fit(fleet_state, job, top_n=2)

    for site in top_sites:
        candidates.append(
            CandidateAction(
                action_type=ActionType.PLACE,
                job_id=job.job_id,
                target_site_id=site.site_id,
                dvfs_state="balanced",
                metadata={"reason": "place_now"},
            )
        )

    best_site = top_sites[0] if top_sites else None

    for minutes in DELAY_OPTIONS_MINUTES:
        candidates.append(
            CandidateAction(
                action_type=ActionType.DELAY,
                job_id=job.job_id,
                target_site_id=best_site.site_id if best_site else None,
                delay_minutes=minutes,
                metadata={"reason": "delay_for_better_conditions"},
            )
        )

    for dvfs in DVFS_STATES:
        candidates.append(
            CandidateAction(
                action_type=ActionType.CHANGE_DVFS,
                job_id=job.job_id,
                target_site_id=best_site.site_id if best_site else None,
                dvfs_state=dvfs,
                metadata={"reason": "dvfs_tradeoff"},
            )
        )

    if not top_sites:
        candidates.append(
            CandidateAction(
                action_type=ActionType.REJECT,
                job_id=job.job_id,
                metadata={"reason": "no_site_has_capacity"},
            )
        )

    return candidates

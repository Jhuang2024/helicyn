from __future__ import annotations

from typing import Dict, Optional

from helicyn_ml.schemas import ActionType, CandidateAction, QueuedJob

_ACTION_PHRASES = {
    ActionType.PLACE: "placing now at {target_site_id}",
    ActionType.DELAY: "delay_{delay_minutes:.0f}m",
    ActionType.MIGRATE: "migrating to {target_site_id}",
    ActionType.CHANGE_DVFS: "switching to {dvfs_state} DVFS",
    ActionType.SLEEP_SERVER: "sleeping server {target_server_id}",
    ActionType.WAKE_SERVER: "waking server {target_server_id}",
    ActionType.REJECT: "rejecting the request",
}


def explain_action(action: CandidateAction, score_breakdown: Dict[str, float], job: Optional[QueuedJob] = None) -> str:
    """Builds a plain-English explanation purely from structured scores -
    no LLM involved. Highlights the two largest-magnitude score terms as
    the dominant reasons.
    """
    action_phrase = _ACTION_PHRASES.get(action.action_type, str(action.action_type)).format(
        target_site_id=action.target_site_id or "an eligible site",
        delay_minutes=action.delay_minutes or 0,
        dvfs_state=action.dvfs_state or "balanced",
        target_server_id=action.target_server_id or "?",
    )
    job_phrase = f"job {job.job_id}" if job else (f"job {action.job_id}" if action.job_id else "the workload")

    ranked_terms = sorted(score_breakdown.items(), key=lambda kv: abs(kv[1]), reverse=True)
    reasons = []
    for name, value in ranked_terms[:2]:
        clean_name = name.replace("_term", "").replace("_", " ")
        direction = "reduces" if value < 0 else "costs"
        reasons.append(f"{clean_name} {direction} {abs(value):.2f} in the objective")

    reason_text = " and ".join(reasons) if reasons else "the overall objective score was lowest among valid candidates"
    return f"Selected {action_phrase} for {job_phrase} because {reason_text}."

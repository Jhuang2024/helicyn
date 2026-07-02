"""Transparent heuristic teacher used to (a) generate imitation-learning
labels for PolicyRanker v1 and (b) act as a fallback scorer when no trained
ranker is available. Every term is a plain weighted sum over inspectable
features - no learned weights, no LLM.
"""
from __future__ import annotations

from typing import Dict, Tuple

DEFAULT_WEIGHTS: Dict[str, float] = {
    "w_sla": 100.0,
    "w_power": 2.0,
    "w_carbon": 6.0,
    "w_price": 4.0,
    "w_thermal": 12.0,
    "w_fragmentation": 2.0,
    "w_delay": 8.0,
    "w_utilization": 2.0,
    "w_consolidation": 3.0,
}


def teacher_score(features: Dict[str, float], weights: Dict[str, float] = None) -> Tuple[float, Dict[str, float]]:
    """Lower score = better action. `features` values are expected roughly
    in [0, 1] (or normalized) except delay_penalty/predicted_power_delta
    which are in natural units; callers are responsible for normalization.
    """
    w = weights or DEFAULT_WEIGHTS

    sla_risk = features.get("sla_risk", 0.0)
    power_delta = features.get("predicted_power_delta", 0.0)
    carbon = features.get("normalized_carbon_intensity", 0.0)
    price = features.get("normalized_price", 0.0)
    thermal = features.get("thermal_risk", 0.0)
    fragmentation = features.get("fragmentation", 0.0)
    delay_penalty = features.get("delay_penalty", 0.0)
    utilization = features.get("useful_utilization", 0.0)
    consolidation = features.get("consolidation_benefit", 0.0)

    breakdown = {
        "sla_term": w["w_sla"] * sla_risk,
        "power_term": w["w_power"] * power_delta,
        "carbon_term": w["w_carbon"] * carbon,
        "price_term": w["w_price"] * price,
        "thermal_term": w["w_thermal"] * thermal,
        "fragmentation_term": w["w_fragmentation"] * fragmentation,
        "delay_term": w["w_delay"] * delay_penalty,
        "utilization_term": -w["w_utilization"] * utilization,
        "consolidation_term": -w["w_consolidation"] * consolidation,
    }
    score = sum(breakdown.values())
    return score, breakdown

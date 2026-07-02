from helicyn_sim.policies.base import Policy, PolicyDecision
from helicyn_sim.policies.baseline_first_fit import BaselineFirstFitPolicy
from helicyn_sim.policies.carbon_aware import CarbonAwarePolicy
from helicyn_sim.policies.consolidation import ConsolidationPolicy
from helicyn_sim.policies.dvfs_aware import DVFSAwarePolicy
from helicyn_sim.policies.external_helicyn import DEFAULT_HELICYN_URL, ExternalHelicynPolicy
from helicyn_sim.policies.integrated_coordination import IntegratedCoordinationPolicy
from helicyn_sim.policies.price_aware import PriceAwarePolicy
from helicyn_sim.policies.thermal_aware import ThermalAwarePolicy

BUILTIN_POLICY_REGISTRY: dict[str, type[Policy]] = {
    "baseline_first_fit": BaselineFirstFitPolicy,
    "consolidation": ConsolidationPolicy,
    "thermal_aware": ThermalAwarePolicy,
    "carbon_aware": CarbonAwarePolicy,
    "price_aware": PriceAwarePolicy,
    "dvfs_aware": DVFSAwarePolicy,
    "integrated_coordination": IntegratedCoordinationPolicy,
}

# Policy names that a Phase 2 before-after comparison runs through by
# default. Kept exactly as Phase 2 defined it (5 heuristics + baseline);
# intentionally does NOT include integrated_coordination so Phase 2's
# `before-after` output shape doesn't change under Phase 3.
BEFORE_AFTER_BUILTIN_POLICIES: list[str] = [
    "baseline_first_fit",
    "consolidation",
    "thermal_aware",
    "carbon_aware",
    "price_aware",
    "dvfs_aware",
]

# Policy names a Phase 3 research-run/ablation compares by default: every
# built-in policy including integrated_coordination, still excluding
# external_helicyn (added conditionally only when a reachable --helicyn-url
# is given).
RESEARCH_BUILTIN_POLICIES: list[str] = [
    "baseline_first_fit",
    "consolidation",
    "thermal_aware",
    "carbon_aware",
    "price_aware",
    "dvfs_aware",
    "integrated_coordination",
]

POLICY_REGISTRY: dict[str, type[Policy]] = {
    **BUILTIN_POLICY_REGISTRY,
    "external_helicyn": ExternalHelicynPolicy,
}


def get_policy(name: str, **kwargs) -> Policy:
    try:
        cls = POLICY_REGISTRY[name]
    except KeyError as exc:
        raise ValueError(f"Unknown policy: {name!r}. Valid: {sorted(POLICY_REGISTRY)}") from exc
    return cls(**kwargs) if kwargs else cls()


__all__ = [
    "Policy",
    "PolicyDecision",
    "BaselineFirstFitPolicy",
    "ConsolidationPolicy",
    "ThermalAwarePolicy",
    "CarbonAwarePolicy",
    "PriceAwarePolicy",
    "DVFSAwarePolicy",
    "IntegratedCoordinationPolicy",
    "ExternalHelicynPolicy",
    "DEFAULT_HELICYN_URL",
    "POLICY_REGISTRY",
    "BUILTIN_POLICY_REGISTRY",
    "BEFORE_AFTER_BUILTIN_POLICIES",
    "RESEARCH_BUILTIN_POLICIES",
    "get_policy",
]

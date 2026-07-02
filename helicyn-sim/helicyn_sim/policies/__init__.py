from helicyn_sim.policies.base import Policy, PolicyDecision
from helicyn_sim.policies.baseline_first_fit import BaselineFirstFitPolicy
from helicyn_sim.policies.carbon_aware import CarbonAwarePolicy
from helicyn_sim.policies.consolidation import ConsolidationPolicy
from helicyn_sim.policies.dvfs_aware import DVFSAwarePolicy
from helicyn_sim.policies.external_helicyn import DEFAULT_HELICYN_URL, ExternalHelicynPolicy
from helicyn_sim.policies.price_aware import PriceAwarePolicy
from helicyn_sim.policies.thermal_aware import ThermalAwarePolicy

BUILTIN_POLICY_REGISTRY: dict[str, type[Policy]] = {
    "baseline_first_fit": BaselineFirstFitPolicy,
    "consolidation": ConsolidationPolicy,
    "thermal_aware": ThermalAwarePolicy,
    "carbon_aware": CarbonAwarePolicy,
    "price_aware": PriceAwarePolicy,
    "dvfs_aware": DVFSAwarePolicy,
}

# Policy names that a before-after comparison run through by default.
BEFORE_AFTER_BUILTIN_POLICIES: list[str] = list(BUILTIN_POLICY_REGISTRY.keys())

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
    "ExternalHelicynPolicy",
    "DEFAULT_HELICYN_URL",
    "POLICY_REGISTRY",
    "BUILTIN_POLICY_REGISTRY",
    "BEFORE_AFTER_BUILTIN_POLICIES",
    "get_policy",
]

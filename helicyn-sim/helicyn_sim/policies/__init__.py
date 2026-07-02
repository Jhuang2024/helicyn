from helicyn_sim.policies.base import Policy, PolicyDecision
from helicyn_sim.policies.baseline_first_fit import BaselineFirstFitPolicy

POLICY_REGISTRY: dict[str, type[Policy]] = {
    "baseline_first_fit": BaselineFirstFitPolicy,
}


def get_policy(name: str) -> Policy:
    try:
        return POLICY_REGISTRY[name]()
    except KeyError as exc:
        raise ValueError(f"Unknown policy: {name!r}. Valid: {sorted(POLICY_REGISTRY)}") from exc


__all__ = ["Policy", "PolicyDecision", "BaselineFirstFitPolicy", "POLICY_REGISTRY", "get_policy"]

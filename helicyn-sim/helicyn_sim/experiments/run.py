"""Single-run experiment entry point used by the CLI `run` command."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from helicyn_sim.config import Config, load_config
from helicyn_sim.policies import get_policy
from helicyn_sim.policies.external_helicyn import DEFAULT_TIMEOUT_SECONDS, ExternalHelicynPolicy
from helicyn_sim.simulation.engine import run_and_write


def build_policy(
    policy_name: str,
    helicyn_url: Optional[str] = None,
    helicyn_timeout: float = DEFAULT_TIMEOUT_SECONDS,
):
    if policy_name == "external_helicyn":
        kwargs = {"timeout_seconds": helicyn_timeout}
        if helicyn_url:
            kwargs["url"] = helicyn_url
        return get_policy(policy_name, **kwargs)
    return get_policy(policy_name)


def run_experiment(
    config_path: str | Path,
    policy_name: str,
    out_dir: str | Path,
    resource_trace_path: str | None = None,
    helicyn_url: Optional[str] = None,
    helicyn_timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict:
    config: Config = load_config(config_path)
    if resource_trace_path is None:
        resource_trace_path = config.workload.resource_trace_path
    policy = build_policy(policy_name, helicyn_url=helicyn_url, helicyn_timeout=helicyn_timeout)
    if isinstance(policy, ExternalHelicynPolicy):
        policy.check_available()
    return run_and_write(config, policy, out_dir, resource_trace_path=resource_trace_path)

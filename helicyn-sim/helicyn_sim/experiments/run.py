"""Single-run experiment entry point used by the CLI `run` command."""
from __future__ import annotations

from pathlib import Path

from helicyn_sim.config import Config, load_config
from helicyn_sim.policies import get_policy
from helicyn_sim.simulation.engine import run_and_write


def run_experiment(
    config_path: str | Path,
    policy_name: str,
    out_dir: str | Path,
    resource_trace_path: str | None = None,
) -> dict:
    config: Config = load_config(config_path)
    if resource_trace_path is None:
        resource_trace_path = config.workload.resource_trace_path
    policy = get_policy(policy_name)
    return run_and_write(config, policy, out_dir, resource_trace_path=resource_trace_path)

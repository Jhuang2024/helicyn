"""Safe helpers for the no-terminal "Run Simulator" / "Run Policy
Comparison" dashboard pages.

These wrap the same internal functions the CLI uses
(`helicyn_sim.experiments.run.run_experiment`,
`helicyn_sim.experiments.before_after.run_before_after`) so a dashboard
user never needs to type a `python -m helicyn_sim ...` command. This
module owns only the *safety* and *discovery* surface: validating a
user-typed output folder name so it cannot escape `runs/`, listing
configs/policies, and checking whether an external helicyn-ml server is
reachable. It does not change any simulator equation, policy, or config.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from helicyn_sim.policies import POLICY_REGISTRY
from helicyn_sim.policies.external_helicyn import ExternalHelicynPolicy, ExternalHelicynUnavailableError

# All policy names selectable from the dashboard, in a stable display order.
# integrated_coordination needs no external server; external_helicyn does.
DASHBOARD_POLICY_CHOICES: list[str] = [
    "baseline_first_fit",
    "consolidation",
    "thermal_aware",
    "carbon_aware",
    "price_aware",
    "dvfs_aware",
    "integrated_coordination",
    "external_helicyn",
]

DEFAULT_EXTERNAL_HELICYN_URL = "http://127.0.0.1:8765/recommend"

_SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_\-]{0,63}$")


class UnsafeOutputFolderError(ValueError):
    """Raised when a user-supplied output folder name is empty, contains
    path separators / '..' / other traversal attempts, or otherwise falls
    outside the safe-character allowlist."""


def validate_policy_name(name: str) -> str:
    if name not in POLICY_REGISTRY:
        raise ValueError(f"Unknown policy {name!r}. Valid choices: {sorted(POLICY_REGISTRY)}")
    return name


def validate_output_folder_name(name: str) -> str:
    """Validate a user-supplied output folder *name* (not a path).

    Only a conservative allowlist of letters, digits, '_', and '-' is
    accepted (1-64 chars). This rejects empty names, absolute paths, path
    separators, and '..' segments, so a folder name typed into the
    dashboard can never resolve outside the intended runs/ directory.
    """
    name = (name or "").strip()
    if not name:
        raise UnsafeOutputFolderError("Output folder name cannot be empty.")
    if not _SAFE_NAME_RE.match(name):
        raise UnsafeOutputFolderError(
            "Output folder name must be 1-64 characters of letters, digits, '_' or '-' "
            "only (no spaces, slashes, or '..')."
        )
    return name


def resolve_run_output_dir(repo_root: str | Path, folder_name: str, base: str = "runs") -> Path:
    """Resolve a validated folder name to a path under `<repo_root>/<base>/`,
    and confirm the resolved path actually stays inside that directory.
    """
    safe_name = validate_output_folder_name(folder_name)
    base_dir = (Path(repo_root) / base).resolve()
    candidate = (base_dir / safe_name).resolve()
    if candidate != base_dir and base_dir not in candidate.parents:
        raise UnsafeOutputFolderError("Resolved output path would escape the runs/ directory.")
    return candidate


def list_available_configs(repo_root: str | Path) -> list[str]:
    configs_dir = Path(repo_root) / "configs"
    if not configs_dir.exists():
        return []
    return sorted(p.name for p in configs_dir.glob("*.yaml"))


def default_resource_trace_path(repo_root: str | Path) -> Optional[Path]:
    """The Phase 2/3 resource trace shipped by helicyn-ml, if present next
    to this checkout. Returns None (not an error) when absent so the
    dashboard can offer "none" as a safe default.
    """
    candidate = (Path(repo_root) / ".." / "helicyn-ml" / "data" / "processed" / "resources" / "google_cpu_memory.parquet")
    candidate = candidate.resolve()
    return candidate if candidate.exists() else None


def check_external_helicyn_server(url: str, timeout_seconds: float = 5.0) -> tuple[bool, str]:
    """Check whether a helicyn-ml `/recommend` server is reachable at
    *url*. Returns (is_up, message) and never raises -- the dashboard is
    read-only/best-effort by design.
    """
    policy = ExternalHelicynPolicy(url=url, timeout_seconds=timeout_seconds)
    try:
        policy.check_available()
        return True, f"Reachable: {policy.health_url()}"
    except ExternalHelicynUnavailableError as exc:
        return False, str(exc)

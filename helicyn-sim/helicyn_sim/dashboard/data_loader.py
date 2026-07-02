"""Every loader in this module is defensive by design: missing files,
malformed CSVs, or absent directories return `None` (or an empty
structure) instead of raising. The dashboard is a read-only inspection
layer over whatever output happens to exist on disk -- it must never crash
just because a research-run/ablation/sensitivity/paper-* command hasn't
been run yet. See tests/test_dashboard_loaders.py.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import pandas as pd
import yaml

RUN_OUTPUT_FILES = [
    "run_summary.json",
    "timeseries_metrics.csv",
    "job_results.csv",
    "policy_decisions.csv",
    "config_resolved.yaml",
]


def _safe_read_json(path: Path) -> Optional[dict]:
    try:
        with path.open() as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _safe_read_csv(path: Path) -> Optional[pd.DataFrame]:
    try:
        if not path.exists() or path.stat().st_size == 0:
            return None
        return pd.read_csv(path)
    except (OSError, pd.errors.EmptyDataError, pd.errors.ParserError):
        return None


def _safe_read_yaml(path: Path) -> Optional[dict]:
    try:
        with path.open() as f:
            return yaml.safe_load(f)
    except (OSError, yaml.YAMLError):
        return None


def _safe_read_text(path: Path) -> Optional[str]:
    try:
        return path.read_text()
    except OSError:
        return None


# --- single-run loaders -----------------------------------------------------


def read_csv_safe(path: str | Path) -> Optional[pd.DataFrame]:
    """Public entry point for pages that need to read an arbitrary CSV path
    not covered by one of the specific loaders below (e.g. a Phase 2
    before-after comparison summary discovered by glob).
    """
    return _safe_read_csv(Path(path))


def is_run_dir(path: Path) -> bool:
    return (path / "run_summary.json").exists()


def load_run_summary(run_dir: str | Path) -> Optional[dict]:
    return _safe_read_json(Path(run_dir) / "run_summary.json")


def load_timeseries_metrics(run_dir: str | Path) -> Optional[pd.DataFrame]:
    return _safe_read_csv(Path(run_dir) / "timeseries_metrics.csv")


def load_job_results(run_dir: str | Path) -> Optional[pd.DataFrame]:
    return _safe_read_csv(Path(run_dir) / "job_results.csv")


def load_policy_decisions(run_dir: str | Path) -> Optional[pd.DataFrame]:
    return _safe_read_csv(Path(run_dir) / "policy_decisions.csv")


def load_config_resolved(run_dir: str | Path) -> Optional[dict]:
    return _safe_read_yaml(Path(run_dir) / "config_resolved.yaml")


def discover_run_dirs(root: str | Path, max_results: int = 500) -> list[Path]:
    """Find every directory under `root` that directly contains a
    run_summary.json (i.e. is itself a single-policy run output dir),
    searching at most a few levels deep so this stays fast on a large
    research-run tree.
    """
    root = Path(root)
    if not root.exists():
        return []
    found: list[Path] = []
    try:
        for path in sorted(root.rglob("run_summary.json")):
            found.append(path.parent)
            if len(found) >= max_results:
                break
    except OSError:
        return []
    return found


# --- aggregate (research-run) loaders ---------------------------------------


def load_aggregate_csv(results_dir: str | Path, filename: str) -> Optional[pd.DataFrame]:
    return _safe_read_csv(Path(results_dir) / "aggregate" / filename)


def load_all_runs_summary(results_dir: str | Path) -> Optional[pd.DataFrame]:
    return load_aggregate_csv(results_dir, "all_runs_summary.csv")


def load_before_after_summary(before_after_dir: str | Path) -> Optional[pd.DataFrame]:
    """Fallback for Phase 2's `before-after` output shape, used by pages
    when a Phase 3 research-run aggregate isn't available.
    """
    return _safe_read_csv(Path(before_after_dir) / "comparison" / "summary.csv")


# --- ablation / sensitivity loaders -----------------------------------------


def load_ablation_summary(ablation_dir: str | Path) -> Optional[pd.DataFrame]:
    return _safe_read_csv(Path(ablation_dir) / "ablation_summary.csv")


def load_ablation_report(ablation_dir: str | Path) -> Optional[str]:
    return _safe_read_text(Path(ablation_dir) / "ablation_report.md")


def load_sensitivity_summary(sensitivity_dir: str | Path) -> Optional[pd.DataFrame]:
    return _safe_read_csv(Path(sensitivity_dir) / "sensitivity_summary.csv")


def load_sensitivity_report(sensitivity_dir: str | Path) -> Optional[str]:
    return _safe_read_text(Path(sensitivity_dir) / "sensitivity_report.md")


# --- paper outputs loaders ---------------------------------------------------


def list_figures(figures_dir: str | Path) -> list[Path]:
    figures_dir = Path(figures_dir)
    if not figures_dir.exists():
        return []
    try:
        return sorted(figures_dir.glob("*.png"))
    except OSError:
        return []


def load_captions(figures_dir: str | Path) -> dict[str, str]:
    text = _safe_read_text(Path(figures_dir) / "captions.md")
    if not text:
        return {}
    captions: dict[str, str] = {}
    current_file = None
    buffer: list[str] = []
    for line in text.splitlines():
        if line.startswith("## "):
            if current_file is not None:
                captions[current_file] = "\n".join(buffer).strip()
            current_file = line[3:].strip()
            buffer = []
        elif current_file is not None:
            buffer.append(line)
    if current_file is not None:
        captions[current_file] = "\n".join(buffer).strip()
    return captions


def list_tables(tables_dir: str | Path) -> list[Path]:
    tables_dir = Path(tables_dir)
    if not tables_dir.exists():
        return []
    try:
        return sorted(tables_dir.glob("*.csv"))
    except OSError:
        return []


def load_paper_tables_md(tables_dir: str | Path) -> Optional[str]:
    return _safe_read_text(Path(tables_dir) / "paper_tables.md")


def load_research_report(path: str | Path) -> Optional[str]:
    return _safe_read_text(Path(path))


def load_claims_audit(path: str | Path) -> Optional[str]:
    return _safe_read_text(Path(path))


def load_markdown_doc(path: str | Path) -> Optional[str]:
    return _safe_read_text(Path(path))


# --- availability summary ----------------------------------------------------


def data_availability(
    results_root: str | Path,
    ablation_dir: Optional[str | Path] = None,
    sensitivity_dir: Optional[str | Path] = None,
    figures_dir: Optional[str | Path] = None,
    tables_dir: Optional[str | Path] = None,
    claims_audit_path: Optional[str | Path] = None,
) -> dict[str, bool]:
    results_root = Path(results_root)
    return {
        "main_experiment": (results_root / "aggregate" / "all_runs_summary.csv").exists(),
        "ablation": ablation_dir is not None and (Path(ablation_dir) / "ablation_summary.csv").exists(),
        "sensitivity": sensitivity_dir is not None
        and (Path(sensitivity_dir) / "sensitivity_summary.csv").exists(),
        "figures": figures_dir is not None and len(list_figures(figures_dir)) > 0,
        "tables": tables_dir is not None and (Path(tables_dir) / "paper_tables.md").exists(),
        "claims_audit": claims_audit_path is not None and Path(claims_audit_path).exists(),
    }

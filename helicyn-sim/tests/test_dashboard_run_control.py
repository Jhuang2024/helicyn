"""Tests for the no-terminal "Run Simulator" / "Run Policy Comparison"
dashboard controls: policy/output-folder validation, external server
status checks, and run/comparison output loading via run_control +
data_loader together.
"""
from __future__ import annotations

import yaml
import pytest

from helicyn_sim.config import load_config
from helicyn_sim.dashboard import data_loader, run_control
from helicyn_sim.experiments.before_after import run_before_after
from helicyn_sim.experiments.run import run_experiment


def _short_demo_config_path(tmp_path):
    config = load_config("configs/demo.yaml")
    config.simulation.duration_hours = 1
    path = tmp_path / "short_demo.yaml"
    with path.open("w") as f:
        yaml.safe_dump(config.model_dump(mode="json"), f)
    return path


# --- policy validation -------------------------------------------------


def test_dashboard_policy_choices_are_all_valid():
    for name in run_control.DASHBOARD_POLICY_CHOICES:
        assert run_control.validate_policy_name(name) == name


def test_validate_policy_name_rejects_unknown():
    with pytest.raises(ValueError):
        run_control.validate_policy_name("not_a_real_policy")


# --- output folder / path safety ---------------------------------------


@pytest.mark.parametrize(
    "name",
    [
        "demo_run",
        "Run-123",
        "a",
        "a" * 64,
    ],
)
def test_validate_output_folder_name_accepts_safe_names(name):
    assert run_control.validate_output_folder_name(name) == name


@pytest.mark.parametrize(
    "name",
    [
        "",
        "   ",
        "../escape",
        "..",
        "a/b",
        "/abs/path",
        "a b",
        "a" * 65,
        "run;rm -rf",
        "run$(whoami)",
    ],
)
def test_validate_output_folder_name_rejects_unsafe_names(name):
    with pytest.raises(run_control.UnsafeOutputFolderError):
        run_control.validate_output_folder_name(name)


def test_resolve_run_output_dir_stays_inside_runs(tmp_path):
    resolved = run_control.resolve_run_output_dir(tmp_path, "my_run")
    runs_root = (tmp_path / "runs").resolve()
    assert resolved == runs_root / "my_run"
    assert runs_root in resolved.parents


def test_resolve_run_output_dir_rejects_traversal_attempts(tmp_path):
    with pytest.raises(run_control.UnsafeOutputFolderError):
        run_control.resolve_run_output_dir(tmp_path, "../outside")


# --- discovery helpers ---------------------------------------------------


def test_list_available_configs_finds_demo_yaml():
    configs = run_control.list_available_configs(".")
    assert "demo.yaml" in configs


def test_list_available_configs_missing_dir_returns_empty(tmp_path):
    assert run_control.list_available_configs(tmp_path) == []


def test_default_resource_trace_path_none_when_absent(tmp_path):
    assert run_control.default_resource_trace_path(tmp_path) is None


# --- external server status helper ---------------------------------------


def test_check_external_helicyn_server_offline_reports_down():
    is_up, message = run_control.check_external_helicyn_server(
        "http://127.0.0.1:1/recommend", timeout_seconds=1.0
    )
    assert is_up is False
    assert message


# --- run / comparison output loading (via data_loader) -------------------


def test_run_simulator_output_is_loadable_after_a_real_run(tmp_path):
    config_path = _short_demo_config_path(tmp_path)
    out_dir = run_control.resolve_run_output_dir(tmp_path, "dashboard_test_run")

    run_experiment(config_path=config_path, policy_name="baseline_first_fit", out_dir=out_dir)

    summary = data_loader.load_run_summary(out_dir)
    assert summary is not None
    for key in ("total_facility_energy_kwh", "completed_jobs", "deadline_misses", "average_pue"):
        assert key in summary


def test_comparison_output_is_loadable_after_a_real_run(tmp_path):
    config_path = _short_demo_config_path(tmp_path)
    out_dir = run_control.resolve_run_output_dir(tmp_path, "dashboard_test_comparison")

    result = run_before_after(config_path=config_path, out_dir=out_dir)

    summary = data_loader.read_csv_safe(f"{result['comparison_dir']}/summary.csv")
    assert summary is not None
    assert not summary.empty
    assert "policy_name" in summary.columns

    report = data_loader.load_markdown_doc(f"{result['comparison_dir']}/report.md")
    assert report

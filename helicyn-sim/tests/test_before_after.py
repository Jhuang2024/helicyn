import csv
import json

import yaml

from helicyn_sim.config import load_config
from helicyn_sim.experiments.before_after import run_before_after
from helicyn_sim.policies import BEFORE_AFTER_BUILTIN_POLICIES

REQUIRED_DELTA_COLUMNS = {
    "delta_facility_energy_vs_baseline_pct",
    "delta_carbon_vs_baseline_pct",
    "delta_cost_vs_baseline_pct",
    "delta_deadline_misses_vs_baseline",
}


def _short_config_path(tmp_path):
    config = load_config("configs/demo.yaml")
    config.simulation.duration_hours = 1
    path = tmp_path / "short_demo.yaml"
    with path.open("w") as f:
        yaml.safe_dump(config.model_dump(mode="json"), f)
    return path


def test_before_after_creates_all_run_folders(tmp_path):
    config_path = _short_config_path(tmp_path)
    out_dir = tmp_path / "before_after"

    run_before_after(config_path=config_path, out_dir=out_dir)

    for policy_name in BEFORE_AFTER_BUILTIN_POLICIES:
        policy_dir = out_dir / policy_name
        assert policy_dir.is_dir()
        assert (policy_dir / "run_summary.json").exists()

    assert (out_dir / "comparison").is_dir()


def test_before_after_summary_and_report_exist_with_baseline_and_deltas(tmp_path):
    config_path = _short_config_path(tmp_path)
    out_dir = tmp_path / "before_after2"

    result = run_before_after(config_path=config_path, out_dir=out_dir)

    summary_csv = out_dir / "comparison" / "summary.csv"
    summary_json = out_dir / "comparison" / "summary.json"
    report_md = out_dir / "comparison" / "report.md"

    assert summary_csv.exists()
    assert summary_json.exists()
    assert report_md.exists()

    with summary_csv.open() as f:
        rows = list(csv.DictReader(f))
    policy_names = {row["policy_name"] for row in rows}
    assert "baseline_first_fit" in policy_names
    assert REQUIRED_DELTA_COLUMNS.issubset(rows[0].keys())

    with summary_json.open() as f:
        json_rows = json.load(f)
    assert {row["policy_name"] for row in json_rows} == policy_names

    report_text = report_md.read_text()
    assert "simulated" in report_text.lower()
    assert "baseline_first_fit" in report_text

    assert result["external_status"] == "not_requested"


def test_before_after_skips_external_helicyn_when_unreachable(tmp_path):
    config_path = _short_config_path(tmp_path)
    out_dir = tmp_path / "before_after3"

    result = run_before_after(
        config_path=config_path,
        out_dir=out_dir,
        helicyn_url="http://127.0.0.1:19999/recommend",  # nothing listening
        helicyn_timeout=1.0,
    )

    assert result["external_status"].startswith("skipped")
    assert "external_helicyn" not in result["results"]
    assert not (out_dir / "external_helicyn").exists()

    report_text = (out_dir / "comparison" / "report.md").read_text()
    assert "skipped" in report_text.lower()

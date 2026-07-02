import json

from helicyn_sim.experiments.run import run_experiment


REQUIRED_SUMMARY_KEYS = {
    "policy_name",
    "duration_hours",
    "timestep_minutes",
    "total_jobs",
    "completed_jobs",
    "rejected_jobs",
    "deadline_misses",
    "sla_violations",
    "total_it_energy_kwh",
    "total_facility_energy_kwh",
    "total_cooling_energy_kwh",
    "total_carbon_kgco2e",
    "total_cost_usd",
    "average_pue",
    "peak_facility_power_kw",
    "average_cpu_utilization",
    "average_memory_utilization",
    "active_server_hours",
    "sleeping_server_hours",
    "max_rack_temp_c",
    "p95_rack_temp_c",
    "thermal_violations",
    "critical_thermal_violations",
}

REQUIRED_OUTPUT_FILES = {
    "run_summary.json",
    "timeseries_metrics.csv",
    "job_results.csv",
    "policy_decisions.csv",
    "config_resolved.yaml",
}


def test_run_creates_all_required_output_files(tmp_path):
    out_dir = tmp_path / "run1"
    run_experiment(
        config_path="configs/demo.yaml",
        policy_name="baseline_first_fit",
        out_dir=out_dir,
    )

    produced = {p.name for p in out_dir.iterdir()}
    assert REQUIRED_OUTPUT_FILES.issubset(produced)


def test_run_summary_contains_required_keys(tmp_path):
    out_dir = tmp_path / "run2"
    summary = run_experiment(
        config_path="configs/demo.yaml",
        policy_name="baseline_first_fit",
        out_dir=out_dir,
    )

    assert REQUIRED_SUMMARY_KEYS.issubset(summary.keys())

    with (out_dir / "run_summary.json").open() as f:
        on_disk = json.load(f)
    assert REQUIRED_SUMMARY_KEYS.issubset(on_disk.keys())
    assert on_disk["policy_name"] == "baseline_first_fit"
    assert on_disk["total_jobs"] > 0

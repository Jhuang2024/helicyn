import pandas as pd

from helicyn_sim.experiments.research_run import run_research_experiment


def test_research_run_quick_mode_creates_aggregate_summary(short_research_config_path, tmp_path):
    out_dir = tmp_path / "research_out"

    result = run_research_experiment(config_path=short_research_config_path, out_dir=out_dir, quick=True)

    assert result["total_runs"] > 0
    assert result["external_status"] == "not_requested"

    aggregate_dir = out_dir / "aggregate"
    for filename in [
        "all_runs_summary.csv",
        "all_runs_summary.json",
        "policy_means.csv",
        "policy_std.csv",
        "baseline_relative_deltas.csv",
        "scenario_policy_summary.csv",
    ]:
        assert (aggregate_dir / filename).exists(), filename

    all_runs_df = pd.read_csv(aggregate_dir / "all_runs_summary.csv")
    assert len(all_runs_df) == result["total_runs"]
    assert "baseline_first_fit" in all_runs_df["policy_name"].values
    assert "integrated_coordination" in all_runs_df["policy_name"].values
    for col in ("scenario", "seed", "policy_name", "total_carbon_kgco2e", "deadline_misses"):
        assert col in all_runs_df.columns


def test_research_run_writes_per_run_output_files(short_research_config_path, tmp_path):
    out_dir = tmp_path / "research_out2"
    run_research_experiment(config_path=short_research_config_path, out_dir=out_dir, quick=True)

    runs_dir = out_dir / "runs"
    scenario_dirs = list(runs_dir.iterdir())
    assert scenario_dirs
    one_scenario = scenario_dirs[0]
    one_seed = next(one_scenario.iterdir())
    one_policy = next(one_seed.iterdir())
    for filename in ["run_summary.json", "timeseries_metrics.csv", "job_results.csv", "policy_decisions.csv", "config_resolved.yaml"]:
        assert (one_policy / filename).exists()

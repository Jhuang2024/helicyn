from helicyn_sim.dashboard import data_loader
from helicyn_sim.experiments.research_run import run_research_experiment


def test_loaders_return_none_for_missing_files(tmp_path):
    missing = tmp_path / "does_not_exist"
    assert data_loader.load_run_summary(missing) is None
    assert data_loader.load_timeseries_metrics(missing) is None
    assert data_loader.load_job_results(missing) is None
    assert data_loader.load_policy_decisions(missing) is None
    assert data_loader.load_config_resolved(missing) is None
    assert data_loader.load_all_runs_summary(missing) is None
    assert data_loader.load_ablation_summary(missing) is None
    assert data_loader.load_sensitivity_summary(missing) is None
    assert data_loader.load_claims_audit(missing / "claims_audit.md") is None
    assert data_loader.load_research_report(missing / "research_report.md") is None
    assert data_loader.list_figures(missing) == []
    assert data_loader.list_tables(missing) == []
    assert data_loader.discover_run_dirs(missing) == []


def test_loaders_handle_empty_and_malformed_files_gracefully(tmp_path):
    run_dir = tmp_path / "run1"
    run_dir.mkdir()
    (run_dir / "run_summary.json").write_text("not valid json{{{")
    (run_dir / "timeseries_metrics.csv").write_text("")

    assert data_loader.load_run_summary(run_dir) is None
    assert data_loader.load_timeseries_metrics(run_dir) is None


def test_run_summary_and_timeseries_load_from_real_run(short_research_config_path, tmp_path):
    out_dir = tmp_path / "research_out"
    run_research_experiment(config_path=short_research_config_path, out_dir=out_dir, quick=True)

    run_dirs = data_loader.discover_run_dirs(out_dir / "runs")
    assert run_dirs

    summary = data_loader.load_run_summary(run_dirs[0])
    assert summary is not None
    assert "policy_name" in summary

    ts = data_loader.load_timeseries_metrics(run_dirs[0])
    assert ts is not None
    assert "facility_power_kw" in ts.columns

    jobs = data_loader.load_job_results(run_dirs[0])
    assert jobs is not None

    decisions = data_loader.load_policy_decisions(run_dirs[0])
    assert decisions is not None

    config = data_loader.load_config_resolved(run_dirs[0])
    assert config is not None
    assert "fleet" in config


def test_aggregate_results_load(short_research_config_path, tmp_path):
    out_dir = tmp_path / "research_out2"
    run_research_experiment(config_path=short_research_config_path, out_dir=out_dir, quick=True)

    all_runs = data_loader.load_all_runs_summary(out_dir)
    assert all_runs is not None
    assert "policy_name" in all_runs.columns
    assert len(all_runs) > 0


def test_claims_audit_loads_or_missing_message(tmp_path):
    missing_path = tmp_path / "claims_audit.md"
    assert data_loader.load_claims_audit(missing_path) is None

    missing_path.write_text("# Claims audit\n\nSome content")
    assert data_loader.load_claims_audit(missing_path) == "# Claims audit\n\nSome content"


def test_data_availability_all_false_when_nothing_exists(tmp_path):
    availability = data_loader.data_availability(
        tmp_path / "results",
        ablation_dir=tmp_path / "ablation",
        sensitivity_dir=tmp_path / "sensitivity",
        figures_dir=tmp_path / "figures",
        tables_dir=tmp_path / "tables",
        claims_audit_path=tmp_path / "claims_audit.md",
    )
    assert all(v is False for v in availability.values())


def test_captions_parsing():
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmp:
        figures_dir = Path(tmp)
        (figures_dir / "captions.md").write_text(
            "# Figure captions\n\n## a.png\n\nCaption for a.\n\n## b.png\n\nCaption for b.\n"
        )
        captions = data_loader.load_captions(figures_dir)
        assert captions["a.png"] == "Caption for a."
        assert captions["b.png"] == "Caption for b."

from helicyn_sim.experiments.dashboard_snapshot import generate_dashboard_snapshot
from helicyn_sim.experiments.research_run import run_research_experiment


def test_dashboard_snapshot_creates_markdown(short_research_config_path, tmp_path):
    out_dir = tmp_path / "research_out"
    run_research_experiment(config_path=short_research_config_path, out_dir=out_dir, quick=True)

    snapshot_path = tmp_path / "dashboard_snapshot.md"
    result_path = generate_dashboard_snapshot(out_dir, snapshot_path)

    assert result_path == snapshot_path
    assert snapshot_path.exists()

    text = snapshot_path.read_text()
    assert "# Dashboard snapshot" in text
    assert "Overview KPIs" in text
    assert "Best / worst policies" in text
    assert "baseline_first_fit" in text or "integrated_coordination" in text
    assert "Limitations" in text
    assert "simulated" in text.lower()


def test_dashboard_snapshot_handles_missing_results_gracefully(tmp_path):
    missing_results = tmp_path / "no_such_results"
    snapshot_path = tmp_path / "snapshot.md"

    result_path = generate_dashboard_snapshot(missing_results, snapshot_path)

    assert result_path.exists()
    text = result_path.read_text()
    assert "No research-run aggregate found" in text
    assert "none found" in text  # figures/tables lists degrade gracefully

import pandas as pd

from helicyn_sim.experiments.sensitivity import run_sensitivity


def test_sensitivity_creates_sensitivity_summary_csv(short_sensitivity_config_path, tmp_path):
    out_dir = tmp_path / "sensitivity_out"

    result = run_sensitivity(config_path=short_sensitivity_config_path, out_dir=out_dir, quick=True)

    summary_path = out_dir / "sensitivity_summary.csv"
    assert summary_path.exists()
    assert (out_dir / "sensitivity_report.md").exists()

    df = pd.read_csv(summary_path)
    assert len(df) > 0
    assert set(result["variables"]) == set(df["variable"].unique())
    assert "baseline_first_fit" in df["policy_name"].values
    assert "integrated_coordination" in df["policy_name"].values
    for col in ("delta_energy_vs_baseline_pct", "delta_carbon_vs_baseline_pct", "delta_deadline_misses_vs_baseline"):
        assert col in df.columns


def test_sensitivity_report_mentions_every_variable(short_sensitivity_config_path, tmp_path):
    out_dir = tmp_path / "sensitivity_out2"
    result = run_sensitivity(config_path=short_sensitivity_config_path, out_dir=out_dir, quick=True)

    report_text = (out_dir / "sensitivity_report.md").read_text()
    for variable_name in result["variables"]:
        assert variable_name in report_text

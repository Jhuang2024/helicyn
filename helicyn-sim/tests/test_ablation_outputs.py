import json

from helicyn_sim.experiments.ablation import run_ablation


def test_ablation_creates_ablation_summary_csv(short_ablation_config_path, tmp_path):
    out_dir = tmp_path / "ablation_out"

    result = run_ablation(config_path=short_ablation_config_path, out_dir=out_dir, quick=True)

    assert (out_dir / "ablation_summary.csv").exists()
    assert (out_dir / "ablation_summary.json").exists()
    assert (out_dir / "ablation_report.md").exists()

    with (out_dir / "ablation_summary.json").open() as f:
        rows = json.load(f)

    assert len(rows) == len(result["policies"])
    policy_names = {row["policy_name"] for row in rows}
    assert "baseline_first_fit" in policy_names
    assert "integrated_coordination" in policy_names

    baseline_row = next(row for row in rows if row["policy_name"] == "baseline_first_fit")
    assert baseline_row["delta_vs_baseline_pct"] == 0.0

    for row in rows:
        assert "tradeoff_notes" in row and row["tradeoff_notes"]


def test_ablation_report_mentions_every_stage(short_ablation_config_path, tmp_path):
    out_dir = tmp_path / "ablation_out2"
    result = run_ablation(config_path=short_ablation_config_path, out_dir=out_dir, quick=True)

    report_text = (out_dir / "ablation_report.md").read_text()
    for policy_name in result["policies"]:
        assert policy_name in report_text

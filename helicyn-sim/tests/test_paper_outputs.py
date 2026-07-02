from helicyn_sim.experiments.ablation import run_ablation
from helicyn_sim.experiments.claims_audit import write_claims_audit
from helicyn_sim.experiments.paper_figures import generate_paper_figures
from helicyn_sim.experiments.paper_tables import generate_paper_tables
from helicyn_sim.experiments.research_report import generate_research_report
from helicyn_sim.experiments.research_run import run_research_experiment

MAIN_BAR_FIGURES = [
    "facility_energy_by_policy.png",
    "carbon_by_policy.png",
    "cost_by_policy.png",
    "deadline_misses_by_policy.png",
]


def test_paper_figures_creates_at_least_main_figures(short_research_config_path, short_ablation_config_path, tmp_path):
    results_dir = tmp_path / "results"
    run_research_experiment(config_path=short_research_config_path, out_dir=results_dir, quick=True)

    ablation_dir = tmp_path / "ablation"
    run_ablation(config_path=short_ablation_config_path, out_dir=ablation_dir, quick=True)

    figures_dir = tmp_path / "figures"
    result = generate_paper_figures(results_dir, figures_dir, ablation_dir=ablation_dir)

    for filename in MAIN_BAR_FIGURES:
        assert filename in result["generated"]
        assert (figures_dir / filename).exists()
        assert (figures_dir / filename).stat().st_size > 0

    assert (figures_dir / "captions.md").exists()
    captions_text = (figures_dir / "captions.md").read_text()
    assert "simulated" in captions_text.lower()
    for banned in ("proven", "validated", "production savings", "real-world savings"):
        assert banned not in captions_text.lower()


def test_paper_tables_creates_paper_tables_md(short_research_config_path, short_ablation_config_path, tmp_path):
    results_dir = tmp_path / "results2"
    run_research_experiment(config_path=short_research_config_path, out_dir=results_dir, quick=True)

    ablation_dir = tmp_path / "ablation2"
    run_ablation(config_path=short_ablation_config_path, out_dir=ablation_dir, quick=True)

    tables_dir = tmp_path / "tables"
    result = generate_paper_tables(results_dir, tables_dir, ablation_dir=ablation_dir)

    assert (tables_dir / "paper_tables.md").exists()
    for filename in [
        "table_experimental_setup.csv",
        "table_model_assumptions.csv",
        "table_ablation_results.csv",
        "table_limitations.csv",
    ]:
        assert filename in result["generated"]
        assert (tables_dir / filename).exists()

    md_text = (tables_dir / "paper_tables.md").read_text()
    assert "Experimental setup" in md_text
    assert "Limitations" in md_text


def test_research_report_contains_limitations_section(short_research_config_path, short_ablation_config_path, tmp_path):
    results_dir = tmp_path / "results3"
    run_research_experiment(config_path=short_research_config_path, out_dir=results_dir, quick=True)

    ablation_dir = tmp_path / "ablation3"
    run_ablation(config_path=short_ablation_config_path, out_dir=ablation_dir, quick=True)

    claims_path = write_claims_audit(results_dir, tmp_path / "claims_audit.md")

    report_path = generate_research_report(
        results_dir, tmp_path / "research_report.md", ablation_dir=ablation_dir, claims_audit_path=claims_path
    )

    text = report_path.read_text()
    assert "## 10. Limitations" in text
    assert "## 1. Overview" in text
    assert "## 11. Paper-ready claims" in text

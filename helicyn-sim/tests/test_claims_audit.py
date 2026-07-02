from helicyn_sim.experiments.claims_audit import build_claims_audit, write_claims_audit
from helicyn_sim.experiments.research_run import run_research_experiment


def test_claims_audit_contains_supported_and_unsupported_sections(short_research_config_path, tmp_path):
    results_dir = tmp_path / "results"
    run_research_experiment(config_path=short_research_config_path, out_dir=results_dir, quick=True)

    out_path = tmp_path / "claims_audit.md"
    written_path = write_claims_audit(results_dir, out_path)

    text = written_path.read_text()
    assert "## Supported" in text
    assert "## Unsupported" in text
    assert "production" in text.lower()


def test_claims_audit_statuses_are_valid(short_research_config_path, tmp_path):
    results_dir = tmp_path / "results2"
    run_research_experiment(config_path=short_research_config_path, out_dir=results_dir, quick=True)

    claims = build_claims_audit(results_dir)
    assert claims
    for claim in claims:
        assert claim.status in ("supported", "partially_supported", "unsupported")
        assert claim.claim
        assert claim.caveat


def test_claims_audit_flags_external_helicyn_as_partial_when_absent(short_research_config_path, tmp_path):
    results_dir = tmp_path / "results3"
    run_research_experiment(config_path=short_research_config_path, out_dir=results_dir, quick=True)

    claims = build_claims_audit(results_dir)
    comparison_claim = next(c for c in claims if "compares baseline" in c.claim)
    assert comparison_claim.status == "partially_supported"
    assert "external_helicyn" in comparison_claim.caveat

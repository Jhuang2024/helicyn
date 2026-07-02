from helicyn_sim.dashboard import components


def test_render_status_badge_returns_html_for_each_status():
    for status in ("supported", "partially_supported", "unsupported"):
        html = components.render_status_badge(status)
        assert status.replace("_", " ").title() in html or "Partially Supported" in html
        assert "<span" in html


def test_render_status_badge_handles_unknown_status():
    html = components.render_status_badge("something_else")
    assert "<span" in html


def test_safety_warning_text_does_not_claim_production_savings():
    text = components.SAFETY_WARNING_TEXT.lower()
    assert "simulated" in text
    assert "not production savings" in text or "not" in text
    for banned in ("proven", "validated", "real-world savings"):
        assert banned not in text


def _write_component_script(tmp_path, body: str):
    script = tmp_path / "component_script.py"
    script.write_text(
        "import streamlit as st\n"
        "from helicyn_sim.dashboard import components\n" + body
    )
    return script


def test_render_kpi_cards_runs_without_exception(tmp_path):
    from streamlit.testing.v1 import AppTest

    script = _write_component_script(
        tmp_path, 'components.render_kpi_cards({"a": "1", "b": "2", "c": "3", "d": "4", "e": "5"})\n'
    )
    at = AppTest.from_file(str(script))
    at.run(timeout=30)
    assert not at.exception


def test_render_safety_warning_and_missing_run_without_exception(tmp_path):
    from streamlit.testing.v1 import AppTest

    script = _write_component_script(
        tmp_path,
        "components.render_safety_warning()\n"
        'components.render_missing("nothing found", "python -m helicyn_sim research-run")\n',
    )
    at = AppTest.from_file(str(script))
    at.run(timeout=30)
    assert not at.exception
    assert len(at.warning) >= 1


def test_render_data_availability_runs_without_exception(tmp_path):
    from streamlit.testing.v1 import AppTest

    script = _write_component_script(
        tmp_path,
        "components.render_data_availability({"
        '"main_experiment": True, "ablation": False, "sensitivity": False, '
        '"figures": False, "tables": False, "claims_audit": False})\n',
    )
    at = AppTest.from_file(str(script))
    at.run(timeout=30)
    assert not at.exception

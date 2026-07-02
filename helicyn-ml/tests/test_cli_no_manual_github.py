"""Smoke-mode tests for `train-v1-no-manual-github`: exercise the command's
control flow (required-dataset stop gate, happy-path wiring) without hitting
the network or running real training, by monkeypatching the download/ingest/
split/train/status steps it calls.
"""
from typer.testing import CliRunner

import helicyn_ml.cli as cli_module
from helicyn_ml.datasets.downloader import DownloadResult

runner = CliRunner()


def _fake_download_all_succeed(dataset_id, out_dir):
    return DownloadResult(dataset_id=dataset_id, success=True, reason="fake ok (smoke test)", out_path=str(out_dir))


def _fake_download_google_azure_unreachable(dataset_id, out_dir):
    if dataset_id in ("google-cluster-cpu-memory-preprocessed", "azure-cpu-usage-small"):
        return DownloadResult(
            dataset_id=dataset_id, success=False, reason="simulated: raw.githubusercontent.com unreachable"
        )
    return DownloadResult(dataset_id=dataset_id, success=True, reason="fake ok (smoke test)", out_path=str(out_dir))


def test_stops_and_reports_when_required_github_datasets_unreachable(monkeypatch):
    monkeypatch.setattr(cli_module, "download_dataset", _fake_download_google_azure_unreachable)

    def _must_not_run(*args, **kwargs):
        raise AssertionError("ingest_all must not run once a required no-manual dataset is unreachable")

    monkeypatch.setattr(cli_module, "ingest_all", _must_not_run)

    result = runner.invoke(cli_module.app, ["train-v1-no-manual-github"])

    assert result.exit_code == 1
    assert "STOPPING" in result.stdout
    assert "google-cluster-cpu-memory-preprocessed" in result.stdout
    assert "azure-cpu-usage-small" in result.stdout


def test_happy_path_wiring_downloads_ingests_splits_trains_and_reports(monkeypatch):
    monkeypatch.setattr(cli_module, "download_dataset", _fake_download_all_succeed)
    monkeypatch.setattr(
        cli_module,
        "ingest_all",
        lambda config: [{"dataset_id": "fake_dataset", "status": "ingested", "rows": 10, "out_path": "x", "reason": ""}],
    )
    monkeypatch.setattr(cli_module, "run_split", lambda *a, **kw: {"ratios": {"train": 0.7, "val": 0.15, "test": 0.15}})
    monkeypatch.setattr(cli_module, "train_all", lambda: None)
    monkeypatch.setattr(cli_module, "evaluate_cmd", lambda *a, **kw: None)
    monkeypatch.setattr(cli_module, "status_cmd", lambda *a, **kw: None)
    fake_rows = [
        {
            "model": "resource_predictor",
            "status": "trained",
            "dataset_used": "fake_dataset (100%)",
            "label_type": "real",
            "metric_summary": "cpu_usage_percent: R2=0.9 beats_baseline",
            "beats_baseline": "yes",
            "usable_for_research": "yes",
            "reason": "fake reason for smoke test",
        }
    ]
    monkeypatch.setattr("helicyn_ml.training.readiness.assess_all", lambda **kw: fake_rows)

    result = runner.invoke(cli_module.app, ["train-v1-no-manual-github"])

    assert result.exit_code == 0
    assert "FINAL REPORT" in result.stdout
    assert "Ready to proceed to simulator prototype" in result.stdout
    assert "GPU" in result.stdout

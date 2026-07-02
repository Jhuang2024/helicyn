from pathlib import Path

import pytest

from helicyn_ml.datasets import scaleout_power, sustain_cluster
from helicyn_ml.datasets.downloader import fetch_url


def test_fetch_url_never_raises_on_network_failure(tmp_path, monkeypatch):
    import requests

    def _raise(*args, **kwargs):
        raise requests.exceptions.ConnectionError("simulated network failure")

    monkeypatch.setattr(requests, "get", _raise)
    result = fetch_url("https://example.invalid/does-not-exist.csv", tmp_path / "out.csv")
    assert result.success is False
    assert "simulated network failure" in result.reason


def test_scaleout_power_download_no_crash_no_network(tmp_path):
    result = scaleout_power.download(tmp_path)
    assert result.success is False
    assert result.manual_instructions


def test_sustain_cluster_download_no_crash_no_network(tmp_path):
    result = sustain_cluster.download(tmp_path)
    assert result.success is False
    assert result.manual_instructions


def test_unavailable_dataset_ingest_returns_empty_not_crash(tmp_path):
    empty_dir = tmp_path / "nothing_here"
    empty_dir.mkdir()
    df = scaleout_power.ingest(empty_dir)
    assert df.empty

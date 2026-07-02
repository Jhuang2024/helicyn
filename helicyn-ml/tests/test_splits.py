import pandas as pd

from helicyn_ml.preprocessing.split import run_split, time_split


def _make_workloads(n=100):
    ts = pd.date_range("2024-01-01", periods=n, freq="min", tz="UTC")
    return pd.DataFrame({"timestamp": ts, "source_dataset": "synthetic_sample", "job_id": [f"j{i}" for i in range(n)]})


def test_time_split_preserves_order_and_no_leakage():
    df = _make_workloads(100)
    splits = time_split(df)
    assert len(splits["train"]) + len(splits["val"]) + len(splits["test"]) == 100
    assert splits["train"]["timestamp"].max() <= splits["val"]["timestamp"].min()
    assert splits["val"]["timestamp"].max() <= splits["test"]["timestamp"].min()


def test_time_split_deterministic():
    df = _make_workloads(50)
    a = time_split(df)
    b = time_split(df)
    pd.testing.assert_frame_equal(a["train"].reset_index(drop=True), b["train"].reset_index(drop=True))


def test_run_split_creates_files(tmp_path):
    workloads_dir = tmp_path / "workloads"
    workloads_dir.mkdir()
    _make_workloads(100).to_parquet(workloads_dir / "sample.parquet", index=False)

    out_dir = tmp_path / "splits"
    run_split(workloads_dir, tmp_path / "missing_grid", tmp_path / "missing_weather", tmp_path / "missing_power", out_dir)

    assert (out_dir / "train" / "workloads.parquet").exists()
    assert (out_dir / "val" / "workloads.parquet").exists()
    assert (out_dir / "test" / "workloads.parquet").exists()
    assert (out_dir / "split_summary.json").exists()
    assert (out_dir / "dataset_summary.json").exists()

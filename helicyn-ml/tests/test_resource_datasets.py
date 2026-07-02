import pandas as pd

from helicyn_ml.datasets import azure_cpu_small, google_cpu_memory
from helicyn_ml.preprocessing.feature_engineering import build_resource_features
from helicyn_ml.preprocessing.split import resource_time_split
from helicyn_ml.schemas import NormalizedResourceTimeseriesRecord


def test_google_cpu_memory_parses_vm_trace_files(tmp_path):
    vm_dir = tmp_path / "GCD_VMs"
    vm_dir.mkdir()
    # Real files are whitespace-delimited "cpu_pct memory_pct" per line, no header.
    (vm_dir / "vm_1").write_text("10.5 20.1\n15.0 25.0\n12.3 22.2\n")
    (vm_dir / "vm_2").write_text("50.0 60.0\n55.5 61.1\n")

    df = google_cpu_memory.ingest(tmp_path)

    assert len(df) == 5
    assert set(df["vm_id"]) == {"vm_1", "vm_2"}
    assert (df["source_dataset"] == "google_cluster_cpu_memory_preprocessed").all()
    assert (df["timestamp_is_relative"] == True).all()  # noqa: E712
    assert df["timestamp"].isna().all()  # no fabricated real timestamps
    vm1 = df[df["vm_id"] == "vm_1"].sort_values("time_index")
    assert vm1["cpu_usage_percent"].tolist() == [10.5, 15.0, 12.3]
    assert vm1["memory_usage_percent"].tolist() == [20.1, 25.0, 22.2]
    assert vm1["time_index"].tolist() == [0, 1, 2]
    assert (df["interval_minutes"] == 5.0).all()

    # Every row must validate against the real schema.
    row = df.iloc[0].to_dict()
    row["time_index"] = int(row["time_index"])
    NormalizedResourceTimeseriesRecord.model_validate(row)


def test_google_cpu_memory_ingest_empty_dir_returns_empty(tmp_path):
    empty = tmp_path / "nothing"
    empty.mkdir()
    df = google_cpu_memory.ingest(empty)
    assert df.empty


def test_azure_cpu_small_parses_csv(tmp_path):
    csv_path = tmp_path / "azure.csv"
    csv_path.write_text(
        "timestamp,min cpu,max cpu,avg cpu\n"
        "2021-01-01T00:00:00Z,600000,2000000,1000000\n"
        "2021-01-01T00:05:00Z,650000,2100000,1050000\n"
    )

    df = azure_cpu_small.ingest(tmp_path)

    assert len(df) == 2
    assert (df["source_dataset"] == "azure_cpu_usage_small").all()
    assert (df["vm_id"] == "azure_aggregate").all()
    assert (df["timestamp_is_relative"] == False).all()  # noqa: E712
    assert df["timestamp"].notna().all()
    assert df["min_cpu_usage_percent"].tolist() == [600000.0, 650000.0]
    assert df["max_cpu_usage_percent"].tolist() == [2000000.0, 2100000.0]
    assert df["avg_cpu_usage_percent"].tolist() == [1000000.0, 1050000.0]
    # Values are stored as-is, never rescaled into a fabricated 0-100 percentage.
    assert df["avg_cpu_usage_percent"].max() > 100

    row = df.iloc[0].to_dict()
    row["timestamp"] = pd.Timestamp(row["timestamp"]).to_pydatetime()
    row["time_index"] = int(row["time_index"])
    NormalizedResourceTimeseriesRecord.model_validate(row)


def test_azure_cpu_small_ingest_no_csv_returns_empty(tmp_path):
    empty = tmp_path / "nothing"
    empty.mkdir()
    df = azure_cpu_small.ingest(empty)
    assert df.empty


def test_neither_loader_produces_a_gpu_column(tmp_path):
    vm_dir = tmp_path / "google" / "GCD_VMs"
    vm_dir.mkdir(parents=True)
    (vm_dir / "vm_1").write_text("10.0 20.0\n")
    google_df = google_cpu_memory.ingest(tmp_path / "google")

    azure_dir = tmp_path / "azure"
    azure_dir.mkdir()
    (azure_dir / "azure.csv").write_text("timestamp,min cpu,max cpu,avg cpu\n2021-01-01T00:00:00Z,1,2,3\n")
    azure_df = azure_cpu_small.ingest(azure_dir)

    for df in (google_df, azure_df):
        assert not any("gpu" in c.lower() for c in df.columns)


def test_resource_time_split_no_leakage_across_vms():
    frames = []
    for vm in ("vm_a", "vm_b"):
        n = 100
        frames.append(
            pd.DataFrame(
                {
                    "source_dataset": "google_cluster_cpu_memory_preprocessed",
                    "vm_id": vm,
                    "timestamp": None,
                    "time_index": range(n),
                    "timestamp_is_relative": True,
                    "cpu_usage_percent": range(n),
                }
            )
        )
    df = pd.concat(frames, ignore_index=True)

    splits = resource_time_split(df)
    total = sum(len(s) for s in splits.values())
    assert total == len(df)

    for vm in ("vm_a", "vm_b"):
        train_idx = splits["train"].loc[splits["train"]["vm_id"] == vm, "time_index"]
        val_idx = splits["val"].loc[splits["val"]["vm_id"] == vm, "time_index"]
        test_idx = splits["test"].loc[splits["test"]["vm_id"] == vm, "time_index"]
        # Within one VM's own relative time_index, train must strictly precede
        # val must strictly precede test - no shuffling, no leakage.
        assert train_idx.max() < val_idx.min()
        assert val_idx.max() < test_idx.min()

    # vm_a's indices must never appear mixed with vm_b's split boundaries -
    # each VM is split independently on its own timeline.
    train_vm_a_max = splits["train"].loc[splits["train"]["vm_id"] == "vm_a", "time_index"].max()
    train_vm_b_max = splits["train"].loc[splits["train"]["vm_id"] == "vm_b", "time_index"].max()
    assert train_vm_a_max == train_vm_b_max  # symmetric inputs -> symmetric split sizes


def test_build_resource_features_lag_never_crosses_vm_boundary():
    frames = []
    for vm, base in (("vm_a", 0.0), ("vm_b", 1000.0)):
        n = 20
        frames.append(
            pd.DataFrame(
                {
                    "source_dataset": "google_cluster_cpu_memory_preprocessed",
                    "vm_id": vm,
                    "time_index": range(n),
                    "cpu_usage_percent": [base + i for i in range(n)],
                    "memory_usage_percent": [base + i for i in range(n)],
                }
            )
        )
    df = pd.concat(frames, ignore_index=True)
    features = build_resource_features(df)

    vm_b_first_row = features[(features["vm_id"] == "vm_b") & (features["time_index"] == 0)].iloc[0]
    # The first row of vm_b must not see vm_a's trailing values as its lag.
    assert pd.isna(vm_b_first_row["lag_cpu_usage_percent_1"])

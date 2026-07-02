# Google ClusterData CPU/Memory Utilization (preprocessed)

## Source repo

https://github.com/HiPro-IT/CPU-and-Memory-resource-usage-from-Google-Cluster-Data

A preprocessed extraction from the original Google Cluster Data (2011),
published alongside "Virtual Machine Consolidation with Multiple Usage
Prediction for Energy-Efficient Cloud Data Centers" (IEEE Transactions on
Services Computing). Confirmed reachable via `raw.githubusercontent.com`
(the repo's `master` branch, not `main`) - see
`artifacts/reports/github_resource_dataset_recon.md` for the exact recon.

## What it contains

- 1,600 files, each named `vm_<id>_<n>`, each a 288-row (24h at 5-minute
  intervals), 2-column, whitespace-delimited plain text file.
- Column 1: CPU utilization (%). Column 2: memory utilization (%).
- Tasks were aggregated by summing CPU/memory consumption every 5 minutes
  over a 24-hour period, extracted from the first 10 days of May 2011,
  filtered to keep only 5-90% utilization.

## What it trains

- `ResourcePredictor` targets `cpu_usage_percent` and `memory_usage_percent`
  as real time-series regression problems (with lag/rolling/cyclic-time
  features - see `docs/model_design.md`).
- This is the first dataset in this project with **real, non-degenerate
  CPU *and* memory usage labels** (BurstGPT provides 0% coverage for both).

## What it cannot train

- **No GPU data at all.** `NormalizedResourceTimeseriesRecord` has no GPU
  field, deliberately - this dataset (and every resource dataset currently
  supported) has none, and no default/zero value is fabricated for it. Any
  claim of a GPU-aware ResourcePredictor from this data would be false.
- **No SLA / deadline-miss data.**
- **No power, cooling, or PUE data.**
- **No real calendar timestamps.** Each VM's 288 rows are a self-contained
  24-hour sequence with no absolute date/time information in the source
  files. This loader assigns `time_index = 0..287` per VM and
  `timestamp_is_relative = true`, and never fabricates a real datetime.
  Do not join this data against real-world calendar events (holidays,
  business hours in a specific timezone, etc.) - there is no such
  information here.
- **No resource *requests*, only usage.** `cpu_request`/`memory_request`
  are always null for this dataset - only measured utilization is reported.
- **Not raw Google ClusterData.** This is the paper authors' 5-minute
  pre-aggregation, not the original per-task trace. If per-task granularity
  matters, the original `google-2019-local` (BigQuery, manual) loader is a
  separate, unrelated path.

## Exact commands

```bash
python -m helicyn_ml datasets download \
  --dataset google-cluster-cpu-memory-preprocessed \
  --out data/raw/google_cpu_memory

python -m helicyn_ml ingest \
  --dataset google-cluster-cpu-memory-preprocessed \
  --input data/raw/google_cpu_memory \
  --out data/processed/resources/google_cpu_memory.parquet
```

`source_dataset` is stamped `google_cluster_cpu_memory_preprocessed` on
every row so it can be identified and filtered downstream, and so it is
never confused with the original raw Google ClusterData 2019 trace
(`google-2019-local`), which is a different, much larger dataset requiring
BigQuery access.

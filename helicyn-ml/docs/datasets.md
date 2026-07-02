# Datasets

Full field-level detail is also available at runtime via
`python -m helicyn_ml datasets describe <dataset_id>`.

## Alibaba ClusterData (`alibaba-v2018`, `alibaba-gpu-v2020`)

- **Source**: https://github.com/alibaba/clusterdata
- **Purpose**: production batch (2018) and GPU/AI (2020) cluster workload traces.
- **Teaches Helicyn**: GPU job arrivals, training/inference workload behavior,
  resource requests, machine/task structure, scheduling/fragmentation patterns.
- **Columns expected**: `job_name`/`task_name`, `start_time`/`end_time`,
  `plan_cpu`/`plan_mem`/`plan_gpu` (2020 only).
- **Limitations**: v2018 has no GPU fields; the full traces (tens of GB) require
  the Aliyun OSS download links documented in each trace's README, not a
  direct `wget`; only a small in-repo CSV sample auto-downloads.
- **Automatic download**: partial (small sample only; full trace is manual).

## Azure Public Dataset (`azure-public`, `azure-llm-2024`, `azure-functions-2019`)

- **Source**: https://github.com/Azure/AzurePublicDataset
- **Purpose**: cloud VM lifetime traces, serverless invocation traces, and
  real LLM inference request traces.
- **Teaches Helicyn**: VM lifetime/resource demand (`azure-public`, has real
  `duration_seconds` via start/end VM timestamps - a candidate for
  `RuntimePredictor` training once downloaded), request burstiness
  (`azure-functions-2019`), LLM input/output token patterns
  (`azure-llm-2024`).
- **Columns expected**: VM traces - `vmId`, `starttime`/`endtime`, core count
  bucket. Functions traces - `HashFunction`, `Trigger`, 1440 per-minute
  invocation-count columns. LLM traces - `Timestamp`, `ContextTokens`,
  `GeneratedTokens`.
- **Limitations**:
  - `azure-public` (VM traces): 235GB / 156GB compressed across 198 files on
    Azure Blob Storage - not fetchable via a single URL, manual only.
  - `azure-functions-2019`: distributed as a single GitHub Release `.tar.xz`
    asset; some network policies block GitHub Release downloads even when
    plain-file GitHub raw access works (this project's own sandboxed CI is
    one such environment - the download code is correct and will succeed
    elsewhere). A coarse per-function daily aggregate, not per-invocation
    events.
  - `azure-llm-2024`: no CPU/GPU/memory/duration fields at all (same gap as
    BurstGPT for those models).
- **Automatic download**: yes for `azure-llm-2024` and `azure-functions-2019`
  (network policy permitting); manual for `azure-public`.

## Google ClusterData 2019 (`google-2019-local`)

- **Source**: https://github.com/google/cluster-data (BigQuery public dataset)
- **Purpose**: large-scale Borg CPU/memory workload traces at 5-minute resolution.
- **Teaches Helicyn**: CPU/memory utilization patterns, 5-minute usage windows,
  job/task behavior at cluster scale.
- **Columns expected**: `collection_id`/`instance_index`, `start_time`,
  `resource_request_cpus`/`average_usage_cpus`, memory equivalents.
- **Limitations**: full dataset is ~2.4 TiB in BigQuery - never downloaded whole.
  Requires a manual BigQuery export (or `google-cloud-bigquery` + GCP creds via
  the optional `bigquery_export()` helper) placed under
  `data/raw/google/clusterdata2019_sample/`. No GPU fields.
- **Automatic download**: no (BigQuery credentials required).

## BurstGPT (`burstgpt`)

- **Source**: https://github.com/HPMLL/BurstGPT
- **Purpose**: real-world bursty LLM serving workload trace.
- **Teaches Helicyn**: bursty LLM serving demand, request arrival patterns,
  input/output token length distributions, model mix.
- **Columns expected**: `Timestamp`, `Model`, `Request tokens`, `Response tokens`.
- **Model support**:
  - **Supports**: `WorkloadForecaster` (LLM demand/arrival forecasting - this is
    what BurstGPT is actually good for).
  - **Does NOT support**: `RuntimePredictor` (no duration/start-end fields),
    `ResourcePredictor` (no CPU/GPU/memory usage fields), a trustworthy
    `SLARiskModel` (no real duration means the weak-label queueing simulation
    degenerates - see `docs/model_design.md`), `PowerPredictor` (no power
    measurements), or full `PolicyRanker` training diversity on its own
    (100% of jobs are `latency_sensitive`, which used to eliminate all delay
    candidates until the short-delay-budget fix - see `docs/model_design.md`).
  - Run `python -m helicyn_ml status` after training to see the exact,
    current per-model verdict rather than relying on this static list.
- **Limitations**: no GPU type, batch size, or facility power info; no job
  "runtime" concept (it's a request trace, not a job trace).
- **Automatic download**: yes.

## Electricity Maps (`electricity-maps-sample`, `electricity-maps`)

- **Source**: https://www.electricitymaps.com/
- **Purpose**: grid carbon intensity signal for carbon-aware scheduling.
- **Teaches Helicyn**: temporal/regional carbon intensity patterns.
- **Columns expected**: `timestamp`, `region`/`zone`, `carbonIntensity` (or
  `carbon_intensity_gco2e_per_kwh`), optional renewable/fossil-free percentage.
- **Limitations**: free tier has no bulk historical CSV export; live pulls need
  `ELECTRICITY_MAPS_API_KEY`. Without a key or a local CSV, falls back to a
  generated synthetic diurnal carbon-intensity sample (clearly labeled
  `source_dataset=synthetic_sample`, never presented as real).
- **Automatic download**: yes, with fallback (no key required for the fallback).

## GridStatus (`gridstatus`)

- **Source**: https://github.com/gridstatus/gridstatus
- **Purpose**: electricity price and grid load signal (CAISO, ERCOT, PJM,
  NYISO, IESO, AESO).
- **Teaches Helicyn**: electricity price variation, grid load patterns.
- **Columns expected**: `timestamp`, `region`, `price_usd_per_mwh`, `grid_load_mw`.
- **Limitations**: requires the optional `gridstatus` package and live ISO
  data-portal access; falls back to a generated synthetic price/load sample.
- **Automatic download**: yes, with fallback.

## Open-Meteo (`open-meteo-sample`, `open-meteo`)

- **Source**: https://open-meteo.com/
- **Purpose**: ambient temperature/humidity as a cooling-load proxy.
- **Teaches Helicyn**: ambient temperature patterns relevant to thermal-aware
  placement and free-cooling opportunities.
- **Columns expected**: `timestamp`, `region`, `temperature_2m`, `relative_humidity_2m`.
- **Limitations**: no key required, but the API may be unreachable from
  sandboxed/offline environments; falls back to a generated synthetic
  seasonal temperature sample in that case.
- **Automatic download**: yes, with fallback.

## Scaleout Power Consumption Tutorial Dataset (`scaleout-power`)

- **Source**: Scaleout Systems' power-prediction tutorial materials (no
  guaranteed stable direct-download URL).
- **Purpose**: small supervised power-prediction demo (utilization -> power draw).
- **Teaches Helicyn**: mapping from CPU/network utilization to measured power draw.
- **Columns expected**: `timestamp`, `cpu_usage`/`network_usage`, `power_kw` (or
  `power_watts`).
- **Limitations**: no stable public URL; must be placed manually under
  `data/raw/scaleout_power/`. If absent, the power predictor runs in
  **analytical fallback** mode instead of training on absent/insufficient
  real data (see `docs/model_design.md`).
- **Automatic download**: no.

## Google ClusterData CPU/Memory Utilization, preprocessed (`google-cluster-cpu-memory-preprocessed`)

- **Source**: https://github.com/HiPro-IT/CPU-and-Memory-resource-usage-from-Google-Cluster-Data
- **Purpose**: real per-VM CPU and memory utilization time series for training `ResourcePredictor`.
- **Teaches Helicyn**: real CPU and memory utilization patterns per VM at 5-minute resolution over 24 hours.
- **Columns expected**: 2 whitespace-delimited columns per file, no header (`cpu_usage_percent`, `memory_usage_percent`).
- **Limitations**: pre-aggregated (summed per 5-minute window) from the original Google ClusterData by the paper's
  authors, not the raw per-task trace; pre-filtered to 5-90% utilization; no real calendar timestamps (each VM is a
  self-contained 24h/288-row sequence - normalized with `timestamp_is_relative=true`); no GPU, no resource
  *requests* (usage only); no SLA/power/PUE data. See `docs/google_cpu_memory_preprocessed.md` for full detail.
- **Automatic download**: yes (verified working - see `artifacts/reports/github_resource_dataset_recon.md`).

## Azure VM Aggregate CPU Usage, small (`azure-cpu-usage-small`)

- **Source**: https://github.com/amcs1729/Predicting-cloud-CPU-usage-on-Azure-data
- **Purpose**: CPU-only supplementary time series for `ResourcePredictor` / demand forecasting.
- **Teaches Helicyn**: real min/max/avg CPU demand time series at 5-minute resolution over 30 real calendar days.
- **Columns expected**: `timestamp, min cpu, max cpu, avg cpu` (comma-delimited, header row).
- **Limitations**: CPU-only (no memory, no GPU); single aggregate series, not per-VM; **values are NOT a bounded
  0-100 percentage** despite the column naming - unit is unconfirmed (discovered during recon, not fabricated
  around) and stored as-is, never rescaled.
- **Automatic download**: yes (verified working - see `artifacts/reports/github_resource_dataset_recon.md`).

## Alibaba Cluster Usage Traces 2018, preprocessed - NOT USABLE (`MertYILDIZ19/Alibaba_cluster_usage_traces_2018`)

- **Source**: https://github.com/MertYILDIZ19/Alibaba_cluster_usage_traces_2018
- **Status**: recon only, **not implemented**. The GitHub repo contains only a README; the actual preprocessed
  data files are hosted on Google Drive, which is blocked by this environment's network policy and is a
  manual/interactive download path in general. See `artifacts/reports/github_resource_dataset_recon.md`.

## SustainCluster / SustainDC (`sustain-cluster`)

- **Source**: https://github.com/HewlettPackard/dc-rl
- **Purpose**: reference benchmark for schema alignment with future simulator
  work - not a primary training dataset.
- **Teaches Helicyn**: reference field naming for site/rack/server power and
  thermal signals.
- **Limitations**: optional; this project does not reuse its simulator code.
- **Automatic download**: no.

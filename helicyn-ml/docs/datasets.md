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

## Azure Public Dataset (`azure-public`, `azure-llm-2024`)

- **Source**: https://github.com/Azure/AzurePublicDataset
- **Purpose**: cloud VM lifetime traces and real LLM inference request traces.
- **Teaches Helicyn**: VM lifetime/resource demand, request burstiness,
  LLM input/output token patterns, serverless/online workload shape.
- **Columns expected**: VM traces - `vmId`, `starttime`/`endtime`, core count
  bucket. LLM traces - `Timestamp`, `ContextTokens`, `GeneratedTokens`.
- **Limitations**: VM/Functions traces are large CSVs on Azure Storage, not
  auto-downloadable; only the LLM inference CSVs (checked into GitHub) are.
- **Automatic download**: yes for `azure-llm-2024`; manual for `azure-public`.

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
- **Limitations**: no GPU type, batch size, or facility power info; no job
  "runtime" concept (it's a request trace, not a job trace), so it cannot
  train the runtime predictor or resource-usage predictor by itself.
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

## SustainCluster / SustainDC (`sustain-cluster`)

- **Source**: https://github.com/HewlettPackard/dc-rl
- **Purpose**: reference benchmark for schema alignment with future simulator
  work - not a primary training dataset.
- **Teaches Helicyn**: reference field naming for site/rack/server power and
  thermal signals.
- **Limitations**: optional; this project does not reuse its simulator code.
- **Automatic download**: no.

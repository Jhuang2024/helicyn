# GitHub Resource-Utilization Dataset Recon

Date: 2026-07-02
Scope: reconnaissance for real/preprocessed CPU/memory utilization datasets reachable without Alibaba OSS, Azure Release assets, or Bitbrains (all confirmed blocked in prior recon).

## 1. HiPro-IT/CPU-and-Memory-resource-usage-from-Google-Cluster-Data

- **Reachable**: **yes**
- **Exact commands used**:
  - `git clone --depth 1 https://github.com/HiPro-IT/CPU-and-Memory-resource-usage-from-Google-Cluster-Data.git` -> failed (this sandbox's git proxy is scoped only to `Jhuang2024/helicyn`; `fatal: unable to access ... 403`). Not usable for arbitrary repos in this environment.
  - `curl -sI https://raw.githubusercontent.com/HiPro-IT/CPU-and-Memory-resource-usage-from-Google-Cluster-Data/master/README.md` -> `HTTP/2 200`, 1205 bytes. (Note: `main` branch 404s; `master` is the default branch.)
  - `curl -sI https://raw.githubusercontent.com/.../master/GCD_VMs.tar.gz` -> `HTTP/2 200`, `content-length: 3253406` (3.25MB)
  - Downloaded and extracted: `tar -xzf GCD_VMs.tar.gz`
- **Files found**: `GCD_VMs/` directory containing exactly **1,600 files**, named `vm_<numeric_id>_<n>` (no extension, plain text).
- **Sample rows** (`vm_5544436380_8`, space-delimited, first 3 of 288 lines):
  ```
  58.713 10.115200000000002
  58.282999999999994 10.1457
  58.169000000000004 10.132600000000002
  ```
- **Inferred schema**: 2 whitespace-delimited columns, no header row, no timestamp column. Column 1 = CPU utilization %, column 2 = memory utilization % (per README, both bounded roughly 5-90 per the paper's stated filter). Exactly 288 rows per file (24h / 5min = 288), confirmed by `wc -l` on multiple sampled files.
- **usable_for_resource_predictor**: **yes**
- **Reason**: Real, reachable, small (3.25MB), matches the README's documented format exactly (verified, not assumed), gives real CPU *and* memory utilization percentages across 1,600 independent traces - directly fills the gap BurstGPT cannot (0% usage-label coverage).

## 2. amcs1729/Predicting-cloud-CPU-usage-on-Azure-data

- **Reachable**: **yes**
- **Exact commands used**:
  - `curl -sI https://raw.githubusercontent.com/amcs1729/Predicting-cloud-CPU-usage-on-Azure-data/main/azure.csv` -> `404` (no `main` branch)
  - `curl -sI https://raw.githubusercontent.com/.../master/azure.csv` -> `HTTP/2 200`, `content-length: 647858` (633KB)
- **Files found**: single file `azure.csv`, 8,640 rows (30 days at 5-minute intervals: 30*24*12=8640, consistent).
- **Sample rows**:
  ```
  timestamp,min cpu,max cpu,avg cpu
  2017-01-01 00:00:00,715146.536821001,2223302.432966985,1229569.3712429872
  2017-01-01 00:05:00,700473.840324006,2212393.245714982,1211321.7086810155
  ```
- **Inferred schema**: 4 comma-delimited columns with header: `timestamp, min cpu, max cpu, avg cpu`. Real calendar timestamps at 5-minute intervals.
- **IMPORTANT CAVEAT discovered during recon**: `describe()` on the full column shows `min cpu` in [586226, 1151024], `max cpu` in [1823027, 3529283], `avg cpu` in [978638, 1821756]. **These are NOT bounded 0-100 percentages** despite the "cpu" naming - they are some raw aggregate usage magnitude (unit not stated in the repo; likely a summed/aggregate compute-demand metric across a VM fleet, not a single VM's percent utilization). This is reported here rather than silently treated as a percentage - see Task D's ingestion notes and `docs/dataset_downloads.md` for how this is surfaced downstream (stored as-is, documented as unit-unconfirmed, never rescaled to a fabricated 0-100 range).
- **usable_for_resource_predictor**: **yes, with the above caveat documented everywhere it's used**
- **Reason**: Real, reachable, small (633KB), real timestamps, three real (if unit-ambiguous) CPU signals aggregated over time - usable as a CPU-only regression target, not to be presented as "percent utilization" without the caveat.

## 3. MertYILDIZ19/Alibaba_cluster_usage_traces_2018

- **Reachable (README only)**: yes. **Reachable (actual data)**: **no**.
- **Exact commands used**:
  - `curl -sI https://raw.githubusercontent.com/MertYILDIZ19/Alibaba_cluster_usage_traces_2018/main/README.md` -> `200`
  - Probed likely data filenames in the repo root (`task_level.csv`, `job_level.csv`, `alibaba_task_level.csv`, `alibaba_job_level.csv`, `data.csv`, `dataset.zip`, `preprocessed.zip`) -> **all `404`**. No actual data file exists anywhere findable in the repo itself.
  - The README's own "Data Access" section states the preprocessed files are hosted externally on **Google Drive**: `https://drive.google.com/file/d/1cpPzKniycAscAdWC28Lns-5h7qlvR2Qq/view?usp=drive_link`
  - `curl -sI https://drive.google.com/file/d/.../view` -> `403 Forbidden` (same sandbox-proxy `host_not_allowed` pattern seen for `aliyuncs.com` and GitHub Release assets in prior recon)
- **Files found**: none in the repository itself - only `README.md`.
- **Sample rows**: none available (documented table in the README is illustrative example data, not a fetched sample - explicitly not used as if it were verified).
- **Inferred schema**: per README only (unverified): `Job_ID, Task_ID, Arrival_Time, CPU, Memory`, two separate files (task-level and job-level).
- **usable_for_resource_predictor**: **no**
- **Reason**: This repo does not contain the dataset - it contains only documentation pointing to a Google Drive link, which is (a) blocked by this sandbox's network policy and (b) a manual/interactive download path in general (Google Drive links commonly require a browser confirmation step for scanning), which the task explicitly rules out ("Manual download/upload is not an option"). **No loader was implemented for this dataset.**

## Summary

| Repo | Reachable | Actual data reachable | Used |
|---|---|---|---|
| HiPro-IT/CPU-and-Memory-resource-usage-from-Google-Cluster-Data | yes | yes (`GCD_VMs.tar.gz`, 3.25MB) | **yes** - `google-cluster-cpu-memory-preprocessed` |
| amcs1729/Predicting-cloud-CPU-usage-on-Azure-data | yes | yes (`azure.csv`, 633KB) | **yes** - `azure-cpu-usage-small` |
| MertYILDIZ19/Alibaba_cluster_usage_traces_2018 | yes (README only) | **no** (Google Drive, blocked) | **no** - marked unusable |

Non-target `xumengwei/EdgeWorkloadsTraces` was not tested (explicitly excluded per task instructions - form-gated).

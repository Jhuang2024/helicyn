# Dataset download commands

## Runs automatically in `python -m helicyn_ml demo` / `datasets download --dataset all-small`

| dataset_id | command | notes |
|---|---|---|
| `burstgpt` | `python -m helicyn_ml datasets download --dataset burstgpt --out data/raw/burstgpt` | real GitHub CSV, no credentials. Confirmed working (~1.4M rows). |
| `google-cluster-cpu-memory-preprocessed` | `python -m helicyn_ml datasets download --dataset google-cluster-cpu-memory-preprocessed --out data/raw/google_cpu_memory` | real GitHub-hosted `.tar.gz` (3.25MB), auto-extracted. **Confirmed working** - 1,600 files, 460,800 rows after ingest. Real CPU+memory usage - see `docs/google_cpu_memory_preprocessed.md`. |
| `azure-cpu-usage-small` | `python -m helicyn_ml datasets download --dataset azure-cpu-usage-small --out data/raw/azure_cpu_small` | real GitHub-hosted CSV (633KB). **Confirmed working** - 8,640 rows after ingest. CPU-only; values are not a bounded percentage despite naming (see `docs/datasets.md`). |
| `alibaba-v2018` | `python -m helicyn_ml datasets download --dataset alibaba-v2018 --out data/raw/alibaba/v2018` | real Aliyun OSS file (`batch_task.tar.gz`, ~125MB, auto-extracted). Blocked by network policies that don't allow the `aliyuncs.com` host (including this project's own sandboxed CI) - falls back gracefully with exact manual instructions. |
| `electricity-maps-sample` | `python -m helicyn_ml datasets download --dataset electricity-maps-sample --out data/raw/electricity_maps` | tries the live API if `ELECTRICITY_MAPS_API_KEY` is set, else generates a synthetic sample |
| `open-meteo-sample` | `python -m helicyn_ml datasets download --dataset open-meteo-sample --out data/raw/open_meteo` | free API, no key; falls back to synthetic sample if unreachable |
| `scaleout-power` | `python -m helicyn_ml datasets download --dataset scaleout-power --out data/raw/scaleout_power` | no stable auto-download source; always prints manual instructions and continues |

## Larger / manual datasets

| dataset_id | command | requires |
|---|---|---|
| `alibaba-gpu-v2020` | `python -m helicyn_ml datasets download --dataset alibaba-gpu-v2020 --out data/raw/alibaba/gpu-v2020` | real Aliyun OSS file (`pai_job_table.tar.gz`, job-level table, auto-extracted); same `aliyuncs.com` host restriction as above. Full 7-table trace is tens of GB - see `datasets describe alibaba-gpu-v2020` |
| `azure-llm-2024` | `python -m helicyn_ml datasets download --dataset azure-llm-2024 --out data/raw/azure/llm-2024` | real GitHub CSVs (both `_conv.csv` and `_code.csv`, ~700KB each), no credentials |
| `azure-functions-2019` | `python -m helicyn_ml datasets download --dataset azure-functions-2019 --out data/raw/azure/functions-2019` | real GitHub Release `.tar.xz` asset, auto-extracted. Some network policies block GitHub Release downloads (including this project's own sandboxed CI) even when plain-file raw.githubusercontent.com access works - falls back gracefully. |
| `azure-public` | manual only | Azure Blob Storage links in `AzurePublicDatasetLinksV2.txt` (198 files, 235GB / 156GB compressed) |
| `google-2019-local` | manual only | `GOOGLE_APPLICATION_CREDENTIALS` + BigQuery, or a manually exported CSV sample |
| `gridstatus` | `python -m helicyn_ml datasets download --dataset gridstatus --out data/raw/gridstatus` | optional `gridstatus` package + live ISO access; falls back to synthetic sample |
| `sustain-cluster` | manual only | optional reference dataset, not required |

## The `all-small` bundle

```bash
python -m helicyn_ml datasets download --dataset all-small --out data/raw
```

Downloads (or falls back to a clearly-labeled synthetic sample for)
`burstgpt`, `alibaba-v2018`, `electricity-maps-sample`, `open-meteo-sample`,
and `scaleout-power` - the smallest practical bundle for an end-to-end smoke
test. This is exactly what `python -m helicyn_ml demo` runs first.

## What requires credentials

| env var | used by |
|---|---|
| `ELECTRICITY_MAPS_API_KEY` | `electricity_maps.fetch_api()` (optional; falls back to synthetic sample without it) |
| `GOOGLE_APPLICATION_CREDENTIALS` | `google_clusterdata_2019.bigquery_export()` (optional; never required) |

No credential is ever required for tests or for `python -m helicyn_ml demo`
to complete.

## What's genuinely too large to ever auto-download

`alibaba-gpu-v2020`'s and `alibaba-v2018`'s *full* multi-table traces (tens
of GB via Aliyun OSS - only the single smallest table auto-downloads),
`azure-public`'s VM trace (235GB across 198 files on Azure Blob Storage),
and `google-2019-local`'s full BigQuery dataset (~2.4 TiB) are never fetched
in full automatically, in any environment. Each loader prints the exact
manual steps when its automatic path isn't available.

## What's blocked only by this project's own sandboxed network policy

`alibaba-v2018`'s smallest table, `alibaba-gpu-v2020`'s smallest table, and
`azure-functions-2019` all have real, correct, working download URLs in this
codebase - they were verified to 200 OK / return real file sizes during
development. They fail in this project's own sandboxed CI environment
specifically because its network proxy blocks the `aliyuncs.com` and GitHub
Release-asset hosts outright (`host_not_allowed` / 403), not because the URLs
are wrong. In a normal developer machine or a less restrictive CI environment
these commands are expected to succeed.

The Bitbrains/GWA-T-12/T-13 official host (`atlarge-research.com`) is
blocked the same way - see `artifacts/reports/bitbrains_recon.md`.

Plain-file GitHub raw content (`raw.githubusercontent.com`) is **not**
blocked, which is why `burstgpt`, `google-cluster-cpu-memory-preprocessed`,
and `azure-cpu-usage-small` all work reliably in this environment - only
`api.github.com`, `github.com` repo/release pages, and non-GitHub hosts
like `aliyuncs.com`/`atlarge-research.com` are restricted.
`MertYILDIZ19/Alibaba_cluster_usage_traces_2018` is reachable as a repo
(raw README fetches fine) but its actual data lives on Google Drive, which
*is* blocked - see `artifacts/reports/github_resource_dataset_recon.md`.
No loader was implemented for it.

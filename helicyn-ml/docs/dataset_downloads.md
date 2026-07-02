# Dataset download commands

## Runs automatically in `python -m helicyn_ml demo` / `datasets download --dataset all-small`

| dataset_id | command | notes |
|---|---|---|
| `burstgpt` | `python -m helicyn_ml datasets download --dataset burstgpt --out data/raw/burstgpt` | real GitHub CSV, no credentials |
| `alibaba-v2018` | `python -m helicyn_ml datasets download --dataset alibaba-v2018 --out data/raw/alibaba/v2018` | small in-repo sample; may 404 if the sample path moves upstream, falls back gracefully |
| `electricity-maps-sample` | `python -m helicyn_ml datasets download --dataset electricity-maps-sample --out data/raw/electricity_maps` | tries the live API if `ELECTRICITY_MAPS_API_KEY` is set, else generates a synthetic sample |
| `open-meteo-sample` | `python -m helicyn_ml datasets download --dataset open-meteo-sample --out data/raw/open_meteo` | free API, no key; falls back to synthetic sample if unreachable |
| `scaleout-power` | `python -m helicyn_ml datasets download --dataset scaleout-power --out data/raw/scaleout_power` | no stable auto-download source; always prints manual instructions and continues |

## Larger / manual datasets

| dataset_id | command | requires |
|---|---|---|
| `alibaba-gpu-v2020` | `python -m helicyn_ml datasets download --dataset alibaba-gpu-v2020 --out data/raw/alibaba/gpu-v2020` | manual OSS download (tens of GB); see `datasets describe alibaba-gpu-v2020` |
| `azure-llm-2024` | `python -m helicyn_ml datasets download --dataset azure-llm-2024 --out data/raw/azure/llm-2024` | real GitHub CSV, no credentials, but larger than the all-small bundle |
| `azure-public` | manual only | Azure Storage blob links in `AzurePublicDatasetV2.md`, tens of GB |
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

## What's simply too large to auto-download

`alibaba-gpu-v2020` (tens of GB via Aliyun OSS), `azure-public` VM/Functions
traces (tens of GB on Azure Storage), and `google-2019-local`'s full BigQuery
dataset (~2.4 TiB) are never fetched in full automatically. Each loader
prints the exact manual steps when its automatic path isn't available.

# Normalized schemas

All schemas are defined as Pydantic models in `helicyn_ml/schemas/` so every
dataset loader converges on the same shape regardless of source. Fields not
reported by a given dataset are left `null` - they are never fabricated.

## NormalizedWorkloadRecord (`normalized_workload.py`)

One job/task/request from any workload dataset.

| field | type | units / notes |
|---|---|---|
| `source_dataset` | str | e.g. `burstgpt`, `alibaba-v2018`, `synthetic_sample` |
| `record_id`, `job_id`, `task_id` | str | task_id optional (not all datasets have sub-tasks) |
| `timestamp`, `arrival_time` | datetime (UTC) | required |
| `start_time`, `end_time`, `duration_seconds` | datetime / float (s) | optional; only present for completed jobs |
| `workload_type` | enum | `batch`, `online_service`, `vm`, `serverless`, `llm_inference`, `lmm_inference`, `gpu_training`, `gpu_inference`, `cpu_batch`, `unknown` |
| `cpu_request`/`cpu_usage` | float (cores) | usage only where the dataset reports it |
| `memory_request_gb`/`memory_usage_gb` | float (GB) | |
| `gpu_request`/`gpu_usage` | float (GPU count) | |
| `gpu_memory_request_gb`/`gpu_memory_usage_gb` | float (GB) | |
| `input_tokens`/`output_tokens` | int | LLM/LMM inference only |
| `estimated_work_units` | float | heuristic proxy combining tokens/CPU, used only where no better signal exists |
| `priority`, `scheduling_class` | float / str | dataset-specific scale, not normalized across datasets |
| `preemptible`, `latency_sensitive` | bool | |
| `region`, `machine_id`, `pod_id`, `owner_id_hash` | str | anonymized identifiers where available |
| `raw_metadata_json` | str | escape hatch for dataset-specific fields not otherwise modeled |

## NormalizedGridRecord (`normalized_grid.py`)

| field | units |
|---|---|
| `carbon_intensity_gco2e_per_kwh` | gCO2e/kWh |
| `renewable_percentage`, `carbon_free_percentage` | % (0-100) |
| `electricity_price_usd_per_mwh` | USD/MWh |
| `grid_load_mw` | MW |

## NormalizedWeatherRecord (`normalized_weather.py`)

| field | units |
|---|---|
| `ambient_temp_c` | °C (required) |
| `relative_humidity` | % (0-100) |
| `wet_bulb_temp_c` | °C, Stull (2011) approximation from temp+humidity where both are available |

## NormalizedPowerRecord (`normalized_power.py`)

| field | units |
|---|---|
| `cpu_usage`, `gpu_usage`, `memory_usage`, `network_usage` | fraction (0-1) or dataset-native scale |
| `ambient_temp_c` | °C |
| `power_kw` | kW (required - this is the training target for the power predictor) |

## Missing-data policy

- Optional fields are `null`, never a sentinel like `0` or `-1`.
- `helicyn_ml/preprocessing/quality_checks.py` adds any schema column missing
  from a raw source as `null` (`coerce_to_schema`), replaces `inf`/`-inf` with
  `NaN` (`drop_invalid_numeric`), and spot-validates a sample of rows against
  the Pydantic schema (`validate_sample`) - it does not silently drop rows
  that fail an optional-field check, only rows missing a truly required field
  (timestamp, region, power_kw, etc.).
- Feature engineering (`build_workload_features`, `build_runtime_resource_features`)
  imputes numeric gaps with the median and categorical gaps with `"unknown"`
  at the model-input stage, never at the stored-record stage - the processed
  parquet files retain the real missingness.

## Policy-facing schemas

`FleetState`, `CandidateAction`, `Recommendation`, and `PredictedEffect`
(`fleet_state.py`, `action.py`, `recommendation.py`) are the contract between
Helicyn and a future simulator - see `docs/simulator_integration.md` for the
full field list and both call modes.

# Simulator integration

Helicyn ML exposes a stable input/output contract for a future
`helicyn-sim` (or any other caller) to drive: `FleetState` in,
`Recommendation` out. Both are Pydantic models
(`helicyn_ml/schemas/fleet_state.py`, `helicyn_ml/schemas/recommendation.py`)
with JSON Schema available via `FleetState.model_json_schema()` /
`Recommendation.model_json_schema()`.

## FleetState (input)

```
timestamp: datetime
sites:            [{site_id, region, rack_ids, migratable}]
racks:             [{rack_id, site_id, server_ids, ambient_temp_c, thermal_headroom_c}]
servers:           [{server_id, rack_id, cpu_capacity, cpu_used, memory_capacity_gb,
                      memory_used_gb, gpu_capacity, gpu_used, gpu_memory_capacity_gb,
                      gpu_memory_used_gb, dvfs_state, asleep, running_job_ids}]
queued_jobs:       [{job_id, workload_type, arrival_time, cpu_request, memory_request_gb,
                      gpu_request, gpu_memory_request_gb, input_tokens, output_tokens,
                      priority, preemptible, latency_sensitive, delayable,
                      max_delay_minutes, migratable, site_affinity, deadline}]
running_jobs:      [{job_id, server_id, workload_type, start_time, expected_end_time,
                      cpu_usage, memory_usage_gb, gpu_usage, migratable}]
grid_signals:      [{region, timestamp, carbon_intensity_gco2e_per_kwh,
                      electricity_price_usd_per_mwh, grid_load_mw,
                      forecast_carbon_intensity_1h, forecast_price_1h}]
weather_signals:   [{region, timestamp, ambient_temp_c, relative_humidity, wet_bulb_temp_c}]
current_power_metrics:   {str: float} | null
current_thermal_metrics: {str: float} | null
```

See `examples/fleet_state_example.json` for a complete, valid instance.

## Recommendation (output)

```
timestamp: datetime
selected_actions: [CandidateAction]        # the one chosen action per job
ranked_actions:    [ScoredAction]          # every candidate considered, valid and invalid
score: float
score_breakdown: {str: float}
explanation: str                           # plain-English, generated from score_breakdown
predicted_effect: PredictedEffect | null   # energy/carbon/cost/SLA/thermal/utilization deltas
confidence: float
model_version: str
is_fallback: bool                          # true if PolicyRanker wasn't trained/available
```

`CandidateAction`: `action_type` (`place`/`delay`/`migrate`/`change_dvfs`/
`sleep_server`/`wake_server`/`reject`), `job_id`, `target_site_id`,
`target_rack_id`, `target_server_id`, `delay_minutes`, `dvfs_state`, `metadata`.

`ScoredAction`: `action`, `score`, `score_breakdown`, `predicted_effect`,
`valid`, `rejection_reason`.

See `examples/recommendation_example.json` for a complete instance produced
by `python -m helicyn_ml demo`.

## Local import mode (same process)

```python
from helicyn_ml.serving.local_policy_service import LocalPolicyService

service = LocalPolicyService(models_dir="artifacts/models")
recommendation = service.recommend_from_dict(fleet_state_json_dict)
# or: recommendation = service.recommend(FleetState.model_validate(payload))
```

## HTTP mode

```bash
python -m helicyn_ml serve --models artifacts/models --host 127.0.0.1 --port 8765
```

```
GET  /health     -> {"status": "ok", "missing_models": [...]}
GET  /models     -> which of the 4 policy-time models are loaded
POST /recommend   body: FleetState JSON, returns: Recommendation JSON
```

## Versioning

`Recommendation.model_version` is currently a fixed string
(`helicyn-ml-v0.1.0`) - a future simulator should treat any change to it as
a signal that model behavior may have changed and re-validate before relying
on new recommendations for comparison against prior runs.

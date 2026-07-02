# Model Card: policy_ranker

- **Version**: v1
- **Date trained**: 2026-07-02T04:36:01.846136+00:00
- **Datasets used**: synthetic_sample
- **Rows used**: 2844
- **Label provenance**: teacher_generated
- **Train range**: n/a
- **Val range**: n/a
- **Test range**: n/a

## Features
current_cpu_utilization, current_gpu_utilization, current_memory_utilization, candidate_remaining_cpu, candidate_remaining_gpu, candidate_remaining_memory, candidate_carbon_intensity, candidate_price, candidate_ambient_temp_c, predicted_future_demand, predicted_runtime_seconds, predicted_resource_usage, sla_slack_seconds, thermal_proxy_score, fragmentation_score, consolidation_score, delay_minutes, action_type, workload_type

## Targets
teacher_score

## Metrics
```json
{
  "train_n": 2844,
  "val": {
    "mae": 0.19803331484071116,
    "rmse": 0.29386326972616333,
    "median_ae": 0.12602741998225042,
    "p90_ae": 0.5333343172136136,
    "mape_pct": 0.6295173395284555,
    "r2": 0.9995268345691509,
    "n": 600
  },
  "test": {
    "mae": 0.28215362082601764,
    "rmse": 0.35000660841172804,
    "median_ae": 0.19664047082290637,
    "p90_ae": 0.6456013423071536,
    "mape_pct": 0.913773657262308,
    "r2": 0.9993510612404953,
    "n": 594
  }
}
```

## Known limitations
- PolicyRanker v1 is trained by imitation of a heuristic teacher, not by real operator labels or real counterfactual optimal decisions. It is intended as a prototype policy model and will be evaluated in the simulator.
- Candidate FleetState snapshots use synthetic capacity/topology assumptions, not a real fleet inventory.

## Intended use
Prototype action ranking for the Helicyn control-brain interface; requires simulator rollout evaluation before any operational use.

## Non-intended use
Must not be treated as a validated optimal control policy.

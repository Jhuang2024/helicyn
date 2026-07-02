# Model Card: policy_ranker

- **Version**: v1
- **Date trained**: 2026-07-02T05:38:57.077351+00:00
- **Datasets used**: burstgpt
- **Rows used**: 9000
- **Label provenance**: teacher_generated
- **Train range**: n/a
- **Val range**: n/a
- **Test range**: n/a

## Features
current_cpu_utilization, current_gpu_utilization, current_memory_utilization, candidate_remaining_cpu, candidate_remaining_gpu, candidate_remaining_memory, candidate_carbon_intensity, candidate_price, candidate_ambient_temp_c, predicted_future_demand, predicted_runtime_seconds, predicted_resource_usage, sla_slack_seconds, thermal_proxy_score, fragmentation_score, consolidation_score, delay_minutes, action_type, workload_type, dvfs_state

## Targets
teacher_score

## Metrics
```json
{
  "train_n": 9000,
  "val": {
    "mae": 0.05140986974815966,
    "rmse": 0.06704091235557456,
    "median_ae": 0.04129652863956679,
    "p90_ae": 0.10740598816353497,
    "mape_pct": 0.09894579574076723,
    "r2": 0.9976690255409074,
    "n": 9000
  },
  "test": {
    "mae": 0.052959486522925696,
    "rmse": 0.07020056777162566,
    "median_ae": 0.04125288284808448,
    "p90_ae": 0.11560658449890795,
    "mape_pct": 0.10211375561781597,
    "r2": 0.9975154866049261,
    "n": 9000
  }
}
```

## Known limitations
- PolicyRanker v1 is trained by imitation of a heuristic teacher, not by real operator labels or real counterfactual optimal decisions. It is intended as a prototype policy model and will be evaluated in the simulator.
- Candidate FleetState snapshots use synthetic capacity/topology assumptions, not a real fleet inventory.
- EXPERIMENTAL / WEAK: see artifacts/eval/policy_ranker/diagnostics.json for feature-variance and duplicate-row diagnostics run on this training table; do not trust this model until it has been evaluated through simulator rollouts.

## Intended use
Prototype action ranking for the Helicyn control-brain interface; requires simulator rollout evaluation before any operational use.

## Non-intended use
Must not be treated as a validated optimal control policy.

## Notes
research_usable=no (experimental) until simulator rollout evaluation exists, regardless of test-set R^2.

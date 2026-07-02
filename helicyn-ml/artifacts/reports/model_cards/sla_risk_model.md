# Model Card: sla_risk_model

- **Version**: v1
- **Date trained**: 2026-07-02T04:36:00.360872+00:00
- **Datasets used**: synthetic_sample
- **Rows used**: 420
- **Label provenance**: weak
- **Train range**: n/a
- **Val range**: n/a
- **Test range**: n/a

## Features
cpu_request, memory_request_gb, gpu_request, input_tokens, output_tokens, priority, hour_of_day, day_of_week, is_weekend, rolling_arrival_count_15m, workload_type, source_dataset

## Targets
deadline_miss

## Metrics
```json
{
  "train_n": 420,
  "train_positive_rate": 0.05952380952380952,
  "val": {
    "accuracy": 0.9111111111111111,
    "precision": 0.5,
    "recall": 0.125,
    "n": 90,
    "positive_rate": 0.08888888888888889,
    "roc_auc": 0.8277439024390244
  },
  "test": {
    "accuracy": 0.9333333333333333,
    "precision": 0.6666666666666666,
    "recall": 0.2857142857142857,
    "n": 90,
    "positive_rate": 0.07777777777777778,
    "roc_auc": 0.8967297762478486
  }
}
```

## Known limitations
- deadline_miss labels are WEAK LABELS derived from a synthetic deadline (arrival_time + duration_seconds * class_multiplier) and a simplified fixed-capacity queueing simulation - they are not real operator-reported SLA outcomes.
- class_multiplier values are engineering assumptions, not measured from real SLAs.

## Intended use
Prototype SLA-risk signal for the policy ranker and constraint checker; simulator validation required before any operational use.

## Non-intended use
Must not be used as a real SLA compliance or breach-risk indicator.

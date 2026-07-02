# Model Card: power_predictor

- **Version**: v1
- **Date trained**: 2026-07-02T05:38:38.223247+00:00
- **Datasets used**: synthetic_sample
- **Rows used**: 352
- **Label provenance**: synthetic
- **Train range**: n/a
- **Val range**: n/a
- **Test range**: n/a

## Features
cpu_usage, gpu_usage, memory_usage, network_usage, ambient_temp_c

## Targets
power_kw

## Metrics
```json
{
  "train_n": 352,
  "val": {
    "mae": 0.0755448019926477,
    "rmse": 0.09455813007278067,
    "median_ae": 0.0705769676091843,
    "p90_ae": 0.15158549281059674,
    "mape_pct": 3.050804368675546,
    "r2": 0.9845326269634067,
    "n": 76
  },
  "test": {
    "mae": 0.06753674908801696,
    "rmse": 0.09020615410079857,
    "median_ae": 0.05162878389508396,
    "p90_ae": 0.14927901816149647,
    "mape_pct": 2.928168835723849,
    "r2": 0.9863899069778769,
    "n": 76
  }
}
```

## Known limitations
- No facility-level PUE, chiller, or cooling telemetry is included; this predicts server/site-level power only.

## Intended use
Estimating power draw from utilization to feed the policy ranker's carbon/cost terms.

## Non-intended use
Not validated for real facility power billing or capacity planning.

# Model Card: power_predictor

- **Version**: v1
- **Date trained**: 2026-07-02T04:36:00.603035+00:00
- **Datasets used**: synthetic_sample
- **Rows used**: 235
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
  "train_n": 235,
  "val": {
    "mae": 0.07449072914443526,
    "rmse": 0.099218641617742,
    "median_ae": 0.06220550985822404,
    "p90_ae": 0.15050168550768206,
    "mape_pct": 3.347651120483904,
    "r2": 0.9823759727294442,
    "n": 50
  },
  "test": {
    "mae": 0.0706815494583262,
    "rmse": 0.08397700817678798,
    "median_ae": 0.06647653347094495,
    "p90_ae": 0.1376473881829896,
    "mape_pct": 2.8324786055604796,
    "r2": 0.9868686255202824,
    "n": 51
  }
}
```

## Known limitations
- No facility-level PUE, chiller, or cooling telemetry is included; this predicts server/site-level power only.

## Intended use
Estimating power draw from utilization to feed the policy ranker's carbon/cost terms.

## Non-intended use
Not validated for real facility power billing or capacity planning.

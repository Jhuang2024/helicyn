# Model Card: workload_forecaster

- **Version**: v1
- **Date trained**: 2026-07-02T04:35:58.253664+00:00
- **Datasets used**: synthetic_sample
- **Rows used**: 420
- **Label provenance**: real
- **Train range**: 2024-01-01 00:00:37.556015923+00:00 -> 2024-01-01 04:01:24.762048047+00:00
- **Val range**: n/a
- **Test range**: 2024-01-01 04:51:29.691579354+00:00 -> 2024-01-01 05:42:02.911962340+00:00

## Features
hour_of_day, day_of_week, is_weekend, minute_of_hour, rolling_arrival_count_15m, rolling_arrival_count_1h, rolling_cpu_request_15m, rolling_gpu_request_15m, rolling_memory_request_15m, rolling_input_tokens_15m, rolling_output_tokens_15m, lag_cpu_request_1, lag_gpu_request_1, lag_arrivals_1, lag_arrivals_4, lag_arrivals_12, lag_arrivals_24, source_dataset, workload_type

## Targets
arrivals_next_15m, arrivals_next_1h, cpu_demand_next_15m, gpu_demand_next_15m, memory_demand_next_15m, input_tokens_next_15m, output_tokens_next_15m

## Metrics
```json
{
  "arrivals_next_15m": {
    "train_n": 420,
    "val": {
      "mae": 7.541815333724511,
      "rmse": 8.957026231887738,
      "median_ae": 6.691247484685042,
      "p90_ae": 14.380141911442832,
      "mape_pct": 87.3996185968194,
      "r2": -0.07550181014428792,
      "n": 90,
      "baseline_mae": 6.6534391534391535,
      "skill_vs_baseline": -0.13352135035700408
    },
    "test": {
      "mae": 9.189775782081272,
      "rmse": 11.521061223072651,
      "median_ae": 6.25548373199547,
      "p90_ae": 19.25893474844244,
      "mape_pct": 96.04845492633828,
      "r2": -0.7464544667439088,
      "n": 90,
      "baseline_mae": 6.955555555555556,
      "skill_vs_baseline": -0.32121377058676437
    }
  },
  "arrivals_next_1h": {
    "train_n": 420,
    "val": {
      "mae": 16.265999693163593,
      "rmse": 19.485613998766283,
      "median_ae": 14.029463480218643,
      "p90_ae": 28.71267145255831,
      "mape_pct": 100.58540425573446,
      "r2": 0.43742809792480564,
      "n": 90,
      "baseline_mae": 48.75714285714285,
      "skill_vs_baseline": 0.6663873488070754
    },
    "test": {
      "mae": 29.77745318699161,
      "rmse": 34.70847907886797,
      "median_ae": 27.68856433036196,
      "p90_ae": 55.98963190421306,
      "mape_pct": 178.26287706847734,
      "r2": -0.7849292801109498,
      "n": 90,
      "baseline_mae": 48.75714285714285,
      "skill_vs_baseline": 0.3892699317054167
    }
  },
  "cpu_demand_next_15m": {
    "train_n": 420,
    "val": {
      "mae": 74.71922483282589,
      "rmse": 88.42225852283165,
      "median_ae": 70.13818070206932,
      "p90_ae": 133.25981055596637,
      "mape_pct": 158.1828435115449,
      "r2": -0.5461532685751329,
      "n": 90,
      "baseline_mae": 52.103618399279284,
      "skill_vs_baseline": -0.43405059242218447
    },
    "test": {
      "mae": 73.43700918309162,
      "rmse": 89.3074444197538,
      "median_ae": 53.16687125825014,
      "p90_ae": 140.54410103137567,
      "mape_pct": 94.9808277496672,
      "r2": -0.6066181115572997,
      "n": 90,
      "baseline_mae": 57.96088602070327,
      "skill_vs_baseline": -0.2670097754692773
    }
  },
  "gpu_demand_next_15m": {
    "train_n": 420,
    "val": {
      "mae": 23.030168496037927,
      "rmse": 27.094412888692656,
      "median_ae": 20.006501217443407,
      "p90_ae": 40.18952528772945,
      "mape_pct": 210.43428988197118,
      "r2": -0.0620504384534275,
      "n": 90,
      "baseline_mae": 22.67365713298405,
      "skill_vs_baseline": -0.015723593285498216
    },
    "test": {
      "mae": 19.433139203755072,
      "rmse": 22.26509012196321,
      "median_ae": 19.590775177460742,
      "p90_ae": 35.220672803810146,
      "mape_pct": 158.016228896833,
      "r2": -0.308588473308147,
      "n": 90,
      "baseline_mae": 16.71937305888763,
      "skill_vs_baseline": -0.16231267376529201
    }
  },
  "memory_demand_next_15m": {
    "train_n": 420,
    "val": {
      "mae": 235.8233835852196,
      "rmse": 283.1124629498474,
      "median_ae": 234.506650765009,
      "p90_ae": 427.62848028624666,
      "mape_pct": 142.6408502048096,
      "r2": -0.031550386688877996,
      "n": 90,
      "baseline_mae": 203.94269882321925,
      "skill_vs_baseline": -0.1563217754102344
    },
    "test": {
      "mae": 302.15594518843415,
      "rmse": 374.5592375770346,
      "median_ae": 272.7636409953179,
      "p90_ae": 593.9343238970246,
      "mape_pct": 79.48781580529082,
      "r2": -0.44497171771448074,
      "n": 90,
      "baseline_mae": 261.7961934274368,
      "skill_vs_baseline": -0.15416477693050967
    }
  },
  "input_tokens_next_15m": {
    "train_n": 420,
    "val": {
      "mae": 6655.099879861919,
      "rmse": 7704.0308922644135,
      "median_ae": 6543.644573295451,
      "p90_ae": 12069.80910453462,
      "mape_pct": 52.52932344350022,
      "r2": -0.1677328059154306,
      "n": 90,
      "baseline_mae": 6144.827301587302,
      "skill_vs_baseline": -0.08304099582144575
    },
    "test": {
      "mae": 8007.124003781686,
      "rmse": 9400.38027303011,
      "median_ae": 7859.43380967164,
      "p90_ae": 15455.329863580168,
      "mape_pct": 45.58726020668792,
      "r2": -1.0391949991050837,
      "n": 90,
      "baseline_mae": 6494.699365079366,
      "skill_vs_baseline": -0.23287061551059773
    }
  },
  "output_tokens_next_15m": {
    "train_n": 420,
    "val": {
      "mae": 1789.7069441913313,
      "rmse": 2177.644832232563,
      "median_ae": 1551.6357944556685,
      "p90_ae": 3284.6508033228006,
      "mape_pct": 28.76029538535682,
      "r2": 0.27573343840077114,
      "n": 90,
      "baseline_mae": 2041.050264550265,
      "skill_vs_baseline": 0.12314411101204104
    },
    "test": {
      "mae": 3125.3059796732105,
      "rmse": 3701.1275066803564,
      "median_ae": 3259.649620721283,
      "p90_ae": 5837.968376113175,
      "mape_pct": 86.69459062890122,
      "r2": -0.7031191643451651,
      "n": 90,
      "baseline_mae": 2592.8178835978833,
      "skill_vs_baseline": -0.2053704193587358
    }
  }
}
```

## Known limitations
- Forward-looking targets are computed by re-windowing the same trace and can be noisy near split boundaries.
- Public traces mix heterogeneous source_dataset epochs; cross-dataset generalization is not guaranteed.

## Intended use
Short-horizon demand forecasting to feed the Helicyn policy ranker's predicted_future_demand feature.

## Non-intended use
Not validated for production capacity planning or SLA guarantees.

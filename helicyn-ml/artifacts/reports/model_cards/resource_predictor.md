# Model Card: resource_predictor

- **Version**: v1
- **Date trained**: 2026-07-02T04:35:59.937247+00:00
- **Datasets used**: synthetic_sample
- **Rows used**: 420
- **Label provenance**: real
- **Train range**: n/a
- **Val range**: n/a
- **Test range**: n/a

## Features
cpu_request, memory_request_gb, gpu_request, gpu_memory_request_gb, input_tokens, output_tokens, priority, hour_of_day, day_of_week, is_weekend, workload_type, scheduling_class, source_dataset

## Targets
cpu_usage, memory_usage_gb, gpu_usage, gpu_memory_usage_gb

## Metrics
```json
{
  "label_coverage": {
    "cpu_usage": 1.0,
    "memory_usage_gb": 1.0,
    "gpu_usage": 1.0,
    "gpu_memory_usage_gb": 1.0
  },
  "cpu_usage": {
    "train_n": 420,
    "val": {
      "mae": 1.4345721498671067,
      "rmse": 1.9737937635592757,
      "median_ae": 1.0431985736218787,
      "p90_ae": 3.2336661804836724,
      "mape_pct": 32.84798696848529,
      "r2": 0.6502141327643624,
      "n": 90,
      "baseline_mae": 2.7987970194015883,
      "skill_vs_baseline": 0.48743258624241603
    },
    "test": {
      "mae": 1.268651996201677,
      "rmse": 1.6781083977216542,
      "median_ae": 0.8930186487212388,
      "p90_ae": 2.7485489087434285,
      "mape_pct": 32.54457085368918,
      "r2": 0.7388832404596624,
      "n": 90,
      "baseline_mae": 2.714080151240911,
      "skill_vs_baseline": 0.5325664956424985
    }
  },
  "memory_usage_gb": {
    "train_n": 420,
    "val": {
      "mae": 4.64626728392803,
      "rmse": 6.309980126811236,
      "median_ae": 3.3726024249348985,
      "p90_ae": 10.866713879406491,
      "mape_pct": 26.43034440716358,
      "r2": 0.7274291752937938,
      "n": 90,
      "baseline_mae": 10.124381736624425,
      "skill_vs_baseline": 0.5410813810861754
    },
    "test": {
      "mae": 6.195838252435079,
      "rmse": 8.60082002697957,
      "median_ae": 3.6629452462812786,
      "p90_ae": 14.8816043276539,
      "mape_pct": 46.20304377944274,
      "r2": 0.6067022595561002,
      "n": 90,
      "baseline_mae": 11.397726735026168,
      "skill_vs_baseline": 0.4563970170126338
    }
  },
  "gpu_usage": {
    "train_n": 420,
    "val": {
      "mae": 0.3489737813333571,
      "rmse": 0.6633847739322215,
      "median_ae": 0.049752003649461335,
      "p90_ae": 1.0730334957236913,
      "mape_pct": 21.995705242561687,
      "r2": 0.9045301604707828,
      "n": 90,
      "baseline_mae": 1.7781160857552991,
      "skill_vs_baseline": 0.8037395960089289
    },
    "test": {
      "mae": 0.338213957421121,
      "rmse": 0.6439270817536179,
      "median_ae": 0.04251445991235807,
      "p90_ae": 1.113258175754951,
      "mape_pct": 28.36914530899273,
      "r2": 0.8761032375756446,
      "n": 90,
      "baseline_mae": 1.493776184126372,
      "skill_vs_baseline": 0.7735845831422705
    }
  },
  "gpu_memory_usage_gb": {
    "train_n": 420,
    "val": {
      "mae": 10.658797015843065,
      "rmse": 18.289024724233908,
      "median_ae": 1.2425493313946263,
      "p90_ae": 35.60709481575475,
      "mape_pct": 104.3154821245182,
      "r2": 0.6621093087016432,
      "n": 90,
      "baseline_mae": 22.647439222426254,
      "skill_vs_baseline": 0.5293597253464151
    },
    "test": {
      "mae": 9.105887160956533,
      "rmse": 15.462954719464818,
      "median_ae": 1.6028716028920664,
      "p90_ae": 28.25914386605846,
      "mape_pct": 99.52136181861529,
      "r2": 0.7187739714585448,
      "n": 90,
      "baseline_mae": 22.321194159828885,
      "skill_vs_baseline": 0.5920519710659451
    }
  }
}
```

## Known limitations
- Usage targets (cpu_usage, gpu_usage, memory_usage_gb, gpu_memory_usage_gb) are only available in datasets that report actual utilization alongside requests; targets below the coverage threshold are skipped, not fabricated.

## Intended use
Estimating actual resource consumption from requested resources to feed the policy ranker.

## Non-intended use
Not validated as a capacity-planning or billing tool.

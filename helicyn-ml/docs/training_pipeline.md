# Training pipeline

```
data/raw/<dataset>/            per-dataset raw files, as downloaded or manually placed
      |  helicyn_ml.datasets.<module>.ingest()
      v
(in-memory normalized DataFrame, matching NormalizedXRecord fields)
      |  helicyn_ml.preprocessing.normalize_*.normalize_*_dataset()
      |  (coerce to schema, drop inf, validate a sample, warn on schema errors)
      v
data/processed/{workloads,grid,weather,power}/<dataset>.parquet
      |  helicyn_ml.preprocessing.split.run_split()
      v
data/splits/{train,val,test}/{workloads,grid,weather,power}.parquet
      |  helicyn_ml.preprocessing.feature_engineering.build_*_features()
      v
(feature DataFrame)
      |  helicyn_ml.training.train_*.run()
      v
artifacts/models/<model>/{model.joblib,metadata.json}
artifacts/eval/<model>/{metrics.json,predictions.parquet,feature_importance.csv,plots/}
artifacts/reports/model_cards/<model>.{json,md}
```

`data/interim/` is available for any dataset that needs a staging step
between raw and processed (none of the current loaders require it, but the
folder exists for datasets that do, e.g. a multi-file join).

## Train/val/test split logic

`helicyn_ml/preprocessing/split.py::time_split` splits **chronologically,
not randomly** - these are traces, and a random split would leak future
rows into training via rolling/lag features. The 70/15/15 split (configurable
via `configs/split.yaml`) is applied **independently within each
`source_dataset` group**, then the pieces are concatenated: different
datasets cover unrelated calendar ranges (e.g. a 2018 Alibaba trace vs a
2024 BurstGPT trace), so a single global timestamp cutoff would arbitrarily
put one dataset entirely in train and another entirely in test rather than
giving each dataset its own honest chronological holdout.

`source_dataset` is preserved through every stage so a leave-one-dataset-out
evaluation can be built later by filtering on that column.

## Leakage prevention

- **Split boundary**: per-dataset chronological split (above) - `test_splits.py`
  asserts `train.timestamp.max() <= val.timestamp.min() <= ... <= test.timestamp.min()`.
- **Rolling/lag features**: computed only from a row's own group's past
  (`_rolling_per_group` in `feature_engineering.py`), and features are built
  *after* splitting, from each split's own data only - a training row's
  rolling window never reaches into validation/test rows.
- **Forward-looking targets** (WorkloadForecaster): built via a
  reverse-roll-reverse trick (`workload_forecaster.build_targets`) rather
  than joining against future rows directly, keeping the transformation
  auditable and testable.
- **Weak SLA labels**: the queueing simulation (`sla_risk_model.generate_weak_labels`)
  runs independently per `source_dataset` group in chronological order, so a
  label for one job never depends on a job that arrives later in a *different*
  dataset's unrelated timeline.

## Reproducibility

`helicyn_ml.utils.seeds.set_all_seeds(42)` is called at the start of every
`training/train_*.run()`. Every `TabularModel.save()` writes
`metadata.json` with `random_seed`, `trained_at`, `sklearn_version`,
`python_version`, and the exact feature/target column lists used - see
`tests/test_reproducibility.py` for the check that identical inputs produce
identical output.

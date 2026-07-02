# Model design

Six models, all scikit-learn, all with saved artifacts, metadata, and model
cards under `artifacts/models/<name>/` and `artifacts/reports/model_cards/`.

## Why no LLM in the control loop

An LLM is nondeterministic (or expensive to pin deterministic), hard to unit
test against hard constraints, and not naturally numerical - it is a poor
fit for "will this job fit on this server" or "is this within budget."
Helicyn's control brain is a set of small, fast, inspectable regressors and
classifiers plus a transparent rule-based constraint checker. An LLM could
be added purely to turn a `Recommendation`'s structured `score_breakdown`
into fluent English - `explanations.py` already does that without one, using
plain string templates over the top two score terms.

## 1. WorkloadForecaster (`workload_forecaster.py`)

- **Targets** (one `HistGradientBoostingRegressor` each): `arrivals_next_15m`,
  `arrivals_next_1h`, `cpu_demand_next_15m`, `gpu_demand_next_15m`,
  `memory_demand_next_15m`, `input_tokens_next_15m`, `output_tokens_next_15m`.
- **Inputs**: calendar features, rolling 15m/1h arrival and resource-request
  sums, lagged arrivals/requests, `workload_type`, `source_dataset`.
- **Targets are forward-looking**: built by reversing time, rolling-summing,
  and reversing back (`build_targets`) - a real leakage risk if done naively,
  which is why it's implemented as its own tested function.
- **Baseline**: mean predictor, reported as `skill_vs_baseline` in metrics.

## 2. RuntimePredictor (`runtime_predictor.py`)

- **Target**: `duration_seconds`. Only trained on rows with a real duration
  (either reported directly, or derivable from start/end time) - `usable_rows()`
  filters everything else out rather than imputing a fake duration.
- **Inputs**: static job metadata known at submission time (requests, tokens,
  priority, scheduling class, calendar features) - no rolling windows, since
  this predicts a per-job outcome, not a time series.
- **Limitation surfaced directly in its model card**: request-only traces
  (e.g. BurstGPT) have no duration field, so this model may end up untrained
  ("skipped") when only such datasets are available - it is never trained on
  a fabricated duration.

## 3. ResourcePredictor (`resource_predictor.py`)

- **Targets**: `cpu_usage`, `memory_usage_gb`, `gpu_usage`, `gpu_memory_usage_gb`.
- Trains one model **per target that clears a minimum label-coverage
  threshold** (`MIN_LABEL_COVERAGE = 5%`); targets below that are skipped
  with an explicit warning, never trained on mostly-absent data.

## 4. SLARiskModel (`sla_risk_model.py`) - **weak-label classifier**

- **Target**: `deadline_miss` (binary).
- Public traces do not carry ground-truth SLA outcomes. This model uses a
  documented **weak-label** procedure: a synthetic deadline
  (`arrival_time + duration_seconds * class_multiplier`, multipliers per
  workload class) and a simplified fixed-capacity FIFO queueing simulation
  (`generate_weak_labels`) to decide whether that synthetic deadline would
  have been missed. This is an engineering approximation, not a real SLA
  outcome - the model card for this model states that explicitly, and it
  must never be presented as a real breach-risk indicator.

## 5. PowerPredictor (`power_predictor.py`) - **trained model or analytical fallback**

- **Target**: `power_kw`, from utilization signals.
- Trains a real `HistGradientBoostingRegressor` **only** when at least
  `MIN_ROWS_FOR_TRAINING = 30` real `NormalizedPowerRecord` rows are
  available. Otherwise it uses a fixed, clearly-labeled **analytical
  fallback**: `power = idle_kw + cpu_coef*cpu_usage + gpu_coef*gpu_usage +
  thermal_coef*max(0, ambient_temp_c - baseline)`. The fallback's
  `metadata.json`/model card say `analytical_fallback: true` and its
  coefficients are stated as illustrative engineering assumptions, not
  calibrated hardware measurements.

## 6. PolicyRanker (`policy_ranker.py`) - **imitation-learned, v1**

- **Target**: `teacher_score` (lower = better action) from the heuristic
  teacher (`policies/heuristic_teacher.py`).
- **Why imitation learning for v1**: public traces show what happened, not
  full action counterfactuals (what if this job had been placed elsewhere,
  delayed, or run at a different DVFS state). There is no real-outcome label
  to learn from yet. `training/train_policy_ranker.py` builds synthetic
  `FleetState` snapshots from historical job rows + whatever grid/weather
  signal is available at that timestamp, generates the standard 8 candidate
  actions per job, scores each with the heuristic teacher, and trains a
  regressor to predict that score.
- This is documented, in the model itself and its model card, as **teacher
  imitation, not learning from real operator decisions**. A future simulator
  is expected to generate rollout-based labels for a v2 that learns from
  actual counterfactual outcomes instead.

See `docs/policy_design.md` for the full candidate-action / constraint /
scoring pipeline this model sits inside.

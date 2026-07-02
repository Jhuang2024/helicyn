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

## 4. SLARiskModel (`sla_risk_model.py`) - **weak-label classifier, gated**

- **Target**: `deadline_miss` (binary).
- Public traces do not carry ground-truth SLA outcomes. This model uses a
  documented **weak-label** procedure: a synthetic deadline
  (`arrival_time + duration_seconds * class_multiplier`, multipliers per
  workload class) and a simplified fixed-capacity FIFO queueing simulation
  (`generate_weak_labels`) to decide whether that synthetic deadline would
  have been missed. This is an engineering approximation, not a real SLA
  outcome - the model card for this model states that explicitly, and it
  must never be presented as a real breach-risk indicator.
- **Degeneracy gate**: if the resulting weak-label positive rate is `>95%`
  or `<5%` of training rows, `train_sla_risk_model.py` refuses to train or
  save a classifier at all - a classifier trained on a near-single-class
  label would report misleadingly high accuracy (99%+) while carrying zero
  real signal. It writes `artifacts/eval/sla_risk_model/degenerate_report.json`
  instead and any previously-saved model artifact is deleted so `status`
  never reports a stale model as current. This is exactly what happens on a
  BurstGPT-only run: BurstGPT has no real duration field, so every request
  gets the same synthetic default duration, and the toy queueing simulation
  saturates almost completely.
- Even when the gate passes and a classifier does train, `research_usable`
  is hard-capped at `no` in `python -m helicyn_ml status` - weak labels are
  never treated as research evidence regardless of held-out metrics.

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
- Even when it *does* train a real regressor, `python -m helicyn_ml status`
  only reports `research_usable: yes/partial` if real (non-`synthetic_sample`)
  rows are the majority of its training data - a model trained purely on
  generated `synthetic_sample` power data is never treated as evidence about
  real hardware, regardless of how good its test R² looks (it would just be
  recovering the sample generator's own formula).

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
- **Diagnostics, not just metrics**: every training run writes
  `artifacts/eval/policy_ranker/diagnostics.json` (see `training/diagnostics.py`)
  reporting per-feature variance, target variance, duplicate-row percentage,
  train/val/test distribution comparison, and the candidate action-type
  distribution. This exists because an earlier version of this table
  construction silently collapsed to near-constant features (fixed synthetic
  server utilization, grid/weather signals matched by absolute-nearest
  timestamp against a trace from an unrelated calendar year, and a job that
  was `latency_sensitive` being made unconditionally non-delayable so 3/8
  candidate types were filtered out entirely for 100%-latency-sensitive
  datasets like BurstGPT) - it produced R² ≈ 0.01 with byte-identical
  val/test metrics, a classic duplicate-table symptom. The fix (independent
  per-resource utilization draws per job, hour-of-day signal matching,
  `dvfs_state` added as an actual model feature, and a short delay budget
  for latency-sensitive jobs instead of an outright ban) brought held-out R²
  to ~0.998 on a real BurstGPT-derived table - but that number reflects how
  well the model reproduces a *deterministic formula* (the heuristic
  teacher), not decision quality, which is why `research_usable` stays
  hard-capped at `no` regardless.
- `python -m helicyn_ml status` always reports PolicyRanker's
  `research_usable` as `no` ("experimental until simulator rollout
  evaluation exists") - this is a fixed policy decision, not a metric
  threshold that could someday flip it to `yes` on its own.

See `docs/policy_design.md` for the full candidate-action / constraint /
scoring pipeline this model sits inside.

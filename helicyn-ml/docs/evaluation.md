# Evaluation

`python -m helicyn_ml evaluate --models artifacts/models --splits data/splits --out artifacts/eval`
writes `artifacts/eval/evaluation_summary.{json,md}`, aggregating each
model's `artifacts/eval/<model>/metrics.json` plus `data/splits/split_summary.json`
(dataset sizes and train/val/test time ranges).

## Regression metrics (`utils/metrics.py::regression_metrics`)

`mae`, `rmse`, `median_ae`, `p90_ae`, `mape_pct` (only computed over
nonzero actuals), `r2`, `n`, and - where a baseline is passed -
`baseline_mae` and `skill_vs_baseline` (`1 - mae/baseline_mae`; positive
means the model beats a naive mean/median/seasonal-naive predictor).

**How to read it**: `skill_vs_baseline <= 0` means the trained model is no
better than guessing the training-set mean/median - a real finding to report,
not a bug to hide. `r2` near 0 or negative on a small/synthetic split is
expected and should be read as "not enough signal in this split," not as a
broken model.

## Classification metrics (`utils/metrics.py::classification_metrics`)

`accuracy`, `precision`, `recall`, `positive_rate`, and `roc_auc` (only
computed when both classes are present in that split - `None` otherwise,
never a fabricated value).

**How to read it (SLARiskModel specifically)**: since labels are weak
(see `docs/model_design.md`), these metrics describe how well the model
predicts the *synthetic queueing-delay simulation's* outcome, not real SLA
compliance. A high ROC AUC here is evidence the model learned the weak-label
generation function, not evidence about real operational risk.

## PolicyRanker ranking evaluation (`artifacts/eval/policy_ranker/ranking_eval.json`)

`top1_agreement_rate`: over fixed-size windows of the flat candidate table,
the fraction of windows where the ranker's argmin matches the teacher's
argmin. This measures how well PolicyRanker imitates the teacher - it is
**not** a measure of real decision quality, since the teacher itself is a
hand-specified heuristic, not a validated optimum.

## What's used, what's missing

`evaluation_summary.md` always states: which datasets contributed to each
split, train/val/test time ranges and row counts, and per-model status
(`evaluated` / `not_trained`) so it's immediately visible which of the six
models actually trained on real data versus fell back or was skipped for
lack of a labeled target.

## Limitations of these numbers

All metrics here are computed on held-out splits of **public or synthetic
sample traces only**. None of them constitute evidence about a real data
center. See `docs/limitations.md`.

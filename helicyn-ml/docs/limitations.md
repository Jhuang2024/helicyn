# Limitations

Read this before interpreting any number this project produces.

## Current model status (read this first)

Run `python -m helicyn_ml status` for the live, on-disk version of this
table. As of the last full pipeline run (BurstGPT as the only auto-downloaded
real workload dataset in this environment):

- **BurstGPT supports LLM demand forecasting.** It has real, densely-sampled
  request timestamps and token counts, which is what `WorkloadForecaster`
  needs for its arrival-count and token-demand targets.
- **BurstGPT does NOT support runtime prediction, resource prediction, true
  SLA risk, power prediction, or full policy learning.** It is a request
  trace with no job "runtime" field, no CPU/GPU/memory usage field, no real
  SLA outcome field, and no power measurement - every one of those has to
  come from a different dataset (Alibaba, Azure VM traces, Google
  ClusterData, or a real power dataset) that this environment could not
  auto-download (see `docs/dataset_downloads.md` for exactly why - Aliyun
  OSS and GitHub Release hosts are blocked by this sandbox's network policy;
  the download code is correct and will work in a less restricted environment).
- **`WorkloadForecaster` is the only meaningfully trained real-data model**
  in a BurstGPT-only run. Even it is only *partially* usable: several of its
  targets (`cpu_demand_next_15m`, `memory_demand_next_15m`) are zero-variance
  on BurstGPT because BurstGPT has no CPU/memory fields at all - `status`
  reports those specific targets as degenerate, not the whole model.
- **`SLARiskModel`'s output is degenerate on BurstGPT and must not be
  trusted.** BurstGPT has no real job-duration field, so every request gets
  the same synthetic 60s default duration; combined with real request rates,
  the weak-label queueing simulation collapses to ~100% "deadline miss" -
  the training gate now refuses to train a classifier when this happens
  (see `train_sla_risk_model.py`'s degeneracy gate), but even when it does
  train on a less pathological split, its labels are still weak by
  construction and `research_usable` is hard-capped at `no` regardless.
- **`ResourcePredictor` and `RuntimePredictor` were skipped, not trained
  badly** - BurstGPT provides 0% label coverage for CPU/GPU/memory usage and
  no duration/start/end timestamps at all, so both training scripts detect
  this and refuse to fit a model on absent labels rather than producing a
  meaningless one.
- **`PowerPredictor` is synthetic-only in this environment and is not
  evidence about real hardware.** No real power dataset (e.g. Scaleout) was
  available to auto-download or was placed manually, so it trained on
  generated `synthetic_sample` power data; its `research_usable` status is
  `no` for that reason even though it technically "trained" successfully.
- **`PolicyRanker` is weak/experimental and must not be trusted until
  simulator rollout data exists.** It imitates a heuristic teacher score
  built from synthetic FleetState snapshots, not real operator decisions or
  counterfactual outcomes. Its `research_usable` status is hard-capped at
  `no` regardless of its held-out R² (which can look very good purely
  because it's learning to reproduce a deterministic formula, not because it
  has learned anything about real scheduling quality).

## Data limitations

- Public data-center datasets are **partial**. None of the datasets this
  project ingests include full rack temperature, chiller telemetry, PUE, or
  facility-level power - only server/site-level signals at best (and often
  only utilization requests, not measured usage).
- Public traces show **what happened**, not real operator decisions or
  counterfactuals (what would have happened under a different placement,
  delay, or DVFS choice). This is why `PolicyRanker` v1 cannot learn from
  real outcomes yet (see below).
- Different datasets cover unrelated calendar ranges and anonymization
  schemes; cross-dataset generalization is not guaranteed and is not claimed.
- When a real public download fails or a dataset lacks a field a model
  needs (e.g. BurstGPT has no job "runtime"), the pipeline fills the gap
  with a clearly labeled **synthetic sample** (`source_dataset=synthetic_sample`)
  rather than failing outright or fabricating fields inside real records.
  Every synthetic row is labeled as such at generation time - see
  `helicyn_ml/datasets/sample_generator.py` and the CLI's `_ensure_processed_floor`.

## Label limitations

- **SLA labels are weak, not real.** `SLARiskModel`'s `deadline_miss` target
  is derived from a synthetic deadline formula and a simplified fixed-capacity
  queueing simulation, not real operator-reported SLA breaches. Its model
  card states this explicitly; it must never be treated as a real
  breach-risk indicator.
- **PolicyRanker v1 imitates a heuristic teacher.** It is trained to predict
  the output of a hand-specified weighted-sum scorer, not real operator
  decisions or a validated optimal policy. Its top-1 agreement rate with the
  teacher measures imitation fidelity, not decision quality.
- **PowerPredictor may be an analytical fallback**, not a trained model, when
  fewer than 30 real power-measurement rows are available. Its model card and
  `metadata.json` say `analytical_fallback: true` in that case, and its
  coefficients are stated as illustrative engineering assumptions, not
  calibrated against real hardware.

## What would be needed before any operational claim

- **Simulator rollout testing.** Before/after energy, carbon, cost, or SLA
  claims require running `HelicynPolicy`'s recommendations through an actual
  or simulated fleet and comparing against a baseline policy under the same
  conditions - this repository does not include that simulator, only the
  schema (`FleetState`/`Recommendation`) it will call.
- **Real telemetry validation.** Any claim about a specific data center
  requires that center's own workload, power, and thermal telemetry, not
  public traces from unrelated fleets.
- **Real SLA/operator-decision data**, to replace weak labels and heuristic
  teacher imitation with models trained on ground truth.

## What this project does not claim

No production-verified savings. No live data-center control. No validated
customer telemetry. No real operator approval. No guaranteed energy, carbon,
or cost reduction. No real cooling reduction. No real PUE improvement.

## What this project does claim

Trained on public traces (or clearly labeled samples where a real trace was
unavailable). Evaluated on held-out public/sample traces. Uses weak labels
where real SLA labels are unavailable, explicitly documented as such. Uses a
transparent heuristic teacher for the first policy ranker. Designed for
simulator integration via a stable `FleetState`/`Recommendation` schema.
Produces recommendations under stated model assumptions, requiring simulator
and/or real telemetry validation before any operational use. This is a
research prototype, not production control software.

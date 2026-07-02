# Limitations

Read this before interpreting any number this project produces.

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

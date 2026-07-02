# Policy design

`HelicynPolicy.recommend(fleet_state)` (`policies/helicyn_policy.py`) is the
decision interface a future simulator calls. It is deterministic given the
same `FleetState` and model artifacts (see `tests/test_reproducibility.py`).

## Pipeline

1. **Validate** `FleetState` (Pydantic; happens on construction).
2. For each queued job, **generate candidate actions**
   (`policies/candidate_generation.py::generate_candidates`) - the 8 standard
   candidates: `place` at each of the top-2 capacity-fitting sites, `delay`
   15/30/60 minutes, and `change_dvfs` to `high_performance`/`balanced`/`power_saver`.
3. **Run predictors** for each candidate: `RuntimePredictor` (falls back to a
   5-minute default if untrained), `SLARiskModel` (falls back to
   0.5/0.2 by `latency_sensitive` if untrained), `PowerPredictor` or its
   analytical fallback (before/after utilization delta), and a thermal proxy
   derived from the nearest `WeatherSignal`.
4. Build the policy-ranker feature vector (`policies/features.py::compute_action_features`).
5. **Score** with the trained `PolicyRanker` if available, else the
   heuristic teacher directly (`Recommendation.is_fallback` records which).
6. **Apply hard constraints** (`policies/constraint_checker.py::check_constraints`) -
   see below. Constraint checking is a plain rule evaluation, independent of
   any model.
7. **Rank** valid candidates by score (lower is better) and **select** the
   best valid action per job.
8. Build a structured **explanation** from the score breakdown
   (`policies/explanations.py`) - string templates over the two
   largest-magnitude score terms, no LLM involved.

## Candidate actions

`place` (at a capacity-fitting site), `delay` (15/30/60 min), `migrate`,
`change_dvfs` (`high_performance`/`balanced`/`power_saver`), `sleep_server`,
`wake_server`, `reject`.

## Hard constraints (`constraint_checker.py`)

- Never place a job where it would exceed CPU, GPU, or memory capacity at
  the target site.
- Never violate a job's site affinity.
- Never delay a non-delayable, latency-sensitive job.
- Never delay beyond a job's `max_delay_minutes`.
- Never apply `power_saver` DVFS when predicted deadline-miss risk exceeds
  `HIGH_SLA_RISK_THRESHOLD` (0.6).
- Never sleep a server that has running jobs.
- Never migrate a job (or running job) marked non-migratable.

Constraint failures are recorded on the `ScoredAction` (`valid=False`,
`rejection_reason=...`) rather than silently dropped, so the full ranked
list including rejected candidates is inspectable in the `Recommendation`.

## Scoring objective (heuristic teacher, `policies/heuristic_teacher.py`)

```
score = w_sla * sla_risk
      + w_power * predicted_power_delta
      + w_carbon * normalized_carbon_intensity
      + w_price * normalized_price
      + w_thermal * thermal_risk
      + w_fragmentation * fragmentation
      + w_delay * delay_penalty
      - w_utilization * useful_utilization
      - w_consolidation * consolidation_benefit
```

Default weights: `w_sla=100, w_power=2, w_carbon=6, w_price=4, w_thermal=12,
w_fragmentation=2, w_delay=8, w_utilization=2, w_consolidation=3`
(`configs/train_policy_ranker.yaml`). Lower score is better. Every term is a
plain weighted sum over features that are themselves logged in
`Recommendation.score_breakdown` - nothing about this scorer is opaque.

## Teacher vs. learned ranker

When a trained `PolicyRanker` model is available, `Recommendation.score` is
its **predicted** score (a learned approximation of the teacher), while
`score_breakdown` is always the **heuristic teacher's own decomposition** of
the same feature vector - useful for explanation even when the ranker made
the final call, but note the breakdown terms won't sum to exactly `score` in
that case (they will when no ranker is trained and the teacher score is used
directly, i.e. `Recommendation.is_fallback == True`).

## Recommendation output

`timestamp`, `selected_actions`, `ranked_actions` (all candidates, valid and
invalid, with per-candidate score/breakdown/predicted_effect),
`score`, `score_breakdown`, `explanation`, `predicted_effect`, `confidence`,
`model_version`, `is_fallback`.

Example explanation: *"Selected delay_30m for job job_391 because the
workload is flexible, predicted SLA risk remains low, and carbon intensity
is forecast to fall within the allowed delay window."* - generated purely
from the structured score terms, never from an LLM.

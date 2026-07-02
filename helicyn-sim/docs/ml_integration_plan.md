# Helicyn ML integration plan

This document explains what `helicyn-ml` actually provides today, and what
this simulator does with it. Phase 1 only optionally read one of
`helicyn-ml`'s output artifacts (a normalized resource-trace parquet file)
to shape synthetic workload demand. Phase 2 adds the `external_helicyn`
policy, which does call `helicyn-ml`'s HTTP service -- see
`docs/phase2_external_helicyn.md` for the full contract (FleetState
conversion, action validation, fallback behavior). This document stays
focused on *why* that integration is built the way it is.

## Current helicyn-ml status

Per `helicyn-ml`'s own `python -m helicyn_ml status` honesty check:

- **`workload_forecaster`**: trains on real BurstGPT LLM request traces.
- **`resource_predictor`**: trains on real/preprocessed Google cluster
  CPU/memory traces, and is `research_usable=yes` for CPU and memory
  targets. This is the model this simulator's `--resource-trace` flag
  points at.
- **GPU labels are unavailable** in any dataset `helicyn-ml` currently
  ingests. Nothing in `helicyn-ml` or this simulator fabricates GPU-trained
  behavior to fill that gap; `external_helicyn` explicitly rejects any
  recommended action that relies on nonzero GPU demand.
- **`runtime_predictor`**: skipped (no dataset with real job-runtime labels
  auto-downloads yet).
- **`sla_risk_model`**: unavailable/degenerate (no real SLA-violation
  labels).
- **`power_predictor`**: synthetic-only (no real facility power telemetry).
- **`policy_ranker`**: teacher-imitation only -- it was trained to imitate a
  hand-written heuristic scoring function, not from real outcome data or
  simulator rollouts.

None of this is a criticism to fix inside this simulator. It's the reason
`helicyn-sim` is CPU/memory-first, has no GPU-aware behavior, and treats
`external_helicyn`'s recommendations as untrusted input to validate, not as
ground truth: there is no trustworthy outcome-trained signal upstream yet.

## Why this simulator exists

`helicyn-ml`'s `policy_ranker` was trained by imitating a heuristic teacher
score, not from outcome feedback. The stated purpose of this simulator
(per `helicyn-ml`'s own README: "requires simulator and/or real telemetry
validation before any operational claim can be made") is to give that
ranker -- or any future Helicyn policy -- a way to be evaluated (Phase 2,
now implemented as `external_helicyn` + `before-after`) and, further out,
trained against (Phase 3+) simulated rollouts instead of only a static
heuristic teacher.

## Phase 2: `external_helicyn` policy adapter (implemented)

Lives at `helicyn_sim/policies/external_helicyn.py`. Summary (full detail
in `docs/phase2_external_helicyn.md`):

1. Implements the same `Policy.place_jobs(state) -> list[PolicyDecision]`
   interface as every other policy.
2. Each timestep, builds a `helicyn_sim.schemas.fleet_state.FleetState`
   (field-for-field compatible with `helicyn_ml.schemas.fleet_state.FleetState`)
   from the current `SimState`.
3. `POST`s it to `--helicyn-url` (default `http://127.0.0.1:8765/recommend`),
   parses the response into `helicyn_sim.schemas.recommendation.Recommendation`.
4. Validates every `selected_actions` entry against the simulator's actual
   capacity/state before applying it -- the simulator, never the model, is
   the source of truth for whether a placement is physically valid.
   Invalid actions are rejected and logged; unaddressed or rejected jobs
   fall back to safe first-fit placement.
5. Raises a clear `ExternalHelicynUnavailableError` if the server is
   unreachable; `run` exits cleanly on that error, `before-after` skips
   `external_helicyn` and continues the built-in policies.

`migrate` actions are not implemented (out of scope for Phase 2); only
`place`/`delay`/`change_dvfs`/`sleep_server`/`wake_server`/`reject` are
supported. `Recommendation.ranked_actions`/`predicted_effect` are not
consumed, only `selected_actions`.

## What Phase 2 does NOT do

- It does not modify `helicyn-ml`; nothing about this integration required
  changing `helicyn-ml`'s schemas or serving code.
- It does not claim the resulting comparison is production-validated. It
  is exactly what it is: a teacher-imitation-trained policy compared
  against a first-fit baseline (and five other built-in heuristics), under
  this simulator's documented synthetic assumptions
  (`docs/model_assumptions.md`, `docs/limitations.md`).
- It does not add GPU-aware coordination, since `helicyn-ml` has no
  GPU-trained model to drive it.
- It does not force `external_helicyn` to look good: `before-after`
  reports whatever the run actually produces, better or worse than
  baseline.

# Helicyn ML integration plan

This document explains what `helicyn-ml` actually provides today, and what
Phase 2 of this simulator will do with it. Phase 1 (this repo, as it stands)
does not import `helicyn-ml` and does not call its HTTP service; it only
optionally reads one of its output artifacts (a normalized resource-trace
parquet file) to shape synthetic workload demand -- see
`docs/model_assumptions.md`.

## Current helicyn-ml status (as of this Phase 1 build)

Per `helicyn-ml`'s own `python -m helicyn_ml status` honesty check:

- **`workload_forecaster`**: trains on real BurstGPT LLM request traces.
- **`resource_predictor`**: trains on real/preprocessed Google cluster
  CPU/memory traces, and is `research_usable=yes` for CPU and memory
  targets. This is the model this simulator's `--resource-trace` flag
  points at.
- **GPU labels are unavailable** in any dataset `helicyn-ml` currently
  ingests. Nothing in `helicyn-ml` or this simulator fabricates GPU-trained
  behavior to fill that gap.
- **`runtime_predictor`**: skipped (no dataset with real job-runtime labels
  auto-downloads yet).
- **`sla_risk_model`**: unavailable/degenerate (no real SLA-violation
  labels).
- **`power_predictor`**: synthetic-only (no real facility power telemetry).
- **`policy_ranker`**: teacher-imitation only -- it was trained to imitate a
  hand-written heuristic scoring function, not from real outcome data or
  simulator rollouts.

None of this is a criticism to fix inside this simulator. It's the reason
Phase 1 of `helicyn-sim` is CPU/memory-first, has no GPU-aware behavior, and
has no Helicyn-driven policy yet: there is no trustworthy signal upstream to
drive one.

## Why this simulator exists

`helicyn-ml`'s `policy_ranker` was trained by imitating a heuristic teacher
score, not from outcome feedback. The stated purpose of this simulator
(per `helicyn-ml`'s own README: "requires simulator and/or real telemetry
validation before any operational claim can be made") is to eventually give
that ranker -- or any future Helicyn policy -- a way to be evaluated (Phase
2) and, further out, trained against (Phase 3+) simulated rollouts instead
of only a static heuristic teacher.

## Phase 2 plan: `external_helicyn` policy adapter

Not implemented yet. When built, it will live at
`helicyn_sim/policies/external_helicyn.py` and:

1. Implement the same `Policy.place_jobs(state) -> list[PolicyDecision]`
   interface as `BaselineFirstFitPolicy`, so the engine and output files
   don't change shape.
2. Each timestep, build a `helicyn_sim.schemas.fleet_state.FleetState`
   (already implemented in Phase 1, field-for-field compatible with
   `helicyn_ml.schemas.fleet_state.FleetState`) from the current `SimState`:
   sites, racks, servers (capacity/allocation/DVFS/sleep state), queued and
   running jobs, and the current grid/weather signals for each site.
3. `POST` that `FleetState` as JSON to `http://127.0.0.1:8765/recommend`
   (the endpoint `helicyn-ml serve` exposes; see `helicyn-ml`'s
   `docs/simulator_integration.md`), and parse the response into
   `helicyn_sim.schemas.recommendation.Recommendation` (already implemented
   in Phase 1, same field-for-field compatibility).
4. Translate `Recommendation.selected_actions` (`CandidateAction`s: place /
   delay / migrate / change_dvfs / sleep_server / wake_server / reject) into
   the same server-allocation mutations `BaselineFirstFitPolicy` performs
   directly, respecting the same hard capacity constraints
   (`Server.can_fit`/`allocate`) regardless of what the model recommends --
   the simulator, not the model, is the source of truth for whether a
   placement is physically valid.
5. Fall back to `BaselineFirstFitPolicy` behavior (and log why) if the HTTP
   call fails, times out, or `helicyn-ml` is not running -- this simulator
   must work standalone, and `helicyn-ml` is explicitly optional per this
   project's brief.

## What Phase 2 will NOT do

- It will not modify `helicyn-ml` unless something in the `FleetState` /
  `Recommendation` contract turns out to be genuinely incompatible with
  what the simulator can produce -- and even then, only the minimum needed
  for compatibility.
- It will not claim the resulting comparison is production-validated. It
  will be exactly what it is: one heuristic/teacher-imitation-trained
  policy compared against a first-fit baseline, under this simulator's
  documented synthetic assumptions (`docs/model_assumptions.md`,
  `docs/limitations.md`).
- It will not add GPU-aware coordination, since `helicyn-ml` has no
  GPU-trained model to drive it.

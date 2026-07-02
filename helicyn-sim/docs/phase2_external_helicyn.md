# Phase 2: the external Helicyn adapter

`helicyn_sim/policies/external_helicyn.py` (`ExternalHelicynPolicy`, policy
name `external_helicyn`) is the AFTER side of the Phase 2 comparison: it
calls a running `helicyn-ml serve` process instead of deciding placement
itself. This document is the contract between the two projects.

## How SimulationState becomes a FleetState

Every step, before calling `place_jobs`, the simulation engine has already
drawn this step's realized carbon/price/ambient signal per site into
`state.current_site_signals` (see `simulation/engine.py`). `place_jobs`
builds a `helicyn_sim.schemas.fleet_state.FleetState` (field-for-field
compatible with `helicyn_ml.schemas.fleet_state.FleetState`) from the
current `SimState`:

- `sites` / `racks` / `servers`: a direct mapping of `Site`/`Rack`/`Server`
  dataclass fields onto the schema's fields (capacity, allocated units,
  DVFS state, sleep state, running job IDs). GPU fields are always sent as
  `0`/empty, matching Phase 1's GPU scaffolding.
- `queued_jobs`: every `job_id` currently in `state.job_queue`, converted
  to `QueuedJob` (arrival time and deadline converted from step indices to
  timestamps via `simulation/clock.py`).
- `running_jobs`: every job in `state.running_job_ids`, as `RunningJob`.
  `expected_end_time` is estimated from `remaining_work_units` (this
  simulator's own progress model, not something Helicyn told it).
- `grid_signals` / `weather_signals`: one `GridSignal`/`WeatherSignal` per
  site, built directly from `state.current_site_signals` -- the exact
  values this step's power/carbon/cost accounting will also use, so the
  model and the simulator never disagree about "what the grid looked like
  right now."
- `current_power_metrics` / `current_thermal_metrics`: left `None` in
  Phase 2 (not populated).

The whole `FleetState` is POSTed as JSON to `--helicyn-url`
(`http://127.0.0.1:8765/recommend` by default) with a configurable timeout
(`--helicyn-timeout`, default 10s).

## How the response is validated

`helicyn-ml`'s response is parsed into
`helicyn_sim.schemas.recommendation.Recommendation`. Only
`selected_actions` is consumed in Phase 2 (`ranked_actions`/score
breakdowns are not acted on -- see "What Phase 2 does NOT do" below).
**Nothing in the recommendation is trusted until it passes validation
against the simulator's actual state.** Every action is checked with
`_validate_and_apply` in `external_helicyn.py`; any failure is rejected
with a specific reason and logged to `policy_decisions.csv` as
`action=rejected_external_action`, `reason=<exact validation failure>`:

| condition | rejection reason |
|---|---|
| `action_type` not one of the 6 supported types (`migrate` included) | `unsupported_action_type:<type>` |
| job doesn't exist | `unknown_job_id` |
| job already completed/rejected/running | `cannot_assign_completed_rejected_or_running_job` |
| job not currently queued | `job_not_currently_queued` |
| placement would use nonzero GPU demand | `gpu_based_optimization_not_supported_no_gpu_labels` |
| target server doesn't exist | `target_server_does_not_exist` |
| target rack/site doesn't match target server | `target_rack_does_not_match_target_server` / `target_site_does_not_match_target_server` |
| placement exceeds CPU or memory capacity | `exceeds_cpu_or_memory_capacity` |
| delaying a latency-sensitive job | `cannot_delay_non_delayable_latency_sensitive_job` |
| unknown DVFS state name | `unknown_dvfs_state` |
| sleeping a server with running jobs | `cannot_sleep_server_with_running_jobs` |

Only actions that pass validation are applied to `state`.

## Supported actions (Phase 2)

`place`, `delay`, `change_dvfs`, `sleep_server`, `wake_server`, `reject`.
`migrate` is defined in the shared `ActionType` enum (mirrored from
`helicyn_ml`) but is explicitly out of scope for Phase 2 and always
rejected as an unsupported action type.

## Fallback behavior

Any queued job that the recommendation didn't address at all, or whose
only recommended action was rejected by validation, falls back to the same
safe first-fit placement `BaselineFirstFitPolicy` uses (or stays queued /
gets rejected on the same deadline rule if nothing fits). That fallback
decision's reason is the literal string:

```
external recommendation not directly actionable; used validated safe fallback
```

so it's easy to grep `policy_decisions.csv` for exactly how much of a run
was actually driven by Helicyn versus the fallback.

## Availability and failure handling

- `ExternalHelicynPolicy.check_available()` does a quick `GET
  <base>/health` pre-flight check before a run starts.
- A single `python -m helicyn_sim run --policy external_helicyn` exits
  cleanly (`typer.Exit(1)`) with a clear message if the server is
  unreachable at start, or if the `/recommend` call itself fails mid-run
  (`ExternalHelicynUnavailableError` propagates up and is caught in
  `cli.py`) -- it does not crash with a raw traceback, and it does not
  silently fall back to a different policy for a run that was explicitly
  requested to test Helicyn.
- `python -m helicyn_sim before-after --helicyn-url ...`: if
  `check_available()` fails, external_helicyn is skipped and the batch
  continues with the six built-in policies; `comparison/report.md` records
  `External Helicyn unavailable; skipped.` with the underlying reason.

## What Phase 2 does NOT do

- It does not consume `Recommendation.ranked_actions`, `score`,
  `score_breakdown`, or `predicted_effect` -- only `selected_actions`. A
  richer adapter that reasons about alternative ranked actions when the top
  one is invalid is future work, not Phase 2.
- It does not implement `migrate`.
- It does not treat a successful Helicyn call as evidence of improvement.
  `helicyn-ml`'s `policy_ranker` is teacher-imitation-trained (see
  `docs/ml_integration_plan.md`), not outcome-trained; `before-after`
  reports whatever actually happens, including a worse result than
  baseline.
- It does not modify `helicyn-ml`.

## Limitations

See `docs/limitations.md`. In short: `external_helicyn` is experimental,
calls a model with no GPU/runtime/SLA/real-power training, and any
before/after numbers it produces are simulated under this project's
documented modeling assumptions -- not a production validation of Helicyn.

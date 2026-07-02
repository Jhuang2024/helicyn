# Experimental methodology

This document describes exactly how helicyn-sim's Phase 3 research
evidence package is produced, so results are reproducible and every number
can be traced back to a specific equation or config field. Read
`docs/model_assumptions.md` and `docs/limitations.md` alongside this.

## Timestep and simulation loop

Discrete-time, default 5-minute timestep, matching BurstGPT/Google
cluster-trace-style intervals (see `docs/model_assumptions.md`). Each step:
add arrivals, ask the policy for placement decisions, progress running
jobs, complete finished jobs, count deadline misses, compute
utilization/power/thermal/PUE/carbon/cost, log metrics. See
`helicyn_sim/simulation/engine.py`.

## Workload generation

Per-workload-type (`llm_inference`, `batch`, `online_service`,
`maintenance`) Poisson arrival process with time-of-day-varying rates
(`helicyn_sim/traces/synthetic.py`). Demand magnitude (CPU/memory units) is
uniform-random within a configured `[min, max]` range by default.

## Resource-trace shaping

`--resource-trace <path>` points at a helicyn-ml normalized resource
timeseries parquet (real, preprocessed Google cluster VM CPU/memory
utilization). Only a coarse fleet-wide utilization *shape* is extracted
(`helicyn_sim/traces/resource_trace_loader.py`) and used to bias where in
each job's `[min, max]` range its CPU/memory demand falls -- arrival
process, job identity, and deadlines remain synthetic. "Resource-trace-shaped
synthetic workload" is the accurate phrase; never "real workload replay."

## Fleet model

Multi-site, multi-rack, multi-server (`helicyn_sim/models/{site,rack,server}.py`).
Phase 3's research configs (`configs/research_matrix.yaml`,
`configs/ablation.yaml`, `configs/sensitivity.yaml`) deliberately use a
smaller fleet (2 sites x 1 rack x 3 servers) than the Phase 1/2 demo fleet
(2 sites x 4 racks x 16 servers): the demo fleet was oversized relative to
its workload (~1.7% average CPU utilization under baseline), which made
consolidation-style savings look artificially dramatic. The research fleet
is sized (empirically, via `validate-scenarios`) so `normal_load` lands at
roughly 35-55% average CPU utilization.

## Power model

`server_power_w = idle_power_w + max_cpu_dynamic_power_w * cpu_util^1.4 *
dvfs_power_multiplier + memory_power_coefficient_w * memory_util +
fan_overhead_w * fan_factor(rack_temp_c)`, or `sleep_power_w` if the server
is asleep. See `helicyn_sim/models/power.py` and `docs/equations.md`.

## PUE / cooling model

`dynamic_pue = clamp(base_pue + ambient_temp_coefficient * max(0,
ambient_temp_c - cooling_reference_temp_c), 1.05, 2.20)`. A single scalar
per site per timestep, not a cooling-plant simulation. See
`helicyn_sim/models/cooling.py`.

## Thermal proxy

A lumped, single-value-per-rack, first-order heat-balance model: heat gain
proportional to rack IT power, heat loss from a capped cooling-effort term,
weak pull toward ambient. Not CFD. Warm/hot/critical thresholds: 27C / 32C
/ 38C. See `helicyn_sim/models/thermal.py`.

## Carbon / cost accounting

`carbon_kgco2e = facility_energy_kwh * carbon_intensity_gco2e_per_kwh /
1000`; `cost_usd = facility_energy_kwh * electricity_price_usd_per_mwh /
1000`. Grid signals are deterministic, seeded synthetic curves (see
`helicyn_sim/models/grid.py`), not real operator data.

## Policies

- `baseline_first_fit`: fixed-order first-fit, no awareness of anything.
- `consolidation`, `thermal_aware`, `carbon_aware`, `price_aware`,
  `dvfs_aware`: single-objective heuristics (Phase 2).
- `integrated_coordination`: a **simulator-native, hand-weighted,
  multi-objective coordination-layer heuristic** -- explicitly NOT trained
  ML, NOT the same as `external_helicyn`, NOT a production controller. It
  scores every placement candidate as a weighted sum of SLA risk,
  incremental power, normalized carbon/price, thermal risk, fragmentation,
  and delay penalty, minus a utilization and consolidation reward (see
  `helicyn_sim/policies/integrated_coordination.py` for exact weights and
  formulas, and its module docstring for the full rationale).
- `external_helicyn`: calls a real running `helicyn-ml serve` process and
  validates every recommended action before applying it. See
  `docs/phase2_external_helicyn.md`. `helicyn-ml`'s `policy_ranker` is
  teacher-imitation only (see `docs/ml_integration_plan.md`) -- this
  policy's results reflect that, not a trained outcome model.

## Metrics

Every run produces `run_summary.json` with the fields listed in
`README.md`'s "Output files" section: job counts (total/completed/rejected/
deadline_misses/sla_violations), energy (IT/facility/cooling kWh), carbon,
cost, PUE, peak facility power, utilization (averaged over *awake* servers
only -- see `helicyn_sim/simulation/results.py`), active/sleeping
server-hours, and thermal stats (max/p95 rack temp, violation counts).

## Evaluation protocol

1. `validate-scenarios` -- sanity-check a scenario matrix under baseline
   before spending time on a full run; warns about miscalibration
   (oversized/overloaded fleet, no carbon/price variation, no flexible
   jobs, no thermal stress) without auto-tuning anything.
2. `research-run` -- every research policy x every scenario x every seed;
   writes per-run outputs plus `aggregate/` CSVs (see
   `helicyn_sim/experiments/research_run.py`).
3. `ablation` -- every policy, in a fixed stage order, under one reference
   scenario, averaged over seeds; shows delta vs baseline and vs the
   previous stage.
4. `sensitivity` -- one-factor-at-a-time sweep over five variables
   (`load_multiplier`, `carbon_variability`, `ambient_temperature_offset_c`,
   `deadline_tightness`, `server_idle_power_w`), comparing
   `baseline_first_fit` vs `integrated_coordination` (+ `external_helicyn`
   if reachable).
5. `paper-figures` / `paper-tables` -- render the above into
   matplotlib-only PNGs and copy-pasteable CSV/Markdown tables.
6. `claims-audit` / `research-report` -- categorize every claim the
   evidence package could support, and assemble the single narrative
   document tying everything together.

Every step is deterministic given the same seed (see `test_reproducibility.py`).
`--quick` variants of every command exist for fast iteration and are what
CI/final-verification runs; full-mode runs (more scenarios, more seeds) are
for an actual paper draft.

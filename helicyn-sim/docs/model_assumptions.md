# Model assumptions

This simulator is a research-prototype approximation, not a validated
digital twin. Every number below is a deliberate, documented modeling
choice -- not a measured fact about any real data center. If you use this
simulator's output for anything, read this file first.

## CPU/memory-first

`helicyn-ml`'s `resource_predictor` is only `research_usable` for CPU and
memory targets (trained on real, preprocessed Google cluster-trace VM
CPU/memory utilization). It has no GPU labels, no real runtime labels, and
no real facility power/thermal labels. This simulator mirrors that scope
deliberately: capacity, power, and placement are CPU/memory-first.

## No real GPU-trained behavior

`gpu_capacity_units` / `gpu_demand_units` exist in the schemas and configs
as scaffolding only. In Phase 1:

- Every server's default `gpu_capacity_units` is `0`.
- No placement logic checks GPU capacity.
- No power model term depends on GPU utilization.
- No policy reasons about GPU demand.

This is intentional. Since `helicyn-ml` has no real GPU-trained model,
adding GPU-aware simulator behavior now would either be a no-op or would
have to be invented from nothing -- both are worse than leaving it as inert
scaffolding until a real GPU-labeled dataset exists.

## Power equation assumptions

`helicyn_sim/models/power.py` uses:

- A convex CPU power curve (`utilization ** 1.4`), a common simplified
  approximation of the fact that CPU dynamic power grows faster than
  linearly with utilization on real hardware, but not fit to any specific
  chip.
- A flat linear memory power proxy (`memory_power_coefficient_w = 60` at
  100% memory utilization), a coarse stand-in for DRAM power scaling.
  Real DRAM power depends on access patterns, channel count, and DIMM type
  in ways this single coefficient does not capture.
- A fan-power multiplier keyed off *rack* temperature, not per-server
  temperature -- another simplification.
- DVFS multiplies CPU dynamic power only, never idle power or memory
  power, and (in Phase 1) never changes a job's *progress rate* -- DVFS
  state affects power draw, not how fast a job's `remaining_work_units`
  decreases. A real DVFS-aware scheduler would trade those off; Phase 1
  does not model that tradeoff.
- Job "work" progresses at a fixed rate of 1 work-unit per simulated
  minute while running, independent of the CPU/memory units actually
  allocated to it and independent of DVFS state. `total_work_units` is
  therefore best read as "how many minutes this job needs once placed,"
  not as a literal CPU-cycle count.

## Thermal proxy assumption

`helicyn_sim/models/thermal.py` is a lumped, single-value-per-rack,
first-order heat-balance model: heat in proportional to IT power, heat out
proportional to a capped cooling-effort term, plus a weak pull toward
ambient temperature. It has no notion of airflow, aisle containment,
neighboring rack effects, or spatial hotspots within a rack. It is useful
for *relative* comparisons between two policies run under the same model
(does policy A run hotter than policy B, all else equal) and is not a
prediction of any real sensor reading. This is not CFD (computational
fluid dynamics) and must never be described as such.

## Dynamic PUE / cooling assumption

PUE is a single scalar per site per timestep: a configured `base_pue` plus
a linear penalty for ambient temperature above the site's cooling reference
temperature, clamped to `[1.05, 2.20]`. Phase 1 does not model a cooling
plant, chiller staging, free-cooling economizer switchover, or humidity.
`hotspot_pue_penalty` exists as a term in the formula (see
`docs/equations.md`) but defaults to `0.0` in Phase 1 -- it is a documented
hook for a future model, not an active effect yet.

## Synthetic grid and weather

Carbon intensity, electricity price, and ambient temperature are all
deterministic (seeded), hand-specified smooth curves
(`helicyn_sim/models/grid.py`, `helicyn_sim/models/weather.py`) chosen to be
*directionally* representative of two well-known real-world patterns (a
California-style solar duck curve; a flatter mixed-grid pattern), not
downloaded or fit from any real grid operator or weather station. They
exist so a future carbon/price-aware policy has something non-trivial to
react to. Do not read specific gCO2e/kWh or $/MWh numbers as real regional
data.

## Synthetic workload

Job arrivals are drawn from a per-workload-type Poisson process with
hand-specified, time-of-day-varying rates (bursty LLM-inference and
online-service traffic during the day, heavier batch traffic overnight).
Demand magnitudes are drawn uniformly at random within a configured
`[min, max]` range per workload type, unless a resource trace is supplied
(see below). Deadlines are a fixed slack added to a job's total work
requirement, not derived from any real SLA data.

## Resource-trace shaping

`--resource-trace` points at a helicyn-ml normalized resource-timeseries
parquet file (real, preprocessed Google cluster VM CPU/memory utilization).
`helicyn_sim/traces/resource_trace_loader.py` extracts only a coarse
fleet-wide utilization *shape* from it (mean CPU/memory utilization per
relative time index, resampled onto the simulation's step grid) and uses it
to bias where in each job's `[min, max]` demand range its CPU/memory demand
falls. The trace has no job arrival events, no deadlines, and no workload
types -- it cannot and does not supply full job scheduling data. Treat a
"trace-shaped" run as "synthetic jobs with a demand magnitude curve derived
from a real trace," not as "real workload replay."

## Reduced-order model, in one sentence

Every equation here trades fidelity for speed and interpretability on
purpose; results are only meaningful as *relative* comparisons between
policies run under the same model, never as absolute predictions of a real
facility. See `docs/limitations.md`.

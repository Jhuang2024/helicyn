# Limitations

Read this before drawing any conclusion from a run of this simulator.

- **This is not production validation.** No claim in this repository has
  been checked against a real data center, and none should be inferred
  from run output. See the root `README.md`'s "What this is NOT" section.
- **There is no real GPU-trained model behind this simulator.**
  `helicyn-ml` has no real GPU labels (see its `docs/limitations.md`).
  This simulator does not fabricate GPU power, thermal, or placement
  behavior to compensate; GPU fields are inert scaffolding only (see
  `docs/model_assumptions.md`).
- **There is no real facility telemetry anywhere in this simulator.**
  Power, PUE, and thermal numbers all come from the analytical models in
  `helicyn_sim/models/`, not from a real building management system, real
  power meters, or real temperature sensors.
- **There are no real PUE/cooling labels.** `base_pue` per site and the
  dynamic-PUE formula's coefficients are configured assumptions, not fit to
  any real facility's measured PUE curve.
- **The thermal model is not CFD.** It is a lumped, single-value-per-rack,
  first-order heat-balance proxy (see `docs/model_assumptions.md`). It has
  no spatial resolution, no airflow model, and no cross-rack interaction.
- **The power model is assumption-based.** The CPU utilization exponent
  (1.4), the memory power coefficient (60 W), the fan-power thresholds, and
  every DVFS multiplier are reasonable engineering choices, not values
  measured on real hardware in this project.
- **SLA/deadlines are synthetic assumptions.** Deadline slack per workload
  type is a configured constant, not derived from any real SLA contract or
  observed latency requirement.
- **The synthetic workload's arrival rates, demand ranges, and work-unit
  ranges are hand-specified**, not fit to any measured production traffic
  pattern (the optional `--resource-trace` flag only shapes demand
  *magnitude*, not arrival process or job identity -- see
  `docs/model_assumptions.md`).
- **Grid carbon intensity, electricity price, and ambient weather are all
  synthetic.** They are deterministic, documented curves chosen to be
  directionally realistic, not downloaded from or fit to any real grid
  operator, utility, or weather station.
- **Results are only valid under this simulator's explicit model
  assumptions.** Any energy/carbon/cost/thermal/SLA comparison produced by
  this simulator is a statement about how the modeled policies behave under
  these specific modeling choices -- it is not a statement about real
  data-center outcomes, and it must not be reported as one.
- **Only one policy exists in Phase 1** (`baseline_first_fit`). There is no
  Helicyn-aware policy in this repository yet to compare it against; no
  "before/after Helicyn" numbers can honestly be produced until Phase 2
  exists and both policies have been run under identical conditions.

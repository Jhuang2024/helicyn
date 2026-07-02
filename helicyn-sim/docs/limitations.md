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
- **Only one policy exists in Phase 1** (`baseline_first_fit`). Phase 2
  adds five built-in heuristic policies and an `external_helicyn` adapter
  -- see the Phase 2 items below.

## Phase 2 additions

- **`external_helicyn` is still experimental.** It is a thin, validated
  adapter around whatever `helicyn-ml serve` returns; it has not been
  tuned, tested against adversarial recommendations beyond the specific
  validation rules in `docs/phase2_external_helicyn.md`, or run against
  more than one demo fleet configuration.
- **`helicyn-ml`'s `policy_ranker` is teacher-imitation only.** It was
  trained to imitate a hand-written heuristic scoring function, not from
  real outcome data or simulator rollouts (see `docs/ml_integration_plan.md`).
  A `before-after` run that includes `external_helicyn` is therefore, at
  best, "does imitating this heuristic help under these simulated
  conditions" -- not "does Helicyn's ML improve real outcomes."
- **`before-after` results are simulated under this project's stated
  assumptions**, same as any single run -- see every item above. Six
  built-in policies (plus `external_helicyn` when reachable) being
  compared under identical simulated conditions does not make the
  comparison a real-world benchmark.
- **No GPU-trained behavior anywhere**, including in `external_helicyn`:
  the adapter explicitly rejects any recommended action that appears to
  rely on nonzero GPU demand (`gpu_based_optimization_not_supported_no_gpu_labels`),
  since neither this simulator nor `helicyn-ml` has real GPU training data.
- **No real facility validation of any Phase 2 policy**, built-in or
  external. All six built-in heuristics and the external adapter are
  evaluated only against each other, inside the same reduced-order
  simulator, under the same synthetic workload and grid/weather
  assumptions.

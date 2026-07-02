# Helicyn Sim

An independent, discrete-time data-center scheduling simulator prototype.
Phase 1 only (see `docs/ml_integration_plan.md` for what Phase 2 adds).

## What this is

- A **standalone simulator**: synthetic multi-site fleet + synthetic
  workload generator + a reduced-order power/cooling/thermal model +
  carbon/cost accounting + a discrete-time (5-minute default) step loop +
  a dumb, deterministic `BaselineFirstFitPolicy` to compare against.
- Built so a *future* Helicyn-style coordination policy can be evaluated
  against that baseline under the exact same simulated conditions, either
  by importing a new policy class directly, or by calling a running
  `helicyn-ml serve` process over HTTP (`POST http://127.0.0.1:8765/recommend`)
  -- that HTTP adapter is Phase 2, not implemented yet.
- CPU/memory-first, matching the current state of `helicyn-ml`: its
  `resource_predictor` is only `research_usable` for CPU/memory targets, so
  this simulator's power/capacity model is CPU/memory-first too. GPU fields
  exist only as unused scaffolding (see `docs/model_assumptions.md`).
- Optionally shapes synthetic CPU/memory job demand using a real,
  preprocessed resource trace produced by `helicyn-ml`
  (`data/processed/resources/google_cpu_memory.parquet`, from the Google
  cluster VM CPU/memory dataset). This does not give the simulator real job
  scheduling data -- see `docs/model_assumptions.md`.

## What this is NOT

- Not a production capacity planner and not validated against a real data
  center. See `docs/limitations.md` -- read this before drawing any
  conclusion from run output.
- Not a claim of real energy/carbon/cost savings. Nothing in this repo has
  been compared against a real facility.
- Not GPU-trained behavior. `helicyn-ml` has no real GPU labels, and this
  simulator does not fabricate GPU power/thermal/placement behavior to
  compensate -- GPU fields are present only as inert config scaffolding.
- Not a dashboard. No Streamlit, no web UI, in Phase 1. `helicyn_sim/plotting/charts.py`
  is a minimal optional single-run plot helper, not a product.
- Not a second policy yet. Only `baseline_first_fit` exists; there is no
  Helicyn-aware policy to compare it against until Phase 2.

## Install

```bash
cd helicyn-sim
pip install -e ".[dev]"
```

Requires Python 3.11+.

## Run the tests

```bash
pytest tests/ -q
```

## Run the baseline

```bash
python -m helicyn_sim run \
  --config configs/demo.yaml \
  --policy baseline_first_fit \
  --out runs/demo_baseline
```

This simulates the two-site demo fleet (`ONT-NORTH`, `CA-WEST`; 4 racks x 16
servers each) for 24 simulated hours at 5-minute timesteps, with a purely
synthetic workload, and writes results to `runs/demo_baseline/`.

## Use a real resource trace to shape workload demand (optional)

If you've generated `helicyn-ml`'s normalized Google CPU/memory trace
(`cd ../helicyn-ml && python -m helicyn_ml datasets download --dataset
google-cluster-cpu-memory-preprocessed --out data/raw && python -m
helicyn_ml ingest --dataset google-cluster-cpu-memory-preprocessed --input
data/raw/GCD_VMs --out data/processed/resources/google_cpu_memory.parquet`),
you can shape this simulator's synthetic CPU/memory job demand with it:

```bash
python -m helicyn_sim run \
  --config configs/demo.yaml \
  --policy baseline_first_fit \
  --resource-trace ../helicyn-ml/data/processed/resources/google_cpu_memory.parquet \
  --out runs/demo_baseline_trace_shaped
```

This does **not** give the simulator real job arrival/deadline/scheduling
data -- it only biases the CPU/memory *magnitude* of synthetic jobs toward
the trace's real diurnal utilization shape. Job identities, arrival
process, deadlines, and workload types remain synthetic in both modes. See
`docs/model_assumptions.md`.

## Output files

Every run directory contains:

- `run_summary.json` -- one row of run-level totals (energy, carbon, cost,
  PUE, utilization, thermal, SLA/deadline counts).
- `timeseries_metrics.csv` -- one row per (timestep, site).
- `job_results.csv` -- one row per job, with placement, timing, and outcome.
- `policy_decisions.csv` -- one row per (timestep, job) placement decision
  the policy made, with a reason string.
- `config_resolved.yaml` -- the fully-resolved config used for the run
  (every default filled in), for reproducibility.

## Next phases

- **Phase 2**: an `external_helicyn` policy adapter that builds a
  `FleetState` from simulator state each timestep, POSTs it to a running
  `helicyn-ml serve` process at `http://127.0.0.1:8765/recommend`, and
  applies the returned `Recommendation`'s selected actions. See
  `docs/ml_integration_plan.md`.
- **Phase 3+** (not scoped yet): more baseline policies (carbon-aware,
  price-aware, thermal-aware) so `external_helicyn` has more than one
  strawman to beat; a plotting/reporting pass over multiple runs;
  eventually a dashboard, only once there's something real to show.

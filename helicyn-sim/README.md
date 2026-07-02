# Helicyn Sim

An independent, discrete-time data-center scheduling simulator prototype.
Phase 1 + Phase 2 (see `docs/phase2_external_helicyn.md` for the external
Helicyn adapter contract, `docs/ml_integration_plan.md` for what Phase 3+
might add).

## What this is

- A **standalone simulator**: synthetic multi-site fleet + synthetic
  workload generator + a reduced-order power/cooling/thermal model +
  carbon/cost accounting + a discrete-time (5-minute default) step loop.
- **Seven policies**: a dumb, deterministic `baseline_first_fit` (the
  BEFORE), five built-in heuristics (`consolidation`, `thermal_aware`,
  `carbon_aware`, `price_aware`, `dvfs_aware`), and `external_helicyn`,
  which calls a running `helicyn-ml serve` process over HTTP
  (`POST http://127.0.0.1:8765/recommend`) and validates every action it
  gets back against the simulator's actual physical constraints before
  applying it. See `docs/phase2_external_helicyn.md`.
- A `before-after` command that runs all of them under one config and
  writes a comparison report -- this is how you'd evaluate whether a
  Helicyn-style policy improves simulated energy/carbon/cost/thermal/SLA
  outcomes versus the baseline, under this simulator's explicit,
  documented assumptions.
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
  been compared against a real facility, and `external_helicyn` is not
  assumed to be an improvement -- `before-after` reports whatever actually
  happens, including a worse result than baseline.
- Not GPU-trained behavior. `helicyn-ml` has no real GPU labels, and this
  simulator does not fabricate GPU power/thermal/placement behavior to
  compensate -- GPU fields are present only as inert config scaffolding,
  and `external_helicyn` explicitly rejects any recommendation that
  appears to rely on nonzero GPU demand.
- Not a dashboard. No Streamlit, no web UI. `helicyn_sim/plotting/charts.py`
  is a minimal optional single-run plot helper, not a product.

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

## Run a single policy

```bash
python -m helicyn_sim run \
  --config configs/demo.yaml \
  --policy baseline_first_fit \
  --out runs/demo_baseline
```

`--policy` is one of `baseline_first_fit`, `consolidation`, `thermal_aware`,
`carbon_aware`, `price_aware`, `dvfs_aware`, `external_helicyn`. This
simulates the two-site demo fleet (`ONT-NORTH`, `CA-WEST`; 4 racks x 16
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
the trace's real diurnal utilization shape ("resource-trace-shaped
synthetic workload"). Job identities, arrival process, deadlines, and
workload types remain synthetic in every mode. See
`docs/model_assumptions.md`.

## Compare policies with `before-after`

```bash
python -m helicyn_sim before-after \
  --config configs/before_after.yaml \
  --out runs/before_after
```

Runs `baseline_first_fit`, `consolidation`, `thermal_aware`,
`carbon_aware`, `price_aware`, and `dvfs_aware` under the same config, each
into its own `runs/before_after/<policy_name>/`, then writes
`runs/before_after/comparison/{summary.csv,summary.json,report.md}`
comparing every policy against `baseline_first_fit`. Add `--resource-trace`
the same way as `run` to use trace-shaped demand for every policy in the
batch.

### Also comparing against external Helicyn

First start `helicyn-ml`'s HTTP service in a separate terminal:

```bash
cd ../helicyn-ml
python -m helicyn_ml serve --models artifacts/models --host 127.0.0.1 --port 8765
```

Then, from `helicyn-sim`:

```bash
python -m helicyn_sim run \
  --config configs/demo.yaml \
  --policy external_helicyn \
  --helicyn-url http://127.0.0.1:8765/recommend \
  --out runs/demo_external_helicyn

python -m helicyn_sim before-after \
  --config configs/before_after.yaml \
  --helicyn-url http://127.0.0.1:8765/recommend \
  --out runs/before_after_with_helicyn
```

If `helicyn-ml serve` isn't running or isn't reachable:
- A single `run --policy external_helicyn` exits cleanly with a clear error
  (it does not silently substitute a different policy for a run you asked
  to test Helicyn with).
- `before-after --helicyn-url ...` skips `external_helicyn` and still runs
  the six built-in policies; `comparison/report.md` says
  `External Helicyn unavailable; skipped.`

See `docs/phase2_external_helicyn.md` for exactly how `SimulationState`
becomes a `FleetState`, how every recommended action is validated before
being applied, and what happens to anything that fails validation.

## Interpreting `before-after` output

- `comparison/summary.csv` / `summary.json`: one row per policy run, all
  the `run_summary.json` fields plus `delta_facility_energy_vs_baseline_pct`,
  `delta_carbon_vs_baseline_pct`, `delta_cost_vs_baseline_pct` (percent
  change vs. `baseline_first_fit`), and `delta_deadline_misses_vs_baseline`
  (absolute difference).
- `comparison/report.md`: a plain-English summary -- what's simulated vs.
  not, whether `external_helicyn` was included or skipped and why, a table
  of deltas, a per-policy "what improved what" section, documented
  tradeoffs (e.g. consolidation's energy savings vs. thermal concentration),
  and a pointer to `docs/limitations.md`.
- Read every number here as "under this simulator's model assumptions,"
  never as a production claim -- see `docs/limitations.md`.

## Output files (per single run)

Every run directory (including each `<policy_name>/` under a
`before-after` output) contains:

- `run_summary.json` -- one row of run-level totals (energy, carbon, cost,
  PUE, utilization, thermal, SLA/deadline counts).
- `timeseries_metrics.csv` -- one row per (timestep, site).
- `job_results.csv` -- one row per job, with placement, timing, and outcome.
- `policy_decisions.csv` -- one row per (timestep, job) placement decision
  the policy made, with a reason string (for `external_helicyn`, this
  includes `rejected_external_action` rows when a recommendation failed
  validation).
- `config_resolved.yaml` -- the fully-resolved config used for the run
  (every default filled in), for reproducibility.

## Next phases

- **Phase 3+** (not scoped yet): a plotting/reporting pass over multiple
  `before-after` runs (e.g. across seeds or fleet sizes); richer use of
  `Recommendation.ranked_actions`/`predicted_effect` in the external
  adapter; eventually a dashboard, only once there's something real to
  show.

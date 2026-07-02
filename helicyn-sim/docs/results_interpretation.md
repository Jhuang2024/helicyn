# How to interpret helicyn-sim results

Read this before drawing any conclusion from `research-run`, `ablation`,
`sensitivity`, or the figures/tables they produce. Every point below was
observed while producing this project's own evidence package -- these are
not hypothetical caveats.

## Read every row across, not down one column

A policy that reduces `total_carbon_kgco2e` in a given scenario/seed can
simultaneously increase `deadline_misses` or `thermal_violations` in that
*same* row. In this project's own Phase 3 runs, `carbon_aware` and
`integrated_coordination` both reduced carbon under `thermal_stress`, but
also *increased* deadline misses relative to baseline in that scenario
(many flexible jobs deciding to delay for a lower-carbon window at the same
time, then all trying to place at once when their delay budget ran out,
under a scenario that was already near capacity). Never quote an
energy/carbon/cost delta without checking the deadline-miss and
thermal-violation columns on the same row.

## Lower energy alone is not enough

A policy can look dramatically better on energy purely by sleeping more
servers, independent of any smarter placement logic. `consolidation` does
this by design. `integrated_coordination` also sleeps idle servers as part
of its coordination (see its module docstring), so part of any energy win
it shows is the same mechanism, not something more sophisticated. Compare
`active_server_hours` alongside energy to see how much of a saving is
"turn things off" versus "place things better."

## Why consolidation can look artificially strong on an oversized fleet

Phase 2's demo fleet (2 sites x 4 racks x 16 servers) ran at ~1.7% average
CPU utilization under `baseline_first_fit`, because `baseline_first_fit`
never sleeps a server -- every one of 128 servers drew `idle_power_w`
continuously regardless of load. `consolidation` (or any policy that
sleeps idle servers) looked like it saved ~90% of energy, almost entirely
by turning off servers that never needed to be on in the first place. That
is a real, reproducible result, but it says more about the demo fleet
being oversized than about consolidation being a good algorithm. Phase 3's
research fleet (`configs/research_matrix.yaml`) was deliberately
recalibrated smaller (validated via `validate-scenarios` to land near
35-55% utilization for `normal_load`) specifically to reduce this artifact
-- but even at that scale, `normal_load` still has real idle time by
design (it is not run at 100% utilization), so a sleep-capable policy can
still show a large saving there. That is expected, not a bug; it becomes a
problem only if the fleet size / utilization target isn't stated alongside
the number.

## Why carbon and cost can conflict

`carbon_aware` optimizes carbon intensity; `price_aware` optimizes
electricity price. The two sites' carbon and price curves are not
perfectly correlated (a site can be carbon-cheap and price-expensive at
the same hour, or vice versa) -- see `models/grid.py`'s profile
definitions. A policy tuned for one signal can therefore look worse on the
other. `integrated_coordination` weights both together
(`w_carbon=6.0`, `w_price=4.0`) rather than optimizing either alone, which
is why it doesn't match either single-objective policy's best-case number
on its own metric.

## DVFS trades power for headroom, not speed, in this simulator

`dvfs_aware` and `integrated_coordination` can *increase* facility energy
(observed: +11% to +16% in some scenarios) by promoting servers running
latency-sensitive jobs to `high_performance` DVFS. In this simulator's
power model, DVFS only scales CPU dynamic power -- it does not change a
job's progress rate (see `docs/model_assumptions.md`). So `high_performance`
here is a pure power cost bought for headroom, with no simulated
throughput benefit to offset it. A real deployment where DVFS *does*
affect throughput would see this tradeoff differently; don't read an
energy increase from DVFS-aware policies as "the algorithm is bad," read
it as "this is what the modeled tradeoff costs under this simplification."

## How to read before/after deltas

- `delta_..._vs_baseline_pct`: percent change relative to
  `baseline_first_fit` under the *same* scenario and seed. Negative is
  usually "less" (energy/carbon/cost), which is usually but not always
  good -- check deadline misses and thermal violations before calling it a
  win.
- `delta_deadline_misses_vs_baseline` / `delta_thermal_violations_vs_baseline`:
  absolute differences, not percentages (a scenario with 0 baseline misses
  makes a percentage meaningless).
- Multiple seeds exist to show whether a result is a consistent pattern or
  a one-seed artifact -- check `policy_std.csv` (research-run) or the
  per-seed rows in `ablation_summary`/`sensitivity_summary` before treating
  a single number as representative.
- `external_helicyn` results reflect `helicyn-ml`'s `policy_ranker`, which
  is teacher-imitation trained (imitates a hand-written heuristic score),
  not trained from real or simulated outcomes. A result close to
  `baseline_first_fit` is an expected, honest finding given that -- not a
  sign the adapter is broken.

## What this project will not do with these results

It will not report a single "X% savings" headline number stripped of its
scenario, seed, and metric context. Every number in this evidence package
is scenario-relative, simulation-only, and conditioned on the modeling
assumptions in `docs/model_assumptions.md`. See `docs/limitations.md` and
`docs/claims_audit.md` for exactly what can and cannot be claimed from this
work.

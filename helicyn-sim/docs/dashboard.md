# Dashboard

A local Streamlit research cockpit for inspecting simulator runs and the
Phase 3 research evidence package. **This is not a marketing dashboard,
not the public website, and not helicyn.com/control-plane** -- it's a
read-only inspection layer over files already on disk, meant for
understanding the simulator and pulling together evidence for a paper.

## Launch

```bash
cd /home/user/helicyn/helicyn-sim
streamlit run helicyn_sim/dashboard/app.py
```

or:

```bash
python -m helicyn_sim dashboard
```

(the CLI command launches the same thing, or prints the exact `streamlit
run` command if streamlit isn't installed / can't be launched from the
current environment). Install the dashboard dependency first if needed:
`pip install -e ".[dev]"` (streamlit is included there) or `".[dashboard]"`.

## Sidebar

- **Results root**: a `research-run` output directory, default
  `research_outputs/main_experiment`. Ablation/sensitivity/figures/tables/
  claims-audit/research-report paths are derived as siblings of this
  directory's parent (`research_outputs/ablation`, `research_outputs/figures`,
  etc.) and can be overridden individually under "Advanced paths."
- **Run folder**: a single-policy run directory (containing
  `run_summary.json`), default the first one found under `runs/`, or
  `runs/demo_baseline`.
- **Page selector**: the 10 pages, listed below.
- A permanent safety warning and a data-availability checklist (✅/❌ per
  output type) are always shown, regardless of which page is selected.

## Pages

1. **Overview**: fleet-wide KPIs (scenario/policy/seed/run counts, best
   policy per metric) if a research-run aggregate exists, plus a summary of
   Helicyn ML v1's status, the simulator, and the policies compared.
2. **Single Run Inspector**: everything about one run -- summary cards,
   fleet-wide and per-site timeseries charts, a filterable job table, a
   filterable policy-decisions table (flags `rejected_external_action`
   rows), and download buttons for all four output files.
3. **Policy Comparison**: the aggregate table across policies/scenarios,
   bar charts per metric, a scenario filter, and an auto-generated
   (cautious-language) interpretation panel. Falls back to a Phase 2
   `before-after` summary if no Phase 3 aggregate exists.
4. **Integrated Coordination**: explains `integrated_coordination`
   specifically (it is explicitly labeled as NOT trained ML and NOT the
   same as `external_helicyn`), shows its scoring formula and weight
   table, compares it against baseline, and surfaces representative
   placement/delay/DVFS decisions with their reasons.
5. **External Helicyn**: explains the adapter and its current limitation
   (helicyn-ml's `policy_ranker` is teacher-imitation only), includes a
   live health-check button against a `helicyn-ml serve` URL, shows
   results/rejected-action counts if a run exists, and prints the exact
   commands to produce one if it doesn't.
6. **Ablation**: the policy-by-policy staging table, energy/carbon/cost
   waterfall charts, deadline-miss/thermal-violation bar charts, and an
   interpretation panel (which stage helped most, which created tradeoffs,
   whether `integrated_coordination` beat every single-objective heuristic).
7. **Sensitivity**: filterable one-factor-at-a-time sweep charts (one line
   chart per variable, policies overlaid) plus a variable x value heatmap
   for `integrated_coordination`, and an interpretation panel.
8. **Paper Outputs**: the figure gallery (with captions), all CSV tables
   plus the rendered `paper_tables.md`, and the rendered research report --
   every artifact has a download button and a copyable file path.
9. **Claims Audit**: every claim categorized supported / partially
   supported / unsupported with color badges, computed live from whatever
   results directory is selected (plus the raw generated file if present).
10. **Methodology / Assumptions**: renders `docs/model_assumptions.md`,
    `docs/equations.md`, `docs/experimental_methodology.md`,
    `docs/results_interpretation.md`, and `docs/limitations.md` in tabs, so
    the dashboard is self-contained.

## Data files the dashboard reads

| Page | Files |
|---|---|
| Single Run Inspector | `<run_dir>/{run_summary.json,timeseries_metrics.csv,job_results.csv,policy_decisions.csv,config_resolved.yaml}` |
| Policy Comparison, Integrated Coordination, External Helicyn | `<results_root>/aggregate/all_runs_summary.csv`, `<results_root>/runs/**/policy_decisions.csv` |
| Ablation | `<ablation_dir>/ablation_summary.csv` |
| Sensitivity | `<sensitivity_dir>/sensitivity_summary.csv` |
| Paper Outputs | `<figures_dir>/*.png` + `captions.md`, `<tables_dir>/*.csv` + `paper_tables.md`, `<research_report_path>` |
| Claims Audit | computed live + `<claims_audit_path>` |
| Methodology | `docs/*.md` |

## Generating missing outputs

Every page that can't find its data shows an explicit "no X found" message
with the exact command to generate it, instead of crashing or showing a
blank page. See `README.md`'s Phase 3 section, or run in order:

```bash
python -m helicyn_sim validate-scenarios --config configs/research_matrix.yaml
python -m helicyn_sim research-run --config configs/research_matrix.yaml --out research_outputs/main_experiment --quick
python -m helicyn_sim ablation --config configs/ablation.yaml --out research_outputs/ablation --quick
python -m helicyn_sim sensitivity --config configs/sensitivity.yaml --out research_outputs/sensitivity --quick
python -m helicyn_sim paper-figures --results research_outputs/main_experiment --ablation research_outputs/ablation --sensitivity research_outputs/sensitivity --out research_outputs/figures
python -m helicyn_sim paper-tables --results research_outputs/main_experiment --ablation research_outputs/ablation --sensitivity research_outputs/sensitivity --out research_outputs/tables
python -m helicyn_sim claims-audit --results research_outputs/main_experiment --out research_outputs/claims_audit.md
python -m helicyn_sim research-report --results research_outputs/main_experiment --ablation research_outputs/ablation --sensitivity research_outputs/sensitivity --claims research_outputs/claims_audit.md --out research_outputs/research_report.md
```

## Interpreting charts

Every chart is matplotlib-rendered simulated output (no plotly dependency
was added -- see docs/dashboard.md's own build note below). Read charts the
same way as the static `paper-figures` PNGs: relative to baseline, under
this scenario's assumptions, never as a production measurement. See
`docs/results_interpretation.md` for the specific pitfalls (oversized
fleets inflating consolidation's apparent savings, energy wins that hide
SLA/thermal regressions, DVFS trading power for headroom rather than
speed in this simulator).

## Exporting

Every figure and table on the Paper Outputs page has its own download
button. For a text-only summary without launching Streamlit at all, use:

```bash
python -m helicyn_sim dashboard-snapshot --results research_outputs/main_experiment --out research_outputs/dashboard_snapshot.md
```

## Limitations

- The dashboard is read-only: it never runs a simulation, never launches
  `research-run`/`ablation`/`sensitivity`/etc. itself, and never modifies
  any file on disk (except the one snapshot command, which only writes the
  file it's told to write).
- Charts are matplotlib (no plotly), so they are static images per
  interaction, not fully interactive (no hover tooltips, no zoom/pan
  beyond Streamlit's built-in image controls). Plotly was intentionally
  not added as a new dependency -- see Task B's brief.
- The External Helicyn health-check button makes a real HTTP call; if no
  `helicyn-ml serve` process is running, it reports "unavailable" rather
  than crashing.
- Like every other output in this project, everything shown here is
  simulated under documented modeling assumptions -- see
  `docs/limitations.md` and `docs/claims_audit.md`.

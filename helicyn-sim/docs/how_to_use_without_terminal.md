# Using Helicyn Sim without typing terminal commands

This doc explains how to run the simulator and view results locally
without manually typing `python -m helicyn_sim ...` commands. It does not
change any simulator equation, policy, or config -- it only makes the
existing Phase 1-4 simulator and dashboard reachable through buttons.

## Option A: Double-click launcher (macOS)

From the repo root:

1. Double-click **`open_helicyn_dashboard.command`**.
2. A Terminal window opens and starts the Streamlit dashboard. Leave that
   window open while you use the dashboard; closing it stops the server.
3. In the dashboard sidebar, go to **Run Simulator** or **Run Policy
   Comparison** to run simulations with buttons instead of commands.

If you also want the optional `external_helicyn` policy (a real
`helicyn-ml serve` process), either:

- Double-click **`open_full_helicyn_stack.command`**, which starts the
  `helicyn-ml` server in a new Terminal window and then opens the
  dashboard, or
- Double-click **`start_helicyn_ml_server.command`** first, then
  **`open_helicyn_dashboard.command`**.

**Limitation:** `open_full_helicyn_stack.command` uses AppleScript to open
a second Terminal window automatically. If macOS blocks Terminal
automation (System Settings -> Privacy & Security -> Automation), it will
tell you to start `start_helicyn_ml_server.command` manually instead, then
continue to open the dashboard.

## Option B: Terminal, one command

```
cd helicyn-sim
python -m helicyn_sim dashboard
```

This launches the same Streamlit dashboard as Option A. Everything after
this point (running simulations, comparisons, viewing KPIs) happens
through the dashboard UI, not the terminal.

## Option C: Full stack from the terminal

```
# Terminal window 1
cd helicyn-ml
python -m helicyn_ml serve --models artifacts/models --host 127.0.0.1 --port 8765

# Terminal window 2
cd helicyn-sim
python -m helicyn_sim dashboard
```

## Which policy should I use?

- **`integrated_coordination`** is a built-in heuristic policy and needs
  **no external server**. Use this for normal simulator use.
- **`external_helicyn`** calls a real running `helicyn-ml serve` process
  over HTTP. Use it only when the helicyn-ml server is running (Option C,
  or `start_helicyn_ml_server.command` / `open_full_helicyn_stack.command`
  in Option A). The dashboard's "Check server" button tells you honestly
  whether it's reachable before you run anything -- it will not pretend
  `external_helicyn` works if the server is offline.

## Where runs are saved

Both dashboard pages write to `helicyn-sim/runs/<your folder name>/`.
Folder names are validated so they cannot contain path separators or `..`
-- they always resolve to a subfolder of `runs/`.

- **Run Simulator** writes `run_summary.json`, `timeseries_metrics.csv`,
  `job_results.csv`, `policy_decisions.csv`, and `config_resolved.yaml`
  directly under `runs/<folder>/`.
- **Run Policy Comparison** writes one subfolder per policy plus a
  `runs/<folder>/comparison/` folder containing `summary.csv`,
  `summary.json`, and `report.md`.

## Viewing comparison outputs

After a "Run Policy Comparison" run completes, the dashboard automatically
loads and displays:

- the policy comparison table (`comparison/summary.csv`)
- bar charts for facility energy, carbon, cost, deadline misses, and
  thermal violations
- the generated `comparison/report.md`

You can also inspect any past run later from the **Policy Comparison**
(read-only) page by pointing it at a `research_outputs/` or
`runs/before_after*/comparison/summary.csv` path, or from **Single Run
Inspector** for a single run folder.

## Troubleshooting: Streamlit not found

If a launcher window prints something like `streamlit: command not
found`, install the dashboard dependencies first:

```
cd helicyn-sim
pip install -e ".[dev]"
```

(or `pip install -e ".[dashboard]"` for just the dashboard extra), then
re-run the launcher.

## Troubleshooting: helicyn-ml models missing

If `start_helicyn_ml_server.command` warns that `artifacts/models` is
missing, or the server fails to start, the helicyn-ml model artifacts
haven't been built/trained in this checkout yet. See
`helicyn-ml/README.md` and `helicyn-ml/docs/` for how to produce
`artifacts/models`. Until then, use `integrated_coordination` in the
simulator instead -- it does not depend on helicyn-ml at all.

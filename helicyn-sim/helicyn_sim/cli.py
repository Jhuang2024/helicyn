from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer
from rich.console import Console

from helicyn_sim.experiments.ablation import run_ablation
from helicyn_sim.experiments.before_after import run_before_after
from helicyn_sim.experiments.claims_audit import write_claims_audit
from helicyn_sim.experiments.dashboard_snapshot import generate_dashboard_snapshot
from helicyn_sim.experiments.paper_figures import generate_paper_figures
from helicyn_sim.experiments.paper_tables import generate_paper_tables
from helicyn_sim.experiments.research_report import generate_research_report
from helicyn_sim.experiments.research_run import run_research_experiment
from helicyn_sim.experiments.run import run_experiment
from helicyn_sim.experiments.sensitivity import run_sensitivity
from helicyn_sim.experiments.validate_scenarios import validate_scenarios
from helicyn_sim.policies import POLICY_REGISTRY
from helicyn_sim.policies.external_helicyn import DEFAULT_TIMEOUT_SECONDS, ExternalHelicynUnavailableError

app = typer.Typer(add_completion=False, help="Helicyn Sim: independent data-center scheduling simulator prototype.")
console = Console()


@app.command()
def run(
    config: Path = typer.Option(..., "--config", exists=True, help="Path to a simulator YAML config."),
    policy: str = typer.Option(
        "baseline_first_fit", "--policy", help=f"Policy name. Choices: {sorted(POLICY_REGISTRY)}"
    ),
    out: Path = typer.Option(..., "--out", help="Output directory for run artifacts."),
    resource_trace: Optional[Path] = typer.Option(
        None,
        "--resource-trace",
        help=(
            "Optional path to a helicyn-ml normalized resource-trace parquet file "
            "(e.g. ../helicyn-ml/data/processed/resources/google_cpu_memory.parquet). "
            "Used only to shape synthetic CPU/memory demand; see docs/model_assumptions.md."
        ),
    ),
    helicyn_url: Optional[str] = typer.Option(
        None,
        "--helicyn-url",
        help="helicyn-ml /recommend URL, only used when --policy external_helicyn "
        "(default http://127.0.0.1:8765/recommend).",
    ),
    helicyn_timeout: float = typer.Option(
        DEFAULT_TIMEOUT_SECONDS, "--helicyn-timeout", help="Timeout in seconds for each helicyn-ml HTTP call."
    ),
) -> None:
    """Run one simulation and write run_summary.json, timeseries_metrics.csv,
    job_results.csv, policy_decisions.csv, and config_resolved.yaml to --out.
    """
    if policy not in POLICY_REGISTRY:
        console.print(f"[red]Unknown policy '{policy}'. Choices: {sorted(POLICY_REGISTRY)}[/red]")
        raise typer.Exit(code=1)

    try:
        summary = run_experiment(
            config_path=config,
            policy_name=policy,
            out_dir=out,
            resource_trace_path=str(resource_trace) if resource_trace else None,
            helicyn_url=helicyn_url,
            helicyn_timeout=helicyn_timeout,
        )
    except ExternalHelicynUnavailableError as exc:
        console.print(f"[red]external_helicyn unavailable: {exc}[/red]")
        raise typer.Exit(code=1) from None

    console.print(f"[green]Run complete.[/green] Outputs written to {out}")
    console.print(
        f"policy={summary['policy_name']} completed={summary['completed_jobs']}/{summary['total_jobs']} "
        f"rejected={summary['rejected_jobs']} deadline_misses={summary['deadline_misses']} "
        f"carbon_kgco2e={summary['total_carbon_kgco2e']:.2f} cost_usd={summary['total_cost_usd']:.2f} "
        f"avg_pue={summary['average_pue']:.3f} max_rack_temp_c={summary['max_rack_temp_c']:.1f}"
    )


@app.command(name="before-after")
def before_after(
    config: Path = typer.Option(..., "--config", exists=True, help="Path to a simulator YAML config."),
    out: Path = typer.Option(..., "--out", help="Output directory for all per-policy runs + comparison/."),
    resource_trace: Optional[Path] = typer.Option(
        None,
        "--resource-trace",
        help="Optional helicyn-ml normalized resource-trace parquet file; shapes demand for every policy run.",
    ),
    helicyn_url: Optional[str] = typer.Option(
        None,
        "--helicyn-url",
        help="If given and reachable, also runs external_helicyn as an AFTER policy "
        "(e.g. http://127.0.0.1:8765/recommend). If unreachable, it is skipped, not a hard failure.",
    ),
    helicyn_timeout: float = typer.Option(
        DEFAULT_TIMEOUT_SECONDS, "--helicyn-timeout", help="Timeout in seconds for each helicyn-ml HTTP call."
    ),
) -> None:
    """Run baseline_first_fit + every built-in heuristic policy (+
    external_helicyn if reachable) under the same config, and write
    comparison/summary.csv, comparison/summary.json, comparison/report.md.
    """
    result = run_before_after(
        config_path=config,
        out_dir=out,
        resource_trace_path=str(resource_trace) if resource_trace else None,
        helicyn_url=helicyn_url,
        helicyn_timeout=helicyn_timeout,
    )

    console.print(f"[green]Before/after run complete.[/green] Outputs written to {out}")
    console.print(f"external_helicyn: {result['external_status']}")
    for row in result["rows"]:
        console.print(
            f"  {row['policy_name']:<18} completed={row['completed_jobs']}/{row['total_jobs']} "
            f"deadline_misses={row['deadline_misses']} "
            f"carbon_delta={row['delta_carbon_vs_baseline_pct']} cost_delta={row['delta_cost_vs_baseline_pct']}"
        )
    console.print(f"Comparison: {result['comparison_dir']}")


@app.command(name="validate-scenarios")
def validate_scenarios_cmd(
    config: Path = typer.Option(..., "--config", exists=True, help="Path to a research scenario matrix YAML."),
) -> None:
    """Quick baseline_first_fit sanity check per scenario in a research
    config: reports utilization/completion/thermal numbers and warns about
    scenarios that don't look calibrated for what their name claims (e.g.
    an oversized fleet, no carbon variation). Does not auto-tune anything.
    """
    results = validate_scenarios(config)
    any_warnings = False
    for r in results:
        console.print(f"[bold]{r.scenario_name}[/bold]")
        console.print(
            f"  avg_cpu_util={r.average_cpu_utilization * 100:.1f}% avg_mem_util={r.average_memory_utilization * 100:.1f}% "
            f"completed={r.completed_jobs}/{r.total_jobs} rejected={r.rejected_jobs} deadline_misses={r.deadline_misses}"
        )
        console.print(
            f"  peak_facility_power_kw={r.peak_facility_power_kw:.2f} max_rack_temp_c={r.max_rack_temp_c:.1f} "
            f"thermal_violations={r.thermal_violations} flexible_job_fraction={r.flexible_job_fraction * 100:.1f}%"
        )
        for w in r.warnings:
            any_warnings = True
            console.print(f"  [yellow]WARNING:[/yellow] {w}")
        console.print("")

    if any_warnings:
        console.print(
            "[yellow]Some scenarios have calibration warnings above.[/yellow] "
            "These are informational, not blocking -- edit the config if a scenario should look different."
        )
    else:
        console.print("[green]No calibration warnings.[/green]")


@app.command(name="research-run")
def research_run(
    config: Path = typer.Option(..., "--config", exists=True, help="Path to a research scenario matrix YAML."),
    out: Path = typer.Option(..., "--out", help="Output directory (runs/ + aggregate/ written here)."),
    quick: bool = typer.Option(
        False, "--quick", help="3 scenarios x first 2 seeds instead of all scenarios x all seeds."
    ),
    resource_trace: Optional[Path] = typer.Option(
        None, "--resource-trace", help="Optional helicyn-ml normalized resource-trace parquet file."
    ),
    helicyn_url: Optional[str] = typer.Option(
        None, "--helicyn-url", help="If given and reachable, also runs external_helicyn in every scenario/seed."
    ),
    helicyn_timeout: float = typer.Option(
        DEFAULT_TIMEOUT_SECONDS, "--helicyn-timeout", help="Timeout in seconds for each helicyn-ml HTTP call."
    ),
) -> None:
    """Run every research policy (baseline + 5 heuristics + integrated_coordination,
    + external_helicyn if reachable) across a scenario x seed matrix, and
    write per-run outputs plus aggregate/ CSVs (see docs/experimental_methodology.md).
    """
    result = run_research_experiment(
        config_path=config,
        out_dir=out,
        quick=quick,
        resource_trace_path=str(resource_trace) if resource_trace else None,
        helicyn_url=helicyn_url,
        helicyn_timeout=helicyn_timeout,
    )
    console.print(f"[green]Research run complete.[/green] {result['total_runs']} runs written to {result['runs_dir']}")
    console.print(f"scenarios={result['scenarios']} seeds={result['seeds']}")
    console.print(f"policies={result['policies']} external_helicyn={result['external_status']}")
    console.print(f"Aggregate outputs: {result['aggregate_dir']}")


@app.command()
def ablation(
    config: Path = typer.Option(..., "--config", exists=True, help="Path to configs/ablation.yaml (or similar)."),
    out: Path = typer.Option(..., "--out", help="Output directory for ablation_summary.{csv,json,md} + runs/."),
    quick: bool = typer.Option(False, "--quick", help="Use only the first seed instead of averaging all seeds."),
    resource_trace: Optional[Path] = typer.Option(
        None, "--resource-trace", help="Optional helicyn-ml normalized resource-trace parquet file."
    ),
    helicyn_url: Optional[str] = typer.Option(
        None, "--helicyn-url", help="If given and reachable, adds external_helicyn as a final stage."
    ),
    helicyn_timeout: float = typer.Option(
        DEFAULT_TIMEOUT_SECONDS, "--helicyn-timeout", help="Timeout in seconds for each helicyn-ml HTTP call."
    ),
) -> None:
    """Run every policy in a fixed stage order under one reference scenario
    and show what each one costs/buys relative to baseline and to the
    previous stage -- see docs/experimental_methodology.md.
    """
    result = run_ablation(
        config_path=config,
        out_dir=out,
        quick=quick,
        resource_trace_path=str(resource_trace) if resource_trace else None,
        helicyn_url=helicyn_url,
        helicyn_timeout=helicyn_timeout,
    )
    console.print(f"[green]Ablation complete.[/green] scenario={result['scenario']} seeds={result['seeds']}")
    console.print(f"external_helicyn={result['external_status']}")
    for row in result["rows"]:
        console.print(
            f"  {row['stage']:<28} energy_delta={row['delta_vs_baseline_pct']:+.1f}% "
            f"carbon_delta={row['carbon_delta_vs_baseline_pct']:+.1f}% deadline_misses={row['deadline_misses']:.1f}"
        )
    console.print(f"Outputs: {result['out_dir']}")


@app.command()
def sensitivity(
    config: Path = typer.Option(..., "--config", exists=True, help="Path to configs/sensitivity.yaml (or similar)."),
    out: Path = typer.Option(..., "--out", help="Output directory for sensitivity_summary.csv + report + runs/."),
    quick: bool = typer.Option(
        False, "--quick", help="Use quick_variables (2 values/variable) and only the first seed."
    ),
    resource_trace: Optional[Path] = typer.Option(
        None, "--resource-trace", help="Optional helicyn-ml normalized resource-trace parquet file."
    ),
    helicyn_url: Optional[str] = typer.Option(
        None, "--helicyn-url", help="If given and reachable, also runs external_helicyn in every sweep point."
    ),
    helicyn_timeout: float = typer.Option(
        DEFAULT_TIMEOUT_SECONDS, "--helicyn-timeout", help="Timeout in seconds for each helicyn-ml HTTP call."
    ),
) -> None:
    """One-factor-at-a-time sensitivity sweep (load, carbon variability,
    ambient temperature, deadline tightness, idle power) comparing
    baseline_first_fit vs integrated_coordination (+ external_helicyn if
    reachable). See docs/experimental_methodology.md.
    """
    result = run_sensitivity(
        config_path=config,
        out_dir=out,
        quick=quick,
        resource_trace_path=str(resource_trace) if resource_trace else None,
        helicyn_url=helicyn_url,
        helicyn_timeout=helicyn_timeout,
    )
    console.print(f"[green]Sensitivity sweep complete.[/green] variables={result['variables']} seeds={result['seeds']}")
    console.print(f"external_helicyn={result['external_status']}")
    console.print(f"Outputs: {result['out_dir']}")


@app.command(name="paper-figures")
def paper_figures(
    results: Path = typer.Option(..., "--results", exists=True, help="A research-run output directory."),
    out: Path = typer.Option(..., "--out", help="Output directory for PNGs + captions.md."),
    ablation: Optional[Path] = typer.Option(None, "--ablation", help="An ablation output directory (optional)."),
    sensitivity: Optional[Path] = typer.Option(
        None, "--sensitivity", help="A sensitivity output directory (optional)."
    ),
) -> None:
    """Generate matplotlib-only figures (no seaborn) from research-run,
    ablation, and sensitivity outputs, plus captions.md. See
    docs/results_interpretation.md for how to read them.
    """
    result = generate_paper_figures(results, out, ablation_dir=ablation, sensitivity_dir=sensitivity)
    console.print(f"[green]Generated {len(result['generated'])} figures.[/green] Outputs: {result['out_dir']}")
    for filename in result["generated"]:
        console.print(f"  {filename}")


@app.command(name="paper-tables")
def paper_tables(
    results: Path = typer.Option(..., "--results", exists=True, help="A research-run output directory."),
    out: Path = typer.Option(..., "--out", help="Output directory for CSV tables + paper_tables.md."),
    ablation: Optional[Path] = typer.Option(None, "--ablation", help="An ablation output directory (optional)."),
    sensitivity: Optional[Path] = typer.Option(
        None, "--sensitivity", help="A sensitivity output directory (optional)."
    ),
) -> None:
    """Generate copy-pasteable CSV + Markdown tables (setup, model
    assumptions, policy comparison, ablation, sensitivity, limitations).
    """
    result = generate_paper_tables(results, out, ablation_dir=ablation, sensitivity_dir=sensitivity)
    console.print(f"[green]Generated {len(result['generated'])} table files.[/green] Outputs: {result['out_dir']}")
    for filename in result["generated"]:
        console.print(f"  {filename}")


@app.command(name="claims-audit")
def claims_audit(
    results: Path = typer.Option(..., "--results", exists=True, help="A research-run output directory."),
    out: Path = typer.Option(..., "--out", help="Output path for claims_audit.md."),
) -> None:
    """Categorize every claim this project might make as supported /
    partially_supported / unsupported, with evidence file and caveat.
    """
    path = write_claims_audit(results, out)
    console.print(f"[green]Claims audit written.[/green] {path}")


@app.command(name="research-report")
def research_report(
    results: Path = typer.Option(..., "--results", exists=True, help="A research-run output directory."),
    out: Path = typer.Option(..., "--out", help="Output path for research_report.md."),
    ablation: Optional[Path] = typer.Option(None, "--ablation", help="An ablation output directory (optional)."),
    sensitivity: Optional[Path] = typer.Option(
        None, "--sensitivity", help="A sensitivity output directory (optional)."
    ),
    claims: Optional[Path] = typer.Option(None, "--claims", help="A claims-audit markdown file (optional)."),
) -> None:
    """Generate the single research-report markdown document (12 sections,
    see docs/experimental_methodology.md) tying research-run, ablation,
    sensitivity, and claims-audit outputs together.
    """
    path = generate_research_report(
        results, out, ablation_dir=ablation, sensitivity_dir=sensitivity, claims_audit_path=claims
    )
    console.print(f"[green]Research report written.[/green] {path}")


@app.command()
def dashboard() -> None:
    """Launch the Streamlit research dashboard (helicyn_sim/dashboard/app.py).
    Falls back to printing the exact command if streamlit isn't installed
    or can't be launched from here.
    """
    import shutil
    import subprocess
    import sys

    app_path = Path(__file__).parent / "dashboard" / "app.py"
    streamlit_cmd = f"streamlit run {app_path}"

    if shutil.which("streamlit") is None:
        console.print("[yellow]streamlit is not installed or not on PATH.[/yellow]")
        console.print("Install it with: pip install -e \".[dev]\"  (or \".[dashboard]\")")
        console.print("Then run:")
        console.print(streamlit_cmd, style="bold")
        raise typer.Exit(code=0)

    console.print(f"Launching: {streamlit_cmd}")
    try:
        subprocess.run(["streamlit", "run", str(app_path)], check=False)
    except (OSError, KeyboardInterrupt):
        console.print("Run:")
        console.print(streamlit_cmd, style="bold")
        sys.exit(0)


@app.command(name="dashboard-snapshot")
def dashboard_snapshot(
    results: Path = typer.Option(..., "--results", exists=True, help="A research-run output directory."),
    out: Path = typer.Option(..., "--out", help="Output path for dashboard_snapshot.md."),
) -> None:
    """Generate a static markdown summary of the same overview information
    the dashboard's Overview page shows -- useful when Streamlit isn't running.
    """
    path = generate_dashboard_snapshot(results, out)
    console.print(f"[green]Dashboard snapshot written.[/green] {path}")


@app.command()
def version() -> None:
    """Print the helicyn-sim package version."""
    from helicyn_sim import __version__

    console.print(__version__)


if __name__ == "__main__":
    app()

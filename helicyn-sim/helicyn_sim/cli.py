from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer
from rich.console import Console

from helicyn_sim.experiments.run import run_experiment
from helicyn_sim.policies import POLICY_REGISTRY

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
) -> None:
    """Run one simulation and write run_summary.json, timeseries_metrics.csv,
    job_results.csv, policy_decisions.csv, and config_resolved.yaml to --out.
    """
    if policy not in POLICY_REGISTRY:
        console.print(f"[red]Unknown policy '{policy}'. Choices: {sorted(POLICY_REGISTRY)}[/red]")
        raise typer.Exit(code=1)

    summary = run_experiment(
        config_path=config,
        policy_name=policy,
        out_dir=out,
        resource_trace_path=str(resource_trace) if resource_trace else None,
    )

    console.print(f"[green]Run complete.[/green] Outputs written to {out}")
    console.print(
        f"policy={summary['policy_name']} completed={summary['completed_jobs']}/{summary['total_jobs']} "
        f"rejected={summary['rejected_jobs']} deadline_misses={summary['deadline_misses']} "
        f"carbon_kgco2e={summary['total_carbon_kgco2e']:.2f} cost_usd={summary['total_cost_usd']:.2f} "
        f"avg_pue={summary['average_pue']:.3f} max_rack_temp_c={summary['max_rack_temp_c']:.1f}"
    )


@app.command()
def version() -> None:
    """Print the helicyn-sim package version."""
    from helicyn_sim import __version__

    console.print(__version__)


if __name__ == "__main__":
    app()

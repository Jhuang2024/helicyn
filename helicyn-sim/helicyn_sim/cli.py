from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer
from rich.console import Console

from helicyn_sim.experiments.before_after import run_before_after
from helicyn_sim.experiments.run import run_experiment
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


@app.command()
def version() -> None:
    """Print the helicyn-sim package version."""
    from helicyn_sim import __version__

    console.print(__version__)


if __name__ == "__main__":
    app()

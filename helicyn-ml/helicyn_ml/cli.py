from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from helicyn_ml.config import (
    ARTIFACTS_DIR,
    EVAL_DIR,
    EXAMPLES_DIR,
    MODELS_DIR,
    PROCESSED_DIR,
    RAW_DIR,
    SAMPLES_DIR,
    SPLITS_DIR,
)
from helicyn_ml.datasets import sample_generator
from helicyn_ml.datasets.registry import (
    ALL_SMALL_DATASET_IDS,
    all_cards,
    download_dataset,
    get_card,
    list_dataset_ids,
)
from helicyn_ml.preprocessing.normalize_grid import normalize_grid_dataset
from helicyn_ml.preprocessing.normalize_power import normalize_power_dataset
from helicyn_ml.preprocessing.normalize_weather import normalize_weather_dataset
from helicyn_ml.preprocessing.normalize_workloads import normalize_workload_dataset
from helicyn_ml.preprocessing.split import run_split
from helicyn_ml.utils.io import ensure_dir, load_yaml, save_parquet
from helicyn_ml.utils.logging import get_logger

app = typer.Typer(add_completion=False, help="Helicyn ML: ML + optimization control prototype for data-center scheduling.")
datasets_app = typer.Typer(help="Dataset registry, download, and description commands.")
train_app = typer.Typer(help="Train Helicyn ML models.")
app.add_typer(datasets_app, name="datasets")
app.add_typer(train_app, name="train")

console = Console()
logger = get_logger(__name__)

_NORMALIZERS = {
    "workload": normalize_workload_dataset,
    "grid": normalize_grid_dataset,
    "weather": normalize_weather_dataset,
    "power": normalize_power_dataset,
}


# --------------------------------------------------------------------------- datasets
@datasets_app.command("list")
def datasets_list():
    """List all supported datasets in the registry."""
    table = Table(title="Helicyn ML Dataset Registry")
    table.add_column("dataset_id")
    table.add_column("kind")
    table.add_column("auto-download")
    table.add_column("requires creds")
    table.add_column("huge")
    for dataset_id, card in sorted(all_cards().items()):
        table.add_row(
            dataset_id,
            card.kind,
            "yes" if card.auto_download_supported else "no",
            "yes" if card.requires_credentials else "no",
            "yes" if card.is_huge else "no",
        )
    console.print(table)


@datasets_app.command("describe")
def datasets_describe(dataset_id: str):
    """Show the full dataset card for one dataset_id."""
    try:
        card = get_card(dataset_id)
    except KeyError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1)

    console.print(f"[bold]{card.display_name}[/bold] ({card.dataset_id})")
    console.print(f"purpose: {card.purpose}")
    console.print(f"source: {card.source_url}")
    console.print(f"raw folder: data/raw/{card.raw_subdir}")
    console.print(f"kind: {card.kind}")
    console.print(f"auto-download supported: {card.auto_download_supported}")
    console.print(f"requires credentials: {card.requires_credentials} {card.credential_env_vars or ''}")
    console.print(f"huge dataset: {card.is_huge}")
    console.print("teaches Helicyn:")
    for t in card.teaches:
        console.print(f"  - {t}")
    console.print("limitations:")
    for l in card.limitations:
        console.print(f"  - {l}")
    console.print(f"manual instructions: {card.manual_instructions}")


@datasets_app.command("download")
def datasets_download(
    dataset: str = typer.Option(..., "--dataset", help="dataset_id, or 'all-small' for the smoke-test bundle"),
    out: Path = typer.Option(RAW_DIR, "--out", help="output raw data directory"),
):
    """Download (or attempt to download) one dataset, or the all-small bundle."""
    if dataset == "all-small":
        console.print(f"[bold]Downloading all-small bundle:[/bold] {ALL_SMALL_DATASET_IDS}")
        for dataset_id in ALL_SMALL_DATASET_IDS:
            card = get_card(dataset_id)
            target_dir = Path(out) / card.raw_subdir
            _download_one(dataset_id, target_dir)
        return

    card = get_card(dataset)
    target_dir = Path(out)
    _download_one(dataset, target_dir)


def _download_one(dataset_id: str, target_dir: Path) -> None:
    ensure_dir(target_dir)
    result = download_dataset(dataset_id, target_dir)
    if result.success:
        console.print(f"[green]OK[/green] {dataset_id}: {result.reason} -> {result.out_path}")
    else:
        console.print(f"[yellow]SKIP[/yellow] {dataset_id}: {result.reason}")
        if result.manual_instructions:
            console.print(f"  manual: {result.manual_instructions}")


# --------------------------------------------------------------------------- ingest
@app.command("ingest")
def ingest(
    dataset: str = typer.Option(..., "--dataset"),
    input: Path = typer.Option(..., "--input"),
    out: Path = typer.Option(..., "--out"),
):
    """Normalize one dataset's raw files into a NormalizedXRecord parquet file."""
    card = get_card(dataset)
    normalizer = _NORMALIZERS[card.kind]
    df = normalizer(dataset, input)
    if df.empty:
        console.print(f"[yellow]No records ingested for {dataset} (missing/empty raw data under {input}).[/yellow]")
        return
    save_parquet(df, out)
    console.print(f"[green]Wrote {len(df)} records[/green] -> {out}")


@app.command("ingest-all")
def ingest_all(config: Path = typer.Option(Path("configs/datasets.yaml"), "--config")):
    """Ingest every dataset listed in configs/datasets.yaml, skipping missing ones."""
    cfg = load_yaml(config) if Path(config).exists() else {}
    entries = cfg.get("datasets", [])
    if not entries:
        entries = _default_ingest_entries()

    for entry in entries:
        dataset_id = entry["dataset_id"]
        input_dir = Path(entry["input"])
        out_path = Path(entry["out"])
        card = get_card(dataset_id)
        normalizer = _NORMALIZERS[card.kind]
        df = normalizer(dataset_id, input_dir)
        if df.empty:
            console.print(f"[yellow]SKIP[/yellow] {dataset_id}: no data under {input_dir}")
            continue
        save_parquet(df, out_path)
        console.print(f"[green]OK[/green] {dataset_id}: {len(df)} records -> {out_path}")

    _ensure_processed_floor()


def _default_ingest_entries():
    return [
        {"dataset_id": "burstgpt", "input": RAW_DIR / "burstgpt", "out": PROCESSED_DIR / "workloads" / "burstgpt.parquet"},
        {"dataset_id": "alibaba-v2018", "input": RAW_DIR / "alibaba" / "v2018", "out": PROCESSED_DIR / "workloads" / "alibaba_v2018.parquet"},
        {"dataset_id": "alibaba-gpu-v2020", "input": RAW_DIR / "alibaba" / "gpu-v2020", "out": PROCESSED_DIR / "workloads" / "alibaba_gpu_v2020.parquet"},
        {"dataset_id": "azure-llm-2024", "input": RAW_DIR / "azure" / "llm-2024", "out": PROCESSED_DIR / "workloads" / "azure_llm_2024.parquet"},
        {"dataset_id": "azure-functions-2019", "input": RAW_DIR / "azure" / "functions-2019", "out": PROCESSED_DIR / "workloads" / "azure_functions_2019.parquet"},
        {"dataset_id": "google-2019-local", "input": RAW_DIR / "google" / "clusterdata2019_sample", "out": PROCESSED_DIR / "workloads" / "google_2019_sample.parquet"},
        {"dataset_id": "electricity-maps-sample", "input": RAW_DIR / "electricity_maps", "out": PROCESSED_DIR / "grid" / "electricity_maps.parquet"},
        {"dataset_id": "gridstatus", "input": RAW_DIR / "gridstatus", "out": PROCESSED_DIR / "grid" / "gridstatus.parquet"},
        {"dataset_id": "open-meteo-sample", "input": RAW_DIR / "open_meteo", "out": PROCESSED_DIR / "weather" / "open_meteo.parquet"},
        {"dataset_id": "scaleout-power", "input": RAW_DIR / "scaleout_power", "out": PROCESSED_DIR / "power" / "scaleout_power.parquet"},
    ]


_MIN_PROCESSED_ROWS = 200


def _ensure_processed_floor():
    """If real-dataset ingestion produced too little data for a usable
    end-to-end smoke run, top up with clearly-labeled synthetic samples
    (never silently replacing real data - it's additive, and every row is
    stamped source_dataset='synthetic_sample').
    """
    checks = [
        (PROCESSED_DIR / "workloads", sample_generator.generate_workloads, "workloads_synthetic_topup.parquet"),
        (PROCESSED_DIR / "grid", sample_generator.generate_grid, "grid_synthetic_topup.parquet"),
        (PROCESSED_DIR / "weather", sample_generator.generate_weather, "weather_synthetic_topup.parquet"),
        (PROCESSED_DIR / "power", sample_generator.generate_power, "power_synthetic_topup.parquet"),
    ]
    for directory, generator_fn, filename in checks:
        directory = Path(directory)
        existing = list(directory.glob("*.parquet")) if directory.exists() else []
        total_rows = 0
        for f in existing:
            try:
                import pandas as pd

                total_rows += len(pd.read_parquet(f))
            except Exception:  # noqa: BLE001
                pass
        if total_rows < _MIN_PROCESSED_ROWS:
            df = generator_fn()
            save_parquet(df, directory / filename)
            console.print(
                f"[yellow]NOTE[/yellow] {directory.name}: only {total_rows} real/downloaded rows found; "
                f"added {len(df)} synthetic_sample rows so the pipeline can run end-to-end. "
                "These rows are clearly marked source_dataset=synthetic_sample."
            )


# --------------------------------------------------------------------------- split
@app.command("split")
def split_cmd(
    workloads: Path = typer.Option(PROCESSED_DIR / "workloads", "--workloads"),
    grid: Path = typer.Option(PROCESSED_DIR / "grid", "--grid"),
    weather: Path = typer.Option(PROCESSED_DIR / "weather", "--weather"),
    power: Path = typer.Option(PROCESSED_DIR / "power", "--power"),
    config: Path = typer.Option(Path("configs/split.yaml"), "--config"),
    out: Path = typer.Option(SPLITS_DIR, "--out"),
):
    """Create time-ordered train/val/test splits for all processed data kinds."""
    cfg = load_yaml(config) if Path(config).exists() else {}
    ratios = tuple(cfg.get("ratios", [0.70, 0.15, 0.15]))
    summary = run_split(workloads, grid, weather, power, out, ratios=ratios)
    console.print("[green]Split complete.[/green]")
    console.print(json.dumps(summary, indent=2, default=str))


# --------------------------------------------------------------------------- train
def _run_and_report(name: str, run_fn):
    console.print(f"[bold]Training {name}...[/bold]")
    result = run_fn()
    status = result.get("status")
    color = {"trained": "green", "analytical_fallback": "yellow", "skipped": "yellow"}.get(status, "white")
    console.print(f"[{color}]{name}: {status}[/{color}]")
    return result


@train_app.command("workload-forecaster")
def train_workload_forecaster(config: Path = typer.Option(Path("configs/train_workload_forecaster.yaml"), "--config")):
    from helicyn_ml.training import train_workload_forecaster as m

    _run_and_report("workload_forecaster", m.run)


@train_app.command("runtime-predictor")
def train_runtime_predictor(config: Path = typer.Option(Path("configs/train_runtime_predictor.yaml"), "--config")):
    from helicyn_ml.training import train_runtime_predictor as m

    _run_and_report("runtime_predictor", m.run)


@train_app.command("resource-predictor")
def train_resource_predictor(config: Path = typer.Option(Path("configs/train_resource_predictor.yaml"), "--config")):
    from helicyn_ml.training import train_resource_predictor as m

    _run_and_report("resource_predictor", m.run)


@train_app.command("sla-risk-model")
def train_sla_risk_model(config: Path = typer.Option(Path("configs/train_sla_risk_model.yaml"), "--config")):
    from helicyn_ml.training import train_sla_risk_model as m

    _run_and_report("sla_risk_model", m.run)


@train_app.command("power-predictor")
def train_power_predictor(config: Path = typer.Option(Path("configs/train_power_predictor.yaml"), "--config")):
    from helicyn_ml.training import train_power_predictor as m

    _run_and_report("power_predictor", m.run)


@train_app.command("policy-ranker")
def train_policy_ranker(config: Path = typer.Option(Path("configs/train_policy_ranker.yaml"), "--config")):
    from helicyn_ml.training import train_policy_ranker as m

    _run_and_report("policy_ranker", m.run)


@train_app.command("all")
def train_all():
    """Train every model in dependency order (forecaster/runtime/resource/sla/power, then policy ranker last)."""
    from helicyn_ml.training import (
        train_policy_ranker,
        train_power_predictor,
        train_resource_predictor,
        train_runtime_predictor,
        train_sla_risk_model,
        train_workload_forecaster,
    )

    results = {}
    for name, module in [
        ("workload_forecaster", train_workload_forecaster),
        ("runtime_predictor", train_runtime_predictor),
        ("resource_predictor", train_resource_predictor),
        ("sla_risk_model", train_sla_risk_model),
        ("power_predictor", train_power_predictor),
        ("policy_ranker", train_policy_ranker),
    ]:
        results[name] = _run_and_report(name, module.run)

    table = Table(title="Training summary")
    table.add_column("model")
    table.add_column("status")
    for name, result in results.items():
        table.add_row(name, result.get("status", "unknown"))
    console.print(table)


# --------------------------------------------------------------------------- evaluate
@app.command("evaluate")
def evaluate_cmd(
    models: Path = typer.Option(MODELS_DIR, "--models"),
    splits: Path = typer.Option(SPLITS_DIR, "--splits"),
    out: Path = typer.Option(EVAL_DIR, "--out"),
):
    from helicyn_ml.training import evaluate as evaluate_module

    summary = evaluate_module.run(models_dir=models, splits_dir=splits, out_dir=out)
    console.print(f"[green]Evaluation summary written to[/green] {out}/evaluation_summary.json")
    for name, info in summary["models"].items():
        console.print(f"  {name}: {info['status']}")


# --------------------------------------------------------------------------- status
@app.command("status")
def status_cmd(
    models: Path = typer.Option(MODELS_DIR, "--models"),
    eval_dir: Path = typer.Option(EVAL_DIR, "--eval"),
    splits: Path = typer.Option(SPLITS_DIR, "--splits"),
):
    """Prints an honest model-readiness table: what actually trained, on what
    data, with what label type, and whether it's usable for research - not
    what the pipeline was designed to do. Read docs/limitations.md alongside
    this; usable_for_research="no" does not mean broken, it means "not yet
    validated as more than a smoke test."
    """
    from helicyn_ml.training.readiness import assess_all

    rows = assess_all(models_dir=models, eval_dir=eval_dir, splits_dir=splits)

    table = Table(title="Helicyn ML Model Readiness", show_lines=True)
    table.add_column("model")
    table.add_column("status")
    table.add_column("dataset used")
    table.add_column("label type")
    table.add_column("research usable")
    table.add_column("reason (truncated - see eval/<model>/*.json for full detail)", overflow="ellipsis", max_width=70, no_wrap=True)

    usable_color = {"yes": "green", "partial": "yellow", "no": "red"}
    for row in rows:
        color = usable_color.get(row["usable_for_research"], "white")
        reason = row["reason"]
        short_reason = reason if len(reason) <= 200 else reason[:197] + "..."
        table.add_row(
            row["model"],
            row["status"],
            row["dataset_used"],
            row["label_type"],
            f"[{color}]{row['usable_for_research']}[/{color}]",
            short_reason,
        )
    console.print(table)
    console.print(
        "\n[bold]Legend[/bold]: label type real=measured outcomes, weak=synthetic-deadline queueing simulation, "
        "synthetic=generated sample data, teacher=heuristic-teacher imitation labels, fallback=analytical formula "
        "(no trained model). research_usable=partial means some but not all targets/metrics clear the bar - see reason."
    )
    console.print(
        "[dim]This command reports what is actually on disk; it does not train or download anything. "
        "Run `python -m helicyn_ml demo` or the full pipeline first.[/dim]"
    )


# --------------------------------------------------------------------------- recommend
@app.command("recommend")
def recommend_cmd(
    state: Path = typer.Option(..., "--state"),
    models: Path = typer.Option(MODELS_DIR, "--models"),
    out: Path = typer.Option(..., "--out"),
):
    from helicyn_ml.policies.helicyn_policy import HelicynPolicy
    from helicyn_ml.serving.policy_adapter import load_fleet_state, recommendation_to_json

    policy = HelicynPolicy(models_dir=models)
    if policy.missing_models:
        console.print(f"[yellow]Missing trained models: {policy.missing_models} - using fallback logic for those.[/yellow]")

    fleet_state = load_fleet_state(state)
    recommendation = policy.recommend(fleet_state)
    ensure_dir(Path(out).parent)
    recommendation_to_json(recommendation, out)

    if recommendation.is_fallback:
        console.print("[yellow]Recommendation used heuristic-teacher fallback (PolicyRanker model not trained/found).[/yellow]")
    console.print(f"[green]Recommendation written to[/green] {out}")
    console.print(recommendation.explanation)


# --------------------------------------------------------------------------- serve
@app.command("serve")
def serve_cmd(
    models: Path = typer.Option(MODELS_DIR, "--models"),
    host: str = typer.Option("127.0.0.1", "--host"),
    port: int = typer.Option(8765, "--port"),
):
    try:
        import uvicorn
    except ImportError:
        console.print("[red]uvicorn/fastapi not installed. Run: pip install -e '.[serve]'[/red]")
        raise typer.Exit(1)

    from helicyn_ml.serving.api import create_app

    fastapi_app = create_app(models_dir=models)
    console.print(f"[green]Serving Helicyn ML policy on http://{host}:{port}[/green]")
    uvicorn.run(fastapi_app, host=host, port=port)


# --------------------------------------------------------------------------- sample data
@app.command("generate-sample-data")
def generate_sample_data(out: Path = typer.Option(SAMPLES_DIR, "--out")):
    """Generate tiny SYNTHETIC schema-compatible sample data for tests/demos.
    Every row is stamped source_dataset=synthetic_sample - never real data.
    """
    paths = sample_generator.generate_all_samples(out)
    console.print("[green]Generated synthetic sample data (source_dataset=synthetic_sample):[/green]")
    for kind, path in paths.items():
        console.print(f"  {kind}: {path}")


# --------------------------------------------------------------------------- demo
@app.command("demo")
def demo_cmd():
    """SMOKE-TEST / DEMO PIPELINE - NOT RESEARCH-QUALITY TRAINING.

    Runs the smallest possible end-to-end pipeline (download-or-sample,
    ingest, split, train, evaluate, one recommendation) to prove the plumbing
    works end-to-end. It is intentionally small and uses whatever mix of
    real/synthetic data is available in the current environment - it is NOT
    meant to produce research-usable models. After it finishes, run
    `python -m helicyn_ml status` to see exactly which trained models (if
    any) actually clear the research-usable bar on THIS run's data.
    """
    console.print(
        "[bold on yellow] SMOKE-TEST / DEMO PIPELINE - NOT RESEARCH-QUALITY TRAINING [/bold on yellow]"
    )
    console.print(
        "[dim]This proves the pipeline runs end-to-end; it does not by itself produce research-usable models. "
        "Run `python -m helicyn_ml status` afterward for an honest per-model readiness verdict.[/dim]"
    )

    console.print("\n[bold]Step 1/6: attempting small public dataset downloads...[/bold]")
    for dataset_id in ALL_SMALL_DATASET_IDS:
        card = get_card(dataset_id)
        _download_one(dataset_id, RAW_DIR / card.raw_subdir)

    console.print("\n[bold]Step 2/6: ingesting available datasets...[/bold]")
    ingest_all(Path("configs/datasets.yaml"))

    console.print("\n[bold]Step 3/6: creating train/val/test splits...[/bold]")
    run_split(
        PROCESSED_DIR / "workloads",
        PROCESSED_DIR / "grid",
        PROCESSED_DIR / "weather",
        PROCESSED_DIR / "power",
        SPLITS_DIR,
    )

    console.print("\n[bold]Step 4/6: training models (smoke-test scale)...[/bold]")
    train_all()

    console.print("\n[bold]Step 5/6: evaluating...[/bold]")
    evaluate_cmd(MODELS_DIR, SPLITS_DIR, EVAL_DIR)

    console.print("\n[bold]Step 6/6: producing one recommendation...[/bold]")
    example_state = EXAMPLES_DIR / "fleet_state_example.json"
    example_out = EXAMPLES_DIR / "recommendation_example.json"
    if example_state.exists():
        recommend_cmd(example_state, MODELS_DIR, example_out)

    console.print(
        "\n[bold on yellow] SMOKE-TEST / DEMO COMPLETE - NOT RESEARCH-QUALITY TRAINING [/bold on yellow]\n"
        "[bold yellow]This run used whatever mix of real/small-sample/synthetic data was available in this "
        "environment (real public downloads may have partially failed; missing pieces were topped up with "
        "clearly-labeled synthetic_sample data - see the SKIP/NOTE lines above). It proves the pipeline works "
        "end-to-end; it is NOT evidence that any model is ready for research use.[/bold yellow]\n"
        "[bold]Run `python -m helicyn_ml status` now[/bold] for an honest per-model readiness verdict on what "
        "this run actually produced. For research-quality training, run the full dataset commands in README.md."
    )


if __name__ == "__main__":
    app()

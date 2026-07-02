# Helicyn ML

A real machine-learning control prototype for data-center workload, energy,
carbon, price, and thermal-aware scheduling.

## What this is

- A **trainable ML pipeline**: public dataset ingestion → normalized schemas
  → time-ordered train/val/test splits → feature engineering → six
  scikit-learn models → evaluation reports → saved model artifacts → model
  cards → a policy interface a future simulator can call.
- **ML + optimization**, not LLM-first. The control brain (`HelicynPolicy`)
  is numerical, deterministic given its inputs, and inspectable: hard
  constraints are plain rule checks, and the ranking objective is a
  transparent weighted sum before it's ever learned. An LLM could be layered
  on top later purely to narrate a recommendation in English - it is not
  part of the decision path.
- Built to run **end-to-end without paid/private access**: every dataset
  loader gracefully falls back to a smaller sample, an analytical model, or
  a clearly-labeled synthetic sample if the full public dataset can't be
  auto-downloaded in your environment.

## What this is NOT

- Not the marketing website/demo in the repo root - this lives entirely
  under `helicyn-ml/` and does not modify any existing Helicyn website code.
- Not a hard-coded rules engine dressed up as AI. `HelicynPolicy` does use
  hard *safety* constraints (never place a job where it doesn't fit), but
  action ranking is model-driven wherever a trained model is available.
- Not validated against a real data center. See `docs/limitations.md` -
  this is a research prototype trained and evaluated on public traces only.

## Install

```bash
cd helicyn-ml
pip install -e ".[dev]"       # includes fastapi/uvicorn for `serve` + pytest
```

Requires Python 3.11+.

## Quickstart (full pipeline)

```bash
python -m helicyn_ml datasets list
python -m helicyn_ml datasets download --dataset all-small --out data/raw
python -m helicyn_ml ingest-all --config configs/datasets.yaml
python -m helicyn_ml split \
  --workloads data/processed/workloads --grid data/processed/grid \
  --weather data/processed/weather --power data/processed/power \
  --config configs/split.yaml --out data/splits
python -m helicyn_ml train all
python -m helicyn_ml evaluate --models artifacts/models --splits data/splits --out artifacts/eval
python -m helicyn_ml recommend --state examples/fleet_state_example.json \
  --models artifacts/models --out examples/recommendation_example.json
python -m helicyn_ml serve --models artifacts/models --host 127.0.0.1 --port 8765
```

Or the one-command smoke test:

```bash
python -m helicyn_ml demo
```

`demo` attempts real small-dataset downloads first, tops up with clearly
labeled synthetic samples if a download fails or a real dataset lacks a
needed field (e.g. BurstGPT has no job runtime, since it's an LLM request
trace), then ingests, splits, trains every model, evaluates, and produces
one recommendation. Its final line always states honestly whether real or
sample data was used.

## Individual commands

**Datasets**
```bash
python -m helicyn_ml datasets list
python -m helicyn_ml datasets describe alibaba-gpu-v2020
python -m helicyn_ml datasets download --dataset burstgpt --out data/raw/burstgpt
python -m helicyn_ml datasets download --dataset all-small --out data/raw
```
See `docs/datasets.md` and `docs/dataset_downloads.md` for what auto-downloads,
what needs credentials, and what's simply too large to fetch automatically.

**Ingest**
```bash
python -m helicyn_ml ingest --dataset burstgpt --input data/raw/burstgpt --out data/processed/workloads/burstgpt.parquet
python -m helicyn_ml ingest-all --config configs/datasets.yaml
```

**Split**
```bash
python -m helicyn_ml split --workloads data/processed/workloads --grid data/processed/grid \
  --weather data/processed/weather --power data/processed/power \
  --config configs/split.yaml --out data/splits
```

**Train**
```bash
python -m helicyn_ml train workload-forecaster --config configs/train_workload_forecaster.yaml
python -m helicyn_ml train runtime-predictor --config configs/train_runtime_predictor.yaml
python -m helicyn_ml train resource-predictor --config configs/train_resource_predictor.yaml
python -m helicyn_ml train sla-risk-model --config configs/train_sla_risk_model.yaml
python -m helicyn_ml train power-predictor --config configs/train_power_predictor.yaml
python -m helicyn_ml train policy-ranker --config configs/train_policy_ranker.yaml
python -m helicyn_ml train all
```

**Evaluate**
```bash
python -m helicyn_ml evaluate --models artifacts/models --splits data/splits --out artifacts/eval
```

**Recommend**
```bash
python -m helicyn_ml recommend --state examples/fleet_state_example.json \
  --models artifacts/models --out examples/recommendation_example.json
```

**Serve (optional HTTP)**
```bash
python -m helicyn_ml serve --models artifacts/models --host 127.0.0.1 --port 8765
# GET /health, GET /models, POST /recommend
```

**Sample data**
```bash
python -m helicyn_ml generate-sample-data --out data/samples
```
Every generated row is stamped `source_dataset=synthetic_sample` - never
mistakable for real data. See `docs/limitations.md`.

## Simulator integration

`helicyn_ml.schemas.FleetState` is the input contract and
`helicyn_ml.schemas.Recommendation` the output contract that a future
`helicyn-sim` project should use, either by importing
`helicyn_ml.serving.local_policy_service.LocalPolicyService` directly in the
same process, or by calling the `POST /recommend` HTTP endpoint. See
`docs/simulator_integration.md`.

## Project layout

```
helicyn_ml/        Python package: schemas, datasets, preprocessing, models,
                    policies, training, serving, CLI
configs/            YAML configs for datasets, splits, and each model's training run
data/               raw -> interim -> processed -> splits (gitignored, generated locally)
artifacts/          trained models, eval reports, model cards (gitignored, generated locally)
examples/           example FleetState input and Recommendation output
tests/              pytest suite
docs/               design docs (see below)
```

## Documentation

- `docs/datasets.md` - what each dataset is, what it teaches Helicyn, its columns and limitations
- `docs/dataset_downloads.md` - exact download commands, what needs credentials, what's huge
- `docs/normalized_schema.md` - normalized record schemas and units
- `docs/model_design.md` - each model's purpose, inputs, targets, and why there's no LLM in the control loop
- `docs/training_pipeline.md` - raw → interim → processed → splits → models → eval, and leakage prevention
- `docs/policy_design.md` - candidate actions, hard constraints, the teacher score, and the learned ranker
- `docs/evaluation.md` - how to read the metrics
- `docs/simulator_integration.md` - FleetState/Recommendation schemas and both call modes
- `docs/limitations.md` - what this prototype does not prove, read this first

## Scientific integrity

This project does not claim production-verified savings, live data-center
control, validated customer telemetry, or guaranteed energy/carbon/PUE
improvements. It claims: trained on public traces, evaluated on held-out
public traces, uses weak labels where real SLA labels are unavailable, uses
a heuristic teacher for the first policy ranker, and requires simulator
and/or real telemetry validation before any operational claim can be made.

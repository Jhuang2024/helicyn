from __future__ import annotations

import inspect
from pathlib import Path
from typing import Dict, List

import pandas as pd

from helicyn_ml.datasets import (
    alibaba_clusterdata,
    azure_cpu_small,
    azure_public_dataset,
    burstgpt,
    electricity_maps,
    google_clusterdata_2019,
    google_cpu_memory,
    gridstatus_loader,
    open_meteo_loader,
    scaleout_power,
    sustain_cluster,
)
from helicyn_ml.datasets.dataset_card import DatasetCard

# dataset_id -> module. Every module must expose: CARD, download(out_dir), ingest(input_dir)
_MODULES = {
    "alibaba-v2018": alibaba_clusterdata,
    "alibaba-gpu-v2020": alibaba_clusterdata,
    "azure-public": azure_public_dataset,
    "azure-llm-2024": azure_public_dataset,
    "azure-functions-2019": azure_public_dataset,
    "google-2019-local": google_clusterdata_2019,
    "google-cluster-cpu-memory-preprocessed": google_cpu_memory,
    "azure-cpu-usage-small": azure_cpu_small,
    "burstgpt": burstgpt,
    "electricity-maps-sample": electricity_maps,
    "electricity-maps": electricity_maps,
    "gridstatus": gridstatus_loader,
    "open-meteo-sample": open_meteo_loader,
    "open-meteo": open_meteo_loader,
    "scaleout-power": scaleout_power,
    "sustain-cluster": sustain_cluster,
}

# The "all-small" smoke-test bundle: cheapest datasets/samples for an
# end-to-end run without large downloads or credentials.
ALL_SMALL_DATASET_IDS = [
    "burstgpt",
    "alibaba-v2018",
    "electricity-maps-sample",
    "open-meteo-sample",
    "scaleout-power",
]


def get_module(dataset_id: str):
    if dataset_id not in _MODULES:
        raise KeyError(
            f"Unknown dataset_id '{dataset_id}'. Run `python -m helicyn_ml datasets list`."
        )
    return _MODULES[dataset_id]


def get_card(dataset_id: str) -> DatasetCard:
    module = get_module(dataset_id)
    card = module.CARD
    # Some modules (e.g. alibaba) serve more than one dataset_id with variant cards.
    if hasattr(module, "CARDS") and dataset_id in module.CARDS:
        card = module.CARDS[dataset_id]
    return card


def all_cards() -> Dict[str, DatasetCard]:
    out = {}
    for dataset_id, module in _MODULES.items():
        if hasattr(module, "CARDS") and dataset_id in module.CARDS:
            out[dataset_id] = module.CARDS[dataset_id]
        else:
            out[dataset_id] = module.CARD
    return out


def list_dataset_ids() -> List[str]:
    return sorted(_MODULES.keys())


def download_dataset(dataset_id: str, out_dir: Path):
    module = get_module(dataset_id)
    sig = inspect.signature(module.download)
    if "dataset_id" in sig.parameters:
        return module.download(out_dir, dataset_id=dataset_id)
    return module.download(out_dir)


def ingest_dataset(dataset_id: str, input_dir: Path) -> pd.DataFrame:
    module = get_module(dataset_id)
    sig = inspect.signature(module.ingest)
    if "dataset_id" in sig.parameters:
        return module.ingest(input_dir, dataset_id=dataset_id)
    return module.ingest(input_dir)

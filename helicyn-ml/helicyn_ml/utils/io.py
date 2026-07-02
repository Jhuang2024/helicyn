import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

import pandas as pd
import yaml


def ensure_dir(path: Path) -> Path:
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def remove_dir_if_exists(path: Path) -> None:
    """Deletes a directory tree if present. Used when a training run skips
    or degenerates so a stale model artifact from an earlier run (on
    possibly different data) doesn't linger and mislead `status`/`evaluate`
    into thinking a model is currently trained.
    """
    path = Path(path)
    if path.exists():
        shutil.rmtree(path)


def load_yaml(path: Path) -> dict:
    with open(path, "r") as f:
        return yaml.safe_load(f) or {}


def save_json(obj: Any, path: Path) -> None:
    path = Path(path)
    ensure_dir(path.parent)
    with open(path, "w") as f:
        json.dump(obj, f, indent=2, default=str)


def load_json(path: Path) -> Any:
    with open(path, "r") as f:
        return json.load(f)


def save_parquet(df: pd.DataFrame, path: Path) -> None:
    path = Path(path)
    ensure_dir(path.parent)
    df.to_parquet(path, index=False)


def load_parquet(path: Path) -> pd.DataFrame:
    return pd.read_parquet(path)


def file_hash(path: Path) -> str:
    """Short content hash used to record dataset provenance in metadata."""
    path = Path(path)
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:16]

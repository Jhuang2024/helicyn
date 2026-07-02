from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, List, Optional


@dataclass
class DatasetCard:
    """Describes one supported dataset: what it is, where it comes from,
    and how to get it. Used both for `datasets describe` and to drive the
    downloader/ingest CLI.
    """

    dataset_id: str
    display_name: str
    purpose: str
    source_url: str
    raw_subdir: str  # relative to data/raw/
    teaches: List[str]
    limitations: List[str]
    requires_credentials: bool = False
    credential_env_vars: List[str] = field(default_factory=list)
    is_huge: bool = False
    auto_download_supported: bool = False
    manual_instructions: str = ""
    ingest_target: str = ""  # relative to data/processed/
    source_repo: Optional[str] = None
    kind: str = "workload"  # workload | grid | weather | power | resource

    def raw_path(self, raw_root: Path) -> Path:
        return raw_root / self.raw_subdir

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests

from helicyn_ml.utils.io import ensure_dir
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)


@dataclass
class DownloadResult:
    dataset_id: str
    success: bool
    reason: str
    manual_instructions: str = ""
    out_path: Optional[str] = None
    bytes_downloaded: int = 0


def fetch_url(url: str, out_path: Path, timeout: int = 30) -> DownloadResult:
    """Best-effort single-file HTTP download. Never raises: network failure,
    404s, and timeouts are all reported back as a failed DownloadResult so
    the CLI can continue on to the next dataset instead of crashing.
    """
    out_path = Path(out_path)
    ensure_dir(out_path.parent)
    try:
        resp = requests.get(url, timeout=timeout, stream=True)
        resp.raise_for_status()
        total = 0
        with open(out_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1 << 16):
                f.write(chunk)
                total += len(chunk)
        return DownloadResult(
            dataset_id=out_path.stem,
            success=True,
            reason="downloaded",
            out_path=str(out_path),
            bytes_downloaded=total,
        )
    except Exception as exc:  # noqa: BLE001 - downloader must never crash the pipeline
        return DownloadResult(
            dataset_id=out_path.stem,
            success=False,
            reason=f"download failed: {exc}",
        )

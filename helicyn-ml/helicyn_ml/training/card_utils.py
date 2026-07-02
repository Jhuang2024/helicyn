from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from helicyn_ml.config import MODEL_CARDS_DIR
from helicyn_ml.schemas import ModelCard
from helicyn_ml.utils.io import ensure_dir


def remove_stale_card(model_name: str, model_cards_dir: Path = None) -> None:
    """Deletes a previously-written model card when the current run skips,
    degenerates, or otherwise fails to train this model. Without this, a
    model card from an earlier successful run stays on disk describing a
    model that no longer exists / no longer reflects the current data,
    which is exactly the kind of staleness this whole readiness-reporting
    effort exists to prevent.
    """
    cards_dir = Path(model_cards_dir) if model_cards_dir is not None else MODEL_CARDS_DIR
    for suffix in (".json", ".md"):
        path = cards_dir / f"{model_name}{suffix}"
        if path.exists():
            path.unlink()


def write_model_card(
    model_name: str,
    version: str,
    datasets_used: List[str],
    rows_used: int,
    features: List[str],
    targets: List[str],
    metrics: Dict[str, Any],
    label_provenance: str,
    known_limitations: List[str],
    intended_use: str,
    non_intended_use: str,
    train_range: str = None,
    val_range: str = None,
    test_range: str = None,
    extra_notes: str = None,
    model_cards_dir: Path = None,
) -> Path:
    """Writes <model_cards_dir>/<model_name>.{json,md}.

    model_cards_dir defaults to the project's real artifacts/reports/model_cards
    (config.MODEL_CARDS_DIR) ONLY when not given. Callers that pass a custom
    eval_dir (e.g. pytest smoke tests writing into tmp_path) must derive and
    pass their own model_cards_dir, otherwise a test run would silently
    overwrite the real project's model cards with throwaway smoke-test
    descriptions - see training/train_*.py for the derivation pattern
    (Path(eval_dir).parent / "reports" / "model_cards").
    """
    card = ModelCard(
        model_name=model_name,
        version=version,
        date_trained=datetime.now(timezone.utc),
        datasets_used=datasets_used,
        rows_used=rows_used,
        features=features,
        targets=targets,
        train_range=train_range,
        val_range=val_range,
        test_range=test_range,
        metrics=metrics,
        label_provenance=label_provenance,
        known_limitations=known_limitations,
        intended_use=intended_use,
        non_intended_use=non_intended_use,
        extra_notes=extra_notes,
    )
    cards_dir = Path(model_cards_dir) if model_cards_dir is not None else MODEL_CARDS_DIR
    ensure_dir(cards_dir)
    out_path = cards_dir / f"{model_name}.json"
    out_path.write_text(card.model_dump_json(indent=2))

    md_path = cards_dir / f"{model_name}.md"
    md_path.write_text(_render_markdown(card))
    return out_path


def _render_markdown(card: ModelCard) -> str:
    lines = [
        f"# Model Card: {card.model_name}",
        "",
        f"- **Version**: {card.version}",
        f"- **Date trained**: {card.date_trained.isoformat()}",
        f"- **Datasets used**: {', '.join(card.datasets_used) if card.datasets_used else 'none'}",
        f"- **Rows used**: {card.rows_used}",
        f"- **Label provenance**: {card.label_provenance}",
        f"- **Train range**: {card.train_range or 'n/a'}",
        f"- **Val range**: {card.val_range or 'n/a'}",
        f"- **Test range**: {card.test_range or 'n/a'}",
        "",
        "## Features",
        ", ".join(card.features) if card.features else "none",
        "",
        "## Targets",
        ", ".join(card.targets) if card.targets else "none",
        "",
        "## Metrics",
        "```json",
        _pretty(card.metrics),
        "```",
        "",
        "## Known limitations",
    ]
    lines += [f"- {l}" for l in card.known_limitations]
    lines += [
        "",
        f"## Intended use\n{card.intended_use}",
        "",
        f"## Non-intended use\n{card.non_intended_use}",
    ]
    if card.extra_notes:
        lines += ["", f"## Notes\n{card.extra_notes}"]
    return "\n".join(lines) + "\n"


def _pretty(d) -> str:
    import json

    return json.dumps(d, indent=2, default=str)

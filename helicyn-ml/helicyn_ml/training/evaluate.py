from __future__ import annotations

from pathlib import Path
from typing import Dict

from helicyn_ml.config import EVAL_DIR, MODELS_DIR, SPLITS_DIR
from helicyn_ml.utils.io import load_json, save_json
from helicyn_ml.utils.logging import get_logger

logger = get_logger(__name__)

MODEL_NAMES = [
    "workload_forecaster",
    "runtime_predictor",
    "resource_predictor",
    "sla_risk_model",
    "power_predictor",
    "policy_ranker",
]


def run(models_dir: Path = MODELS_DIR, splits_dir: Path = SPLITS_DIR, out_dir: Path = EVAL_DIR) -> Dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    split_summary = {}
    split_summary_path = Path(splits_dir) / "split_summary.json"
    if split_summary_path.exists():
        split_summary = load_json(split_summary_path)

    summary = {"split_summary": split_summary, "models": {}}
    for name in MODEL_NAMES:
        metrics_path = out_dir / name / "metrics.json"
        model_artifact_exists = (Path(models_dir) / name / "model.joblib").exists() or any(
            (Path(models_dir) / name).glob("*/model.joblib")
        )
        if metrics_path.exists():
            summary["models"][name] = {
                "status": "evaluated",
                "has_artifact": model_artifact_exists,
                "metrics": load_json(metrics_path),
            }
        else:
            summary["models"][name] = {"status": "not_trained", "has_artifact": model_artifact_exists}

    save_json(summary, out_dir / "evaluation_summary.json")
    (out_dir / "evaluation_summary.md").write_text(_render_markdown(summary))
    return summary


def _render_markdown(summary: Dict) -> str:
    lines = ["# Helicyn ML Evaluation Summary", ""]
    lines.append("## Data split")
    lines.append("```json")
    import json

    lines.append(json.dumps(summary.get("split_summary", {}), indent=2, default=str))
    lines.append("```")
    lines.append("")
    lines.append("## Models")
    for name, info in summary["models"].items():
        lines.append(f"### {name}")
        lines.append(f"- status: {info['status']}")
        if info["status"] == "evaluated":
            lines.append("```json")
            lines.append(json.dumps(info["metrics"], indent=2, default=str))
            lines.append("```")
        lines.append("")
    lines.append(
        "## Limitations\n"
        "These metrics are computed on held-out splits of public/sample traces only. "
        "No live data-center telemetry, real operator decisions, or production validation "
        "is represented here. See docs/limitations.md."
    )
    return "\n".join(lines) + "\n"

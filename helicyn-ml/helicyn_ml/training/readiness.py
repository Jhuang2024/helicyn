"""Computes an honest per-model readiness assessment from whatever is
actually on disk (eval metrics, degenerate/diagnostic reports, dataset
composition) - never from what a model "should" have done. Backs both
`python -m helicyn_ml status` and evaluate.py's summary.

Two kinds of caps are applied:
  1. Dynamic gates (docs: "task 8" readiness gates) - real labels, a
     non-degenerate target, test metrics beating baseline, enough rows, no
     constant-target collapse.
  2. Hard policy caps that no metric can override: SLARiskModel's weak
     labels and PolicyRanker's teacher-imitation labels are never
     "research_usable", no matter how good their held-out metrics look,
     until real/simulator-derived labels exist. This mirrors explicit
     product guidance, not just a metric threshold.
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

from helicyn_ml.config import EVAL_DIR, MODELS_DIR, SPLITS_DIR
from helicyn_ml.utils.io import load_json

MIN_ROWS_RESEARCH_USABLE = 200


def _load_json_or_none(path: Path) -> Optional[Dict]:
    path = Path(path)
    if not path.exists():
        return None
    try:
        return load_json(path)
    except Exception:  # noqa: BLE001
        return None


def _dataset_composition(splits_dir: Path, kind: str) -> Dict[str, int]:
    summary = _load_json_or_none(Path(splits_dir) / "dataset_summary.json") or {}
    return summary.get(kind, {})


def _dataset_used_str(composition: Dict[str, int]) -> str:
    if not composition:
        return "none"
    total = sum(composition.values()) or 1
    parts = [f"{name} ({count / total:.0%})" for name, count in sorted(composition.items(), key=lambda kv: -kv[1])]
    return ", ".join(parts)


def _is_real_dataset_dominant(composition: Dict[str, int]) -> bool:
    total = sum(composition.values())
    if total == 0:
        return False
    synthetic = composition.get("synthetic_sample", 0)
    return (total - synthetic) / total >= 0.5


def _has_artifact(models_dir: Path, model_name: str, multi_target: bool = False) -> bool:
    model_dir = Path(models_dir) / model_name
    if not model_dir.exists():
        return False
    if multi_target:
        return any(model_dir.glob("*/model.joblib"))
    return (model_dir / "model.joblib").exists()


def _target_usable(target_metrics: Optional[Dict]) -> str:
    """Classifies one regression target's test-split metrics."""
    if not target_metrics or not isinstance(target_metrics, dict):
        return "no_data"
    test = target_metrics.get("test") if "test" in target_metrics else target_metrics
    if not test:
        return "no_test_data"
    n = test.get("n", 0)
    r2 = test.get("r2")
    skill = test.get("skill_vs_baseline")
    if r2 is None and test.get("mae") == 0 and test.get("rmse") == 0:
        return "degenerate_constant"
    if n < MIN_ROWS_RESEARCH_USABLE:
        return "insufficient_rows"
    if skill is None or skill <= 0:
        return "below_baseline"
    return "usable"


def _fmt_metric(target: str, target_metrics: Optional[Dict]) -> Optional[str]:
    if not target_metrics or not isinstance(target_metrics, dict):
        return None
    test = target_metrics.get("test")
    if not test:
        return None
    r2 = test.get("r2")
    mae = test.get("mae")
    beats = test.get("beats_baseline")
    beats_str = "" if beats is None else (" beats_baseline" if beats else " below_baseline")
    r2_str = f"{r2:.3f}" if isinstance(r2, (int, float)) else "n/a"
    mae_str = f"{mae:.3g}" if isinstance(mae, (int, float)) else "n/a"
    return f"{target}: R2={r2_str} MAE={mae_str}{beats_str}"


def assess_workload_forecaster(models_dir: Path, eval_dir: Path, splits_dir: Path) -> Dict:
    composition = _dataset_composition(splits_dir, "workloads")
    metrics = _load_json_or_none(Path(eval_dir) / "workload_forecaster" / "metrics.json")
    has_artifact = _has_artifact(models_dir, "workload_forecaster", multi_target=True)

    if metrics is None:
        return _row("workload_forecaster", "not_run", composition, "real", "no", "not yet trained in this run")

    by_status: Dict[str, List[str]] = {}
    for target, target_metrics in metrics.items():
        verdict = _target_usable(target_metrics)
        by_status.setdefault(verdict, []).append(target)

    usable = by_status.get("usable", [])
    if usable and len(usable) == len(metrics):
        overall = "yes"
    elif usable:
        overall = "partial"
    else:
        overall = "no"

    reason_parts = []
    if usable:
        reason_parts.append(f"usable targets (beat baseline, test n>={MIN_ROWS_RESEARCH_USABLE}): {usable}")
    if by_status.get("degenerate_constant"):
        reason_parts.append(f"degenerate/zero-variance targets: {by_status['degenerate_constant']}")
    if by_status.get("below_baseline"):
        reason_parts.append(f"below-baseline targets: {by_status['below_baseline']}")
    if by_status.get("insufficient_rows"):
        reason_parts.append(f"insufficient test rows: {by_status['insufficient_rows']}")
    reason = "; ".join(reason_parts) if reason_parts else "no targets evaluated"

    summary_target = usable[0] if usable else next(iter(metrics.keys()), None)
    metric_summary = _fmt_metric(summary_target, metrics.get(summary_target)) if summary_target else None
    beats_baseline = "partial" if (usable and len(usable) != len(metrics)) else ("yes" if usable else "no")

    return _row(
        "workload_forecaster",
        "trained" if has_artifact else "skipped",
        composition,
        "real",
        overall,
        reason,
        metric_summary=metric_summary,
        beats_baseline=beats_baseline,
    )


def assess_runtime_predictor(models_dir: Path, eval_dir: Path, splits_dir: Path) -> Dict:
    composition = _dataset_composition(splits_dir, "workloads")
    metrics = _load_json_or_none(Path(eval_dir) / "runtime_predictor" / "metrics.json")
    has_artifact = _has_artifact(models_dir, "runtime_predictor")

    if metrics is None or not has_artifact:
        return _row(
            "runtime_predictor",
            "skipped",
            composition,
            "real",
            "no",
            "no dataset in the current split provides real duration_seconds or start/end timestamps "
            "(e.g. BurstGPT is a request trace with no job-runtime concept)",
        )

    verdict = _target_usable(metrics)
    usable = verdict == "usable"
    return _row(
        "runtime_predictor",
        "trained",
        composition,
        "real",
        "yes" if usable else "no",
        f"test verdict: {verdict}",
        metric_summary=_fmt_metric("duration_seconds", metrics),
        beats_baseline="yes" if usable else "no",
    )


# Targets that report real per-VM CPU/memory utilization (as opposed to the
# workload-derived usage targets, which currently have 0% coverage on any
# auto-downloadable dataset). research_usable="yes" for ResourcePredictor
# requires BOTH of these to beat baseline - this is the literal "CPU and
# memory targets both beat baseline" gate, not just "any target."
_PRIMARY_RESOURCE_TARGETS = ("cpu_usage_percent", "memory_usage_percent")


def assess_resource_predictor(models_dir: Path, eval_dir: Path, splits_dir: Path) -> Dict:
    composition = _dataset_composition(splits_dir, "workloads")
    resource_composition = _dataset_composition(splits_dir, "resources")
    combined_composition = dict(composition)
    for k, v in resource_composition.items():
        combined_composition[k] = combined_composition.get(k, 0) + v

    metrics = _load_json_or_none(Path(eval_dir) / "resource_predictor" / "metrics.json")
    has_artifact = _has_artifact(models_dir, "resource_predictor", multi_target=True)

    if metrics is None:
        return _row("resource_predictor", "not_run", combined_composition, "real", "no", "not yet trained in this run")

    non_target_keys = {"label_coverage", "label_row_counts"}
    targets = [k for k in metrics.keys() if k not in non_target_keys]
    by_status: Dict[str, List[str]] = {}
    for target in targets:
        verdict = _target_usable(metrics.get(target))
        by_status.setdefault(verdict, []).append(target)
    usable = by_status.get("usable", [])

    if not has_artifact:
        coverage = metrics.get("label_coverage", {})
        zero_cov = [t for t, c in coverage.items() if c == 0]
        return _row(
            "resource_predictor",
            "skipped",
            combined_composition,
            "real",
            "no",
            f"no target had sufficient label coverage (0% for: {zero_cov}) - current dataset(s) report requests "
            "but not actual utilization",
        )

    primary_verdicts = {t: _target_usable(metrics.get(t)) for t in _PRIMARY_RESOURCE_TARGETS if t in metrics}
    primary_all_usable = bool(primary_verdicts) and all(v == "usable" for v in primary_verdicts.values())

    if primary_all_usable:
        overall = "yes"
    elif usable:
        overall = "partial"
    else:
        overall = "no"

    cpu_mem_summary = ", ".join(
        f"{t}={v}" for t, v in primary_verdicts.items()
    ) or "cpu_usage_percent/memory_usage_percent not trained this run"
    reason = (
        f"CPU/memory trained from real/preprocessed Google Cluster traces; GPU unavailable. "
        f"Primary targets: {cpu_mem_summary}. All usable targets: {usable if usable else 'none'}."
    )

    metric_summary_parts = [
        _fmt_metric(t, metrics.get(t)) for t in _PRIMARY_RESOURCE_TARGETS if metrics.get(t)
    ]
    metric_summary = "; ".join(p for p in metric_summary_parts if p) or None
    beats_baseline = "yes" if primary_all_usable else ("partial" if usable else "no")

    return _row(
        "resource_predictor",
        "trained",
        combined_composition,
        "real",
        overall,
        reason,
        metric_summary=metric_summary,
        beats_baseline=beats_baseline,
    )


def assess_sla_risk_model(models_dir: Path, eval_dir: Path, splits_dir: Path) -> Dict:
    composition = _dataset_composition(splits_dir, "workloads")
    degenerate_report = _load_json_or_none(Path(eval_dir) / "sla_risk_model" / "degenerate_report.json")
    metrics = _load_json_or_none(Path(eval_dir) / "sla_risk_model" / "metrics.json")

    if degenerate_report is not None:
        pos_rate = degenerate_report.get("train_positive_rate")
        return _row(
            "sla_risk_model",
            "degenerate",
            composition,
            "weak",
            "no",
            f"weak-label positive rate {pos_rate:.4f} collapsed to (almost) one class - refused to train; "
            "see degenerate_report.json" if pos_rate is not None else "weak labels collapsed to one class",
            metric_summary="degenerate - not trained",
            beats_baseline="n/a",
        )

    if metrics is None:
        return _row("sla_risk_model", "not_run", composition, "weak", "no", "not yet trained in this run")

    # Hard policy cap: weak labels (synthetic deadline + toy queueing sim) are
    # never treated as research-usable regardless of how good the held-out
    # metrics on THOSE weak labels look - see docs/model_design.md.
    pos_rate = metrics.get("train_positive_rate")
    test_auc = metrics.get("test", {}).get("roc_auc") if metrics.get("test") else None
    return _row(
        "sla_risk_model",
        "trained",
        composition,
        "weak",
        "no",
        f"labels are WEAK (synthetic deadline + toy queueing simulation), not real SLA outcomes - never "
        f"research_usable regardless of metrics (train_positive_rate={pos_rate:.4f})"
        if pos_rate is not None
        else "labels are WEAK, not real SLA outcomes - never research_usable regardless of metrics",
        metric_summary=f"test_roc_auc={test_auc}" if test_auc is not None else None,
        beats_baseline="n/a",
    )


def assess_power_predictor(models_dir: Path, eval_dir: Path, splits_dir: Path) -> Dict:
    composition = _dataset_composition(splits_dir, "power")
    metrics = _load_json_or_none(Path(eval_dir) / "power_predictor" / "metrics.json")

    if metrics is None:
        return _row("power_predictor", "not_run", composition, "synthetic", "no", "not yet trained in this run")

    if metrics.get("status") == "analytical_fallback":
        return _row(
            "power_predictor",
            "fallback",
            composition,
            "synthetic",
            "no",
            "no real power dataset available - using a fixed analytical formula, not a trained model",
            metric_summary="analytical fallback - not a trained model",
            beats_baseline="n/a",
        )

    real_dominant = _is_real_dataset_dominant(composition)
    label_type = "real" if real_dominant else "synthetic"
    if not real_dominant:
        return _row(
            "power_predictor",
            "trained",
            composition,
            label_type,
            "no",
            "trained, but only on synthetic_sample data - not evidence about real hardware power draw",
            metric_summary=_fmt_metric("power_kw", metrics),
            beats_baseline="n/a",
        )
    verdict = _target_usable(metrics)
    return _row(
        "power_predictor",
        "trained",
        composition,
        label_type,
        "yes" if verdict == "usable" else "partial",
        f"trained on real power data; test verdict: {verdict}",
        metric_summary=_fmt_metric("power_kw", metrics),
        beats_baseline="yes" if verdict == "usable" else "no",
    )


def assess_policy_ranker(models_dir: Path, eval_dir: Path, splits_dir: Path) -> Dict:
    composition = _dataset_composition(splits_dir, "workloads")
    metrics = _load_json_or_none(Path(eval_dir) / "policy_ranker" / "metrics.json")
    diagnostics = _load_json_or_none(Path(eval_dir) / "policy_ranker" / "diagnostics.json")

    if metrics is None:
        return _row("policy_ranker", "not_run", composition, "teacher", "no", "not yet trained in this run")

    test_r2 = metrics.get("test", {}).get("r2") if metrics.get("test") else None
    diag_note = ""
    if diagnostics:
        n_const = len(diagnostics.get("constant_numeric_features_in_train", []))
        dup_pct = diagnostics.get("duplicate_row_percentage_train")
        diag_note = f"; diagnostics: {n_const} constant feature(s), {dup_pct:.0%} duplicate rows" if dup_pct is not None else ""

    # Hard policy cap: teacher-imitation labels are never research_usable
    # until evaluated through simulator rollouts, regardless of test R^2.
    return _row(
        "policy_ranker",
        "trained",
        composition,
        "teacher",
        "no",
        f"imitates a heuristic teacher, not real operator decisions or counterfactual outcomes - experimental "
        f"until simulator rollout evaluation exists (test R^2={test_r2}){diag_note}",
        metric_summary=f"test R2={test_r2:.3f} (teacher-fit quality, not decision quality)" if isinstance(test_r2, (int, float)) else None,
        beats_baseline="n/a",
    )


def _row(
    model: str,
    status: str,
    composition: Dict[str, int],
    label_type: str,
    usable: str,
    reason: str,
    metric_summary: Optional[str] = None,
    beats_baseline: str = "n/a",
) -> Dict:
    return {
        "model": model,
        "status": status,
        "dataset_used": _dataset_used_str(composition),
        "label_type": label_type,
        "metric_summary": metric_summary or "n/a",
        "beats_baseline": beats_baseline,
        "usable_for_research": usable,
        "reason": reason,
    }


def assess_all(models_dir: Path = MODELS_DIR, eval_dir: Path = EVAL_DIR, splits_dir: Path = SPLITS_DIR) -> List[Dict]:
    return [
        assess_workload_forecaster(models_dir, eval_dir, splits_dir),
        assess_runtime_predictor(models_dir, eval_dir, splits_dir),
        assess_resource_predictor(models_dir, eval_dir, splits_dir),
        assess_sla_risk_model(models_dir, eval_dir, splits_dir),
        assess_power_predictor(models_dir, eval_dir, splits_dir),
        assess_policy_ranker(models_dir, eval_dir, splits_dir),
    ]

from helicyn_ml.utils.io import save_json
from helicyn_ml.training.readiness import assess_resource_predictor


def _usable_target_metrics(n=300, r2=0.95, skill=0.5):
    return {"train_n": n, "source": "resource_timeseries", "test": {"n": n, "r2": r2, "mae": 1.0, "rmse": 1.5, "skill_vs_baseline": skill, "beats_baseline": True}}


def _below_baseline_target_metrics(n=300):
    return {
        "train_n": n,
        "source": "resource_timeseries",
        "test": {"n": n, "r2": 0.1, "mae": 5.0, "rmse": 6.0, "skill_vs_baseline": -0.2, "beats_baseline": False},
    }


def _write_model_stub(models_dir, target):
    target_dir = models_dir / "resource_predictor" / target
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / "model.joblib").write_bytes(b"")


def test_resource_predictor_research_usable_yes_when_both_primary_targets_beat_baseline(tmp_path):
    models_dir = tmp_path / "models"
    eval_dir = tmp_path / "eval"
    splits_dir = tmp_path / "splits"
    for t in ("cpu_usage_percent", "memory_usage_percent"):
        _write_model_stub(models_dir, t)
    metrics = {
        "label_row_counts": {"cpu_usage_percent": 300, "memory_usage_percent": 300},
        "cpu_usage_percent": _usable_target_metrics(),
        "memory_usage_percent": _usable_target_metrics(),
    }
    save_json(metrics, eval_dir / "resource_predictor" / "metrics.json")

    row = assess_resource_predictor(models_dir, eval_dir, splits_dir)
    assert row["usable_for_research"] == "yes"
    assert row["beats_baseline"] == "yes"
    assert "GPU unavailable" in row["reason"]


def test_resource_predictor_research_usable_partial_when_only_one_primary_target_beats_baseline(tmp_path):
    models_dir = tmp_path / "models"
    eval_dir = tmp_path / "eval"
    splits_dir = tmp_path / "splits"
    for t in ("cpu_usage_percent", "memory_usage_percent"):
        _write_model_stub(models_dir, t)
    metrics = {
        "label_row_counts": {"cpu_usage_percent": 300, "memory_usage_percent": 300},
        "cpu_usage_percent": _usable_target_metrics(),
        "memory_usage_percent": _below_baseline_target_metrics(),
    }
    save_json(metrics, eval_dir / "resource_predictor" / "metrics.json")

    row = assess_resource_predictor(models_dir, eval_dir, splits_dir)
    assert row["usable_for_research"] == "partial"
    assert row["beats_baseline"] == "partial"


def test_resource_predictor_research_usable_no_when_no_target_has_coverage(tmp_path):
    models_dir = tmp_path / "models"
    eval_dir = tmp_path / "eval"
    splits_dir = tmp_path / "splits"
    metrics = {
        "label_coverage": {"cpu_usage_percent": 0.0, "memory_usage_percent": 0.0},
        "label_row_counts": {"cpu_usage_percent": 0, "memory_usage_percent": 0},
    }
    save_json(metrics, eval_dir / "resource_predictor" / "metrics.json")

    row = assess_resource_predictor(models_dir, eval_dir, splits_dir)
    assert row["usable_for_research"] == "no"
    assert row["status"] == "skipped"


def test_resource_predictor_not_run_when_no_metrics_file(tmp_path):
    models_dir = tmp_path / "models"
    eval_dir = tmp_path / "eval"
    splits_dir = tmp_path / "splits"
    row = assess_resource_predictor(models_dir, eval_dir, splits_dir)
    assert row["status"] == "not_run"
    assert row["usable_for_research"] == "no"

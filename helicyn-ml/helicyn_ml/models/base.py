from __future__ import annotations

import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from helicyn_ml.utils.io import ensure_dir, load_json, save_json
from helicyn_ml.utils.seeds import DEFAULT_SEED


def build_preprocessor(numeric_cols: List[str], categorical_cols: List[str]) -> ColumnTransformer:
    numeric_pipeline = Pipeline(
        steps=[("impute", SimpleImputer(strategy="median"))]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("impute", SimpleImputer(strategy="constant", fill_value="unknown")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )
    return ColumnTransformer(
        transformers=[
            ("num", numeric_pipeline, numeric_cols),
            ("cat", categorical_pipeline, categorical_cols),
        ],
        remainder="drop",
        # Force dense output always: with low-cardinality categoricals
        # ColumnTransformer's sparsity heuristic already returns dense, but
        # a higher-cardinality categorical (e.g. resource_predictor's
        # vm_id_bucket, 64 levels) can push it to sparse, which this
        # sklearn version's HistGradientBoosting estimators reject outright.
        sparse_threshold=0,
    )


class TabularModel:
    """Thin, uniform wrapper around a scikit-learn Pipeline so every Helicyn
    model saves/loads/records metadata the same way. Not a novel ML
    abstraction - just consistency plumbing.
    """

    def __init__(
        self,
        estimator,
        numeric_cols: List[str],
        categorical_cols: List[str],
        target_col: str,
        model_type: str,
        task: str = "regression",  # regression | classification
    ):
        self.numeric_cols = numeric_cols
        self.categorical_cols = categorical_cols
        self.target_col = target_col
        self.model_type = model_type
        self.task = task
        self.pipeline = Pipeline(
            steps=[
                ("preprocess", build_preprocessor(numeric_cols, categorical_cols)),
                ("estimator", estimator),
            ]
        )
        self.is_fitted = False

    @property
    def feature_columns(self) -> List[str]:
        return self.numeric_cols + self.categorical_cols

    def _align_columns(self, X: pd.DataFrame) -> pd.DataFrame:
        """Guarantees every declared feature column is present, adding any
        genuinely-missing ones as null. The internal ColumnTransformer
        selects its numeric_cols/categorical_cols by name regardless of what
        the caller passed in, so silently dropping a missing column here
        (rather than adding it as null) would raise deep inside sklearn
        instead of being handled by the imputers like any other missing value.
        """
        X = X.copy()
        for col in self.feature_columns:
            if col not in X.columns:
                X[col] = None
        return X[self.feature_columns]

    def fit(self, X: pd.DataFrame, y: pd.Series) -> "TabularModel":
        self.pipeline.fit(self._align_columns(X), y)
        self.is_fitted = True
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return self.pipeline.predict(self._align_columns(X))

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        return self.pipeline.predict_proba(self._align_columns(X))[:, 1]

    def save(self, out_dir: Path, extra_metadata: Optional[Dict[str, Any]] = None, seed: int = DEFAULT_SEED) -> None:
        out_dir = ensure_dir(Path(out_dir))
        joblib.dump(self.pipeline, out_dir / "model.joblib")
        metadata = {
            "model_type": self.model_type,
            "task": self.task,
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "random_seed": seed,
            "feature_columns_numeric": self.numeric_cols,
            "feature_columns_categorical": self.categorical_cols,
            "target_column": self.target_col,
            "sklearn_version": sklearn.__version__,
            "python_version": sys.version.split()[0],
        }
        if extra_metadata:
            metadata.update(extra_metadata)
        save_json(metadata, out_dir / "metadata.json")

    @classmethod
    def load(cls, out_dir: Path) -> "TabularModel":
        out_dir = Path(out_dir)
        metadata = load_json(out_dir / "metadata.json")
        pipeline = joblib.load(out_dir / "model.joblib")
        obj = cls.__new__(cls)
        obj.numeric_cols = metadata["feature_columns_numeric"]
        obj.categorical_cols = metadata["feature_columns_categorical"]
        obj.target_col = metadata["target_column"]
        obj.model_type = metadata["model_type"]
        obj.task = metadata["task"]
        obj.pipeline = pipeline
        obj.is_fitted = True
        obj.metadata = metadata
        return obj

    def feature_importance(self) -> Optional[pd.DataFrame]:
        estimator = self.pipeline.named_steps["estimator"]
        if not hasattr(estimator, "feature_importances_"):
            return None
        try:
            names = self.pipeline.named_steps["preprocess"].get_feature_names_out()
        except Exception:  # noqa: BLE001
            names = [f"f{i}" for i in range(len(estimator.feature_importances_))]
        return pd.DataFrame({"feature": names, "importance": estimator.feature_importances_}).sort_values(
            "importance", ascending=False
        )


def git_commit_hash() -> Optional[str]:
    import subprocess

    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL).decode().strip()
    except Exception:  # noqa: BLE001
        return None

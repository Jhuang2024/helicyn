import numpy as np
import pandas as pd

from helicyn_ml.models.base import TabularModel
from sklearn.ensemble import HistGradientBoostingRegressor


def test_tabular_model_save_load_roundtrip(tmp_path):
    rng = np.random.default_rng(0)
    n = 200
    df = pd.DataFrame(
        {
            "num_a": rng.uniform(0, 10, n),
            "num_b": rng.uniform(0, 5, n),
            "cat_a": rng.choice(["x", "y", "z"], n),
        }
    )
    y = df["num_a"] * 2 + df["num_b"] + rng.normal(0, 0.1, n)

    model = TabularModel(
        estimator=HistGradientBoostingRegressor(random_state=0),
        numeric_cols=["num_a", "num_b"],
        categorical_cols=["cat_a"],
        target_col="y",
        model_type="HistGradientBoostingRegressor",
    )
    model.fit(df, y)
    preds_before = model.predict(df)

    out_dir = tmp_path / "artifact"
    model.save(out_dir, extra_metadata={"note": "test"})
    assert (out_dir / "model.joblib").exists()
    assert (out_dir / "metadata.json").exists()

    loaded = TabularModel.load(out_dir)
    preds_after = loaded.predict(df)

    np.testing.assert_allclose(preds_before, preds_after)
    assert loaded.metadata["note"] == "test"

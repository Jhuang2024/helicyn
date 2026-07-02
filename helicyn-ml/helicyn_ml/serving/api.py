"""Optional FastAPI HTTP service so a future simulator (or any external
process) can call HelicynPolicy over HTTP instead of importing it directly.
Requires the `serve` extra: pip install -e ".[serve]" (or "[dev]").
"""
from __future__ import annotations

from pathlib import Path

from helicyn_ml.config import MODELS_DIR
from helicyn_ml.policies.helicyn_policy import HelicynPolicy
from helicyn_ml.schemas import FleetState, Recommendation

try:
    from fastapi import FastAPI, HTTPException
except ImportError as exc:  # pragma: no cover
    raise ImportError("FastAPI is required for `helicyn-ml serve`. Install with: pip install -e '.[serve]'") from exc


def create_app(models_dir: Path = MODELS_DIR) -> FastAPI:
    app = FastAPI(title="Helicyn ML Policy Service", version="0.1.0")
    policy = HelicynPolicy(models_dir=models_dir)

    @app.get("/health")
    def health():
        return {"status": "ok", "missing_models": policy.missing_models}

    @app.get("/models")
    def models():
        return {
            "runtime_predictor": policy.runtime_predictor is not None,
            "sla_risk_model": policy.sla_risk_model is not None,
            "power_predictor": policy.power_predictor is not None,
            "policy_ranker": policy.policy_ranker is not None,
            "missing_models": policy.missing_models,
        }

    @app.post("/recommend", response_model=Recommendation)
    def recommend(fleet_state: FleetState):
        try:
            return policy.recommend(fleet_state)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=str(exc))

    return app

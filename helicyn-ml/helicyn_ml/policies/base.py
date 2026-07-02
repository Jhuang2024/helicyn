from __future__ import annotations

from abc import ABC, abstractmethod

from helicyn_ml.schemas import FleetState, Recommendation


class Policy(ABC):
    """Interface the future Helicyn simulator will call. Implementations
    must be deterministic given the same FleetState and model artifacts.
    """

    @abstractmethod
    def recommend(self, fleet_state: FleetState) -> Recommendation:
        raise NotImplementedError

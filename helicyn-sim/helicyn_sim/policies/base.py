from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

from helicyn_sim.simulation.state import SimState


@dataclass
class PolicyDecision:
    job_id: str
    action: str  # "place" | "queue" | "reject"
    target_site_id: Optional[str] = None
    target_rack_id: Optional[str] = None
    target_server_id: Optional[str] = None
    reason: str = ""


class Policy(ABC):
    name: str = "base"

    @abstractmethod
    def place_jobs(self, state: SimState) -> list[PolicyDecision]:
        """Attempt to place every job currently queued in `state.job_queue`
        (the engine has already added this step's new arrivals to it before
        calling this method), mutating `state` (server allocation,
        `job_queue`, `running_job_ids`, `rejected_job_ids`) as a side
        effect. Returns one PolicyDecision per job considered, for logging
        to policy_decisions.csv.
        """
        raise NotImplementedError

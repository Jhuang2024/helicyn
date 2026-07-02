"""Mutable simulation state container. `engine.py` owns the step loop;
everything it reads/writes lives here.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from helicyn_sim.config import Config
from helicyn_sim.models.rack import Rack
from helicyn_sim.models.server import Server
from helicyn_sim.models.site import Site
from helicyn_sim.schemas.workload import Job
from helicyn_sim.traces.synthetic import generate_fleet, generate_workload


@dataclass
class SimState:
    config: Config
    sites: dict[str, Site]
    racks: dict[str, Rack]
    servers: dict[str, Server]

    all_jobs: dict[str, Job]
    job_queue: list[str] = field(default_factory=list)  # job_ids, arrival order
    running_job_ids: set[str] = field(default_factory=set)
    completed_job_ids: set[str] = field(default_factory=set)
    rejected_job_ids: set[str] = field(default_factory=set)

    step: int = 0
    rng: np.random.Generator = field(default=None)  # type: ignore[assignment]

    def servers_in_rack(self, rack_id: str) -> list[Server]:
        return [self.servers[sid] for sid in self.racks[rack_id].server_ids]

    def racks_in_site(self, site_id: str) -> list[Rack]:
        return [self.racks[rid] for rid in self.sites[site_id].rack_ids]


def build_initial_state(config: Config, resource_trace_path: str | None = None) -> SimState:
    sites, racks, servers = generate_fleet(config)
    jobs = generate_workload(config, resource_trace_path=resource_trace_path)
    all_jobs = {job.job_id: job for job in jobs}
    return SimState(
        config=config,
        sites=sites,
        racks=racks,
        servers=servers,
        all_jobs=all_jobs,
        rng=np.random.default_rng(config.simulation.seed),
    )

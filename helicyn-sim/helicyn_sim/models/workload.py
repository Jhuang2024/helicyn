"""Small helpers shared by traces/synthetic.py for building Job objects.

Kept separate from helicyn_sim.schemas.workload (the data schema) so that
generation-time defaults (e.g. per-workload-type flexibility flags) live in
one obvious place instead of being scattered across the generator.
"""
from __future__ import annotations

from helicyn_sim.schemas.workload import WorkloadType

# Per-workload-type scheduling-flexibility defaults used by the synthetic
# generator. These are documented modeling assumptions, not measured facts.
WORKLOAD_DEFAULTS: dict[WorkloadType, dict] = {
    WorkloadType.LLM_INFERENCE: dict(
        latency_sensitive=True,
        preemptible=False,
        migratable=False,
        carbon_flexible=False,
        price_flexible=False,
    ),
    WorkloadType.ONLINE_SERVICE: dict(
        latency_sensitive=True,
        preemptible=False,
        migratable=True,
        carbon_flexible=False,
        price_flexible=False,
    ),
    WorkloadType.BATCH: dict(
        latency_sensitive=False,
        preemptible=True,
        migratable=True,
        carbon_flexible=True,
        price_flexible=True,
    ),
    WorkloadType.MAINTENANCE: dict(
        latency_sensitive=False,
        preemptible=True,
        migratable=True,
        carbon_flexible=True,
        price_flexible=True,
    ),
}

"""Server capacity/state model.

CPU/memory are the primary, fully modeled resources (Phase 1 scope, matching
helicyn-ml's real resource_predictor which only covers CPU/memory). GPU
fields exist as scaffolding only: `gpu_capacity_units` defaults to 0 and no
power/thermal/placement logic in Phase 1 treats GPU as load-bearing. Do not
interpret nonzero GPU fields here as GPU-trained behavior -- there is none.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from helicyn_sim.models.dvfs import DEFAULT_DVFS_STATE


@dataclass
class Server:
    server_id: str
    rack_id: str
    site_id: str

    cpu_capacity_units: float = 100.0
    memory_capacity_gb: float = 512.0
    gpu_capacity_units: float = 0.0  # scaffold only, unused for placement/power in Phase 1

    idle_power_w: float = 180.0
    max_cpu_dynamic_power_w: float = 470.0
    fan_overhead_w: float = 40.0
    sleep_power_w: float = 15.0

    dvfs_state: str = DEFAULT_DVFS_STATE
    asleep: bool = False

    cpu_allocated_units: float = 0.0
    memory_allocated_gb: float = 0.0
    gpu_allocated_units: float = 0.0

    running_job_ids: list[str] = field(default_factory=list)

    @property
    def cpu_free_units(self) -> float:
        return max(0.0, self.cpu_capacity_units - self.cpu_allocated_units)

    @property
    def memory_free_gb(self) -> float:
        return max(0.0, self.memory_capacity_gb - self.memory_allocated_gb)

    def cpu_utilization(self) -> float:
        if self.cpu_capacity_units <= 0:
            return 0.0
        return min(1.0, max(0.0, self.cpu_allocated_units / self.cpu_capacity_units))

    def memory_utilization(self) -> float:
        if self.memory_capacity_gb <= 0:
            return 0.0
        return min(1.0, max(0.0, self.memory_allocated_gb / self.memory_capacity_gb))

    def can_fit(self, cpu_demand_units: float, memory_demand_gb: float) -> bool:
        if self.asleep:
            return False
        return cpu_demand_units <= self.cpu_free_units and memory_demand_gb <= self.memory_free_gb

    def allocate(self, cpu_demand_units: float, memory_demand_gb: float, job_id: str) -> None:
        if not self.can_fit(cpu_demand_units, memory_demand_gb):
            raise ValueError(f"Server {self.server_id} cannot fit job {job_id}: insufficient capacity")
        self.cpu_allocated_units += cpu_demand_units
        self.memory_allocated_gb += memory_demand_gb
        self.running_job_ids.append(job_id)

    def release(self, cpu_demand_units: float, memory_demand_gb: float, job_id: str) -> None:
        self.cpu_allocated_units = max(0.0, self.cpu_allocated_units - cpu_demand_units)
        self.memory_allocated_gb = max(0.0, self.memory_allocated_gb - memory_demand_gb)
        if job_id in self.running_job_ids:
            self.running_job_ids.remove(job_id)

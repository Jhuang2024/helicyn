"""Server power model. See docs/equations.md for the formulas and
docs/model_assumptions.md for why these coefficients were chosen (they are
reasonable engineering assumptions, not measured from a real fleet).
"""
from __future__ import annotations

from helicyn_sim.models.dvfs import get_dvfs_state
from helicyn_sim.models.server import Server

MEMORY_POWER_COEFFICIENT_W = 60.0
CPU_UTILIZATION_EXPONENT = 1.4

FAN_WARM_THRESHOLD_C = 27.0
FAN_HOT_THRESHOLD_C = 35.0


def fan_factor(rack_temp_c: float) -> float:
    if rack_temp_c <= FAN_WARM_THRESHOLD_C:
        return 1.0
    if rack_temp_c <= FAN_HOT_THRESHOLD_C:
        return 1.0 + 0.05 * (rack_temp_c - FAN_WARM_THRESHOLD_C)
    return 1.4 + 0.10 * (rack_temp_c - FAN_HOT_THRESHOLD_C)


def server_power_w(server: Server, rack_temp_c: float) -> float:
    if server.asleep:
        return server.sleep_power_w

    cpu_utilization = server.cpu_utilization()
    memory_utilization = server.memory_utilization()

    dvfs = get_dvfs_state(server.dvfs_state)
    cpu_dynamic_power_w = (
        server.max_cpu_dynamic_power_w * (cpu_utilization**CPU_UTILIZATION_EXPONENT) * dvfs.power_multiplier
    )
    memory_dynamic_power_w = MEMORY_POWER_COEFFICIENT_W * memory_utilization

    fan = fan_factor(rack_temp_c)

    return server.idle_power_w + cpu_dynamic_power_w + memory_dynamic_power_w + server.fan_overhead_w * fan

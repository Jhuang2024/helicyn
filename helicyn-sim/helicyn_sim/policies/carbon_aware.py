"""CarbonAwarePolicy: latency-sensitive jobs are placed immediately and
normally (no delay, no site-shopping). For carbon_flexible jobs, delay
placement if a meaningfully lower-carbon window (>=10% better) is forecast
to arrive within the job's remaining deadline slack; otherwise place at
whichever site currently has the lowest realized carbon intensity and has
capacity. Never delays past the point where doing so would risk missing
the deadline (see `_util.signal_aware_place_jobs`'s `slack <= 1` forced
path). Uses the noise-free forecast curve, not the future realized (noisy)
value -- see docs/model_assumptions.md.
"""
from __future__ import annotations

from helicyn_sim.models.grid import forecast_carbon_intensity_gco2e_per_kwh
from helicyn_sim.policies._util import signal_aware_place_jobs
from helicyn_sim.policies.base import Policy, PolicyDecision
from helicyn_sim.simulation.state import SimState


class CarbonAwarePolicy(Policy):
    name = "carbon_aware"

    def place_jobs(self, state: SimState) -> list[PolicyDecision]:
        return signal_aware_place_jobs(
            state,
            flexible_attr="carbon_flexible",
            current_signal_key="carbon_intensity_gco2e_per_kwh",
            profile_attr="carbon_profile",
            forecast_fn=forecast_carbon_intensity_gco2e_per_kwh,
            delay_reason="awaiting_lower_carbon_window",
            place_reason="placed_at_lowest_current_carbon_site",
            forced_reason="deadline_forces_placement_ignoring_carbon",
        )

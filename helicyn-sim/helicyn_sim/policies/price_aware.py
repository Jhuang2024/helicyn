"""PriceAwarePolicy: same idea as CarbonAwarePolicy, but optimizes
electricity price instead of carbon intensity. Latency-sensitive jobs are
placed immediately; price_flexible jobs delay only if a meaningfully
cheaper window is forecast within their deadline slack, and are always
placed before the deadline regardless of price. See
`_util.signal_aware_place_jobs` and docs/model_assumptions.md.
"""
from __future__ import annotations

from helicyn_sim.models.grid import forecast_electricity_price_usd_per_mwh
from helicyn_sim.policies._util import signal_aware_place_jobs
from helicyn_sim.policies.base import Policy, PolicyDecision
from helicyn_sim.simulation.state import SimState


class PriceAwarePolicy(Policy):
    name = "price_aware"

    def place_jobs(self, state: SimState) -> list[PolicyDecision]:
        return signal_aware_place_jobs(
            state,
            flexible_attr="price_flexible",
            current_signal_key="electricity_price_usd_per_mwh",
            profile_attr="price_profile",
            forecast_fn=forecast_electricity_price_usd_per_mwh,
            delay_reason="awaiting_lower_price_window",
            place_reason="placed_at_lowest_current_price_site",
            forced_reason="deadline_forces_placement_ignoring_price",
        )

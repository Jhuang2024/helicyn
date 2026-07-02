from helicyn_sim.simulation.accounting import carbon_kgco2e, cost_usd, energy_kwh


def test_energy_formula():
    assert energy_kwh(power_kw=10.0, dt_hours=0.5) == 5.0


def test_carbon_formula():
    # 10 kWh at 200 gCO2e/kWh -> 2000 g -> 2.0 kg
    assert carbon_kgco2e(facility_energy_kwh=10.0, carbon_intensity_gco2e_per_kwh=200.0) == 2.0


def test_cost_formula():
    # 10 kWh = 0.01 MWh at $100/MWh -> $1.00
    assert cost_usd(facility_energy_kwh=10.0, electricity_price_usd_per_mwh=100.0) == 1.0


def test_carbon_and_cost_scale_linearly_with_energy():
    assert carbon_kgco2e(20.0, 200.0) == 2 * carbon_kgco2e(10.0, 200.0)
    assert cost_usd(20.0, 100.0) == 2 * cost_usd(10.0, 100.0)

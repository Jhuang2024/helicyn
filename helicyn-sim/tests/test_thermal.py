from helicyn_sim.models.thermal import next_rack_temp_c


def test_rack_temperature_rises_under_load():
    temp = 20.0
    next_temp = next_rack_temp_c(
        rack_temp_c=temp,
        rack_power_kw=50.0,
        ambient_temp_c=20.0,
        cooling_reference_temp_c=20.0,
        dt_minutes=5.0,
    )
    assert next_temp > temp


def test_cooling_reduces_temperature_when_hot_and_idle():
    # Rack starts hot with no IT load: cooling effort (proportional to how
    # far above reference temp) should pull it back down toward ambient.
    temp = 40.0
    next_temp = next_rack_temp_c(
        rack_temp_c=temp,
        rack_power_kw=0.0,
        ambient_temp_c=20.0,
        cooling_reference_temp_c=20.0,
        dt_minutes=5.0,
    )
    assert next_temp < temp


def test_higher_power_yields_higher_steady_state_temp():
    low_power_temp = 20.0
    high_power_temp = 20.0
    for _ in range(200):
        low_power_temp = next_rack_temp_c(low_power_temp, 5.0, 20.0, 20.0, 5.0)
        high_power_temp = next_rack_temp_c(high_power_temp, 50.0, 20.0, 20.0, 5.0)
    assert high_power_temp > low_power_temp

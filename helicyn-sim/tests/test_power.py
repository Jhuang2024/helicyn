from helicyn_sim.models.power import fan_factor, server_power_w
from helicyn_sim.models.server import Server


def make_server(**overrides) -> Server:
    defaults = dict(
        server_id="s1",
        rack_id="r1",
        site_id="site1",
        cpu_capacity_units=100.0,
        memory_capacity_gb=512.0,
        idle_power_w=180.0,
        max_cpu_dynamic_power_w=470.0,
        fan_overhead_w=40.0,
        sleep_power_w=15.0,
        dvfs_state="high_performance",
    )
    defaults.update(overrides)
    return Server(**defaults)


def test_power_increases_with_cpu_utilization():
    server = make_server()
    low = server_power_w(server, rack_temp_c=20.0)

    server.cpu_allocated_units = 50.0
    mid = server_power_w(server, rack_temp_c=20.0)

    server.cpu_allocated_units = 100.0
    high = server_power_w(server, rack_temp_c=20.0)

    assert low < mid < high


def test_sleeping_server_uses_sleep_power():
    server = make_server(asleep=True, cpu_allocated_units=80.0, memory_allocated_gb=400.0)
    assert server_power_w(server, rack_temp_c=20.0) == server.sleep_power_w


def test_dvfs_changes_dynamic_power_only_not_idle():
    server_hp = make_server(dvfs_state="high_performance", cpu_allocated_units=100.0)
    server_ps = make_server(dvfs_state="power_saver", cpu_allocated_units=100.0)

    power_hp = server_power_w(server_hp, rack_temp_c=20.0)
    power_ps = server_power_w(server_ps, rack_temp_c=20.0)

    assert power_ps < power_hp

    # idle-only (zero utilization) power should be identical across DVFS
    # states, since the power multiplier only applies to CPU dynamic power.
    idle_hp = make_server(dvfs_state="high_performance")
    idle_ps = make_server(dvfs_state="power_saver")
    assert server_power_w(idle_hp, rack_temp_c=20.0) == server_power_w(idle_ps, rack_temp_c=20.0)


def test_fan_factor_thresholds():
    assert fan_factor(20.0) == 1.0
    assert fan_factor(27.0) == 1.0
    assert fan_factor(30.0) > 1.0
    assert fan_factor(35.0) == 1.0 + 0.05 * 8
    assert fan_factor(40.0) > fan_factor(35.0)

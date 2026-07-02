from helicyn_sim.config import Config, FleetConfig, ServerProfileConfig, SimulationConfig, SiteConfig, WorkloadConfig
from helicyn_sim.policies import get_policy
from helicyn_sim.policies.carbon_aware import CarbonAwarePolicy
from helicyn_sim.policies.consolidation import ConsolidationPolicy
from helicyn_sim.policies.dvfs_aware import DVFSAwarePolicy
from helicyn_sim.policies.price_aware import PriceAwarePolicy
from helicyn_sim.policies.thermal_aware import ThermalAwarePolicy
from helicyn_sim.schemas.workload import Job, WorkloadType
from helicyn_sim.simulation.engine import run_simulation
from helicyn_sim.simulation.state import build_initial_state


def _demo_config(duration_hours=4) -> Config:
    return Config(
        simulation=SimulationConfig(timestep_minutes=5, duration_hours=duration_hours, seed=11),
        fleet=FleetConfig(
            sites=[
                SiteConfig(
                    site_id="ONT-NORTH", region="Ontario", racks=2, servers_per_rack=4,
                    carbon_profile="mixed_grid", price_profile="moderate_price", weather_profile="cool_weather",
                ),
                SiteConfig(
                    site_id="CA-WEST", region="California", racks=2, servers_per_rack=4,
                    carbon_profile="solar_duck_curve", price_profile="volatile_price", weather_profile="warm_weather",
                ),
            ]
        ),
        workload=WorkloadConfig(),
    )


def test_consolidation_uses_fewer_or_equal_active_server_hours_than_baseline():
    config = _demo_config()
    baseline_state, baseline_recorder, baseline_accs = run_simulation(config, get_policy("baseline_first_fit"))
    consolidation_state, consolidation_recorder, consolidation_accs = run_simulation(
        config, get_policy("consolidation")
    )

    baseline_summary = baseline_recorder.finalize(baseline_state, baseline_accs)
    consolidation_summary = consolidation_recorder.finalize(consolidation_state, consolidation_accs)

    assert consolidation_summary["active_server_hours"] <= baseline_summary["active_server_hours"]


def _two_rack_state():
    config = Config(
        simulation=SimulationConfig(timestep_minutes=5, duration_hours=1, seed=1),
        fleet=FleetConfig(
            sites=[SiteConfig(site_id="SITE-A", region="test", racks=2, servers_per_rack=2)],
            server_profile=ServerProfileConfig(cpu_capacity_units=50.0, memory_capacity_gb=128.0),
        ),
        workload=WorkloadConfig(),
    )
    state = build_initial_state(config)
    state.all_jobs = {}
    state.job_queue = []
    return state


def test_thermal_aware_avoids_hotter_rack_when_cooler_rack_has_capacity():
    state = _two_rack_state()
    rack_ids = list(state.racks.keys())
    hot_rack_id, cool_rack_id = rack_ids[0], rack_ids[1]
    state.racks[hot_rack_id].rack_temp_c = 35.0
    state.racks[cool_rack_id].rack_temp_c = 19.0

    job = Job(
        job_id="job-1",
        arrival_time=0,
        workload_type=WorkloadType.BATCH,
        cpu_demand_units=5.0,
        memory_demand_gb=5.0,
        total_work_units=10.0,
        remaining_work_units=10.0,
    )
    state.all_jobs["job-1"] = job
    state.job_queue = ["job-1"]

    policy = ThermalAwarePolicy()
    decisions = policy.place_jobs(state)

    assert decisions[0].action == "place"
    assert job.rack_id == cool_rack_id


def _carbon_price_state(profile_kwargs=None):
    config = Config(
        simulation=SimulationConfig(timestep_minutes=5, duration_hours=1, seed=1),
        fleet=FleetConfig(
            sites=[
                SiteConfig(
                    site_id="SITE-A", region="test", racks=1, servers_per_rack=2,
                    carbon_profile="mixed_grid", price_profile="moderate_price",
                )
            ],
            server_profile=ServerProfileConfig(cpu_capacity_units=50.0, memory_capacity_gb=128.0),
        ),
        workload=WorkloadConfig(),
    )
    state = build_initial_state(config)
    state.all_jobs = {}
    state.job_queue = []
    state.step = 0
    state.current_site_signals = {
        "SITE-A": {
            "carbon_intensity_gco2e_per_kwh": 200.0,
            "electricity_price_usd_per_mwh": 100.0,
            "ambient_temp_c": 20.0,
        }
    }
    return state


def test_carbon_aware_delays_flexible_job_only_when_deadline_allows():
    state = _carbon_price_state()
    # Plenty of slack (100 steps) and short work (10 min = 2 steps): safe to delay.
    flexible_job = Job(
        job_id="flex-1",
        arrival_time=0,
        workload_type=WorkloadType.BATCH,
        cpu_demand_units=5.0,
        memory_demand_gb=5.0,
        total_work_units=10.0,
        remaining_work_units=10.0,
        deadline_time=100,
        max_delay_minutes=120,
        carbon_flexible=True,
        latency_sensitive=False,
    )
    state.all_jobs["flex-1"] = flexible_job
    state.job_queue = ["flex-1"]

    decisions = CarbonAwarePolicy().place_jobs(state)
    assert decisions[0].action == "delay"
    assert flexible_job.job_id in state.job_queue

    # Tight deadline (only exactly enough steps to run): must place now, not delay.
    state2 = _carbon_price_state()
    urgent_flex_job = Job(
        job_id="flex-2",
        arrival_time=0,
        workload_type=WorkloadType.BATCH,
        cpu_demand_units=5.0,
        memory_demand_gb=5.0,
        total_work_units=10.0,
        remaining_work_units=10.0,
        deadline_time=2,  # exactly work_steps_needed away
        max_delay_minutes=120,
        carbon_flexible=True,
        latency_sensitive=False,
    )
    state2.all_jobs["flex-2"] = urgent_flex_job
    state2.job_queue = ["flex-2"]

    decisions2 = CarbonAwarePolicy().place_jobs(state2)
    assert decisions2[0].action == "place"
    assert urgent_flex_job.server_id is not None


def test_price_aware_delays_flexible_job_only_when_deadline_allows():
    state = _carbon_price_state()
    flexible_job = Job(
        job_id="flex-1",
        arrival_time=0,
        workload_type=WorkloadType.BATCH,
        cpu_demand_units=5.0,
        memory_demand_gb=5.0,
        total_work_units=10.0,
        remaining_work_units=10.0,
        deadline_time=100,
        max_delay_minutes=120,
        price_flexible=True,
        latency_sensitive=False,
    )
    state.all_jobs["flex-1"] = flexible_job
    state.job_queue = ["flex-1"]

    decisions = PriceAwarePolicy().place_jobs(state)
    assert decisions[0].action == "delay"

    state2 = _carbon_price_state()
    urgent_job = Job(
        job_id="flex-2",
        arrival_time=0,
        workload_type=WorkloadType.BATCH,
        cpu_demand_units=5.0,
        memory_demand_gb=5.0,
        total_work_units=10.0,
        remaining_work_units=10.0,
        deadline_time=2,
        max_delay_minutes=120,
        price_flexible=True,
        latency_sensitive=False,
    )
    state2.all_jobs["flex-2"] = urgent_job
    state2.job_queue = ["flex-2"]

    decisions2 = PriceAwarePolicy().place_jobs(state2)
    assert decisions2[0].action == "place"


def test_dvfs_aware_never_uses_power_saver_for_urgent_latency_sensitive_jobs():
    state = _two_rack_state()
    urgent_job = Job(
        job_id="urgent-1",
        arrival_time=0,
        workload_type=WorkloadType.LLM_INFERENCE,
        cpu_demand_units=5.0,
        memory_demand_gb=5.0,
        total_work_units=5.0,
        remaining_work_units=5.0,
        latency_sensitive=True,
    )
    state.all_jobs["urgent-1"] = urgent_job
    state.job_queue = ["urgent-1"]

    DVFSAwarePolicy().place_jobs(state)

    server = state.servers[urgent_job.server_id]
    assert server.dvfs_state == "high_performance"
    assert server.dvfs_state != "power_saver"

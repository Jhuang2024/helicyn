from helicyn_sim.config import Config, FleetConfig, ServerProfileConfig, SimulationConfig, SiteConfig, WorkloadConfig
from helicyn_sim.policies.integrated_coordination import IntegratedCoordinationPolicy
from helicyn_sim.schemas.workload import Job, WorkloadType
from helicyn_sim.simulation.engine import run_simulation
from helicyn_sim.simulation.state import build_initial_state


def _demo_config(duration_hours=2) -> Config:
    return Config(
        simulation=SimulationConfig(timestep_minutes=5, duration_hours=duration_hours, seed=21),
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


def test_integrated_coordination_produces_valid_decisions_over_a_run():
    config = _demo_config()
    state, recorder, accs = run_simulation(config, IntegratedCoordinationPolicy())
    summary = recorder.finalize(state, accs)

    assert summary["total_jobs"] > 0
    assert summary["completed_jobs"] > 0
    decision_actions = {"place", "queue", "reject", "delay", "sleep_server", "wake_server", "change_dvfs"}
    for row in recorder.decision_rows:
        assert row["action"] in decision_actions
        assert row["reason"]


def test_integrated_coordination_never_exceeds_capacity():
    config = _demo_config()
    state, _recorder, _accs = run_simulation(config, IntegratedCoordinationPolicy())
    for server in state.servers.values():
        assert server.cpu_allocated_units <= server.cpu_capacity_units + 1e-9
        assert server.memory_allocated_gb <= server.memory_capacity_gb + 1e-9


def _one_site_state(cpu_capacity=50.0, memory_capacity=128.0):
    config = Config(
        simulation=SimulationConfig(timestep_minutes=5, duration_hours=1, seed=1),
        fleet=FleetConfig(
            sites=[
                SiteConfig(
                    site_id="SITE-A", region="test", racks=2, servers_per_rack=2,
                    carbon_profile="mixed_grid", price_profile="moderate_price",
                )
            ],
            server_profile=ServerProfileConfig(cpu_capacity_units=cpu_capacity, memory_capacity_gb=memory_capacity),
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


def test_integrated_coordination_does_not_delay_latency_sensitive_jobs():
    state = _one_site_state()
    job = Job(
        job_id="urgent-1",
        arrival_time=0,
        workload_type=WorkloadType.LLM_INFERENCE,
        cpu_demand_units=5.0,
        memory_demand_gb=5.0,
        total_work_units=5.0,
        remaining_work_units=5.0,
        latency_sensitive=True,
        deadline_time=50,
    )
    state.all_jobs["urgent-1"] = job
    state.job_queue = ["urgent-1"]

    decisions = IntegratedCoordinationPolicy().place_jobs(state)

    place_decisions = [d for d in decisions if d.job_id == "urgent-1"]
    assert any(d.action == "place" for d in place_decisions)
    assert not any(d.action == "delay" for d in place_decisions)
    assert job.server_id is not None


def test_integrated_coordination_avoids_critical_hot_rack_when_alternative_exists():
    state = _one_site_state()
    rack_ids = list(state.racks.keys())
    hot_rack_id, cool_rack_id = rack_ids[0], rack_ids[1]
    state.racks[hot_rack_id].rack_temp_c = 39.0  # above critical threshold
    state.racks[cool_rack_id].rack_temp_c = 19.0

    job = Job(
        job_id="job-1",
        arrival_time=0,
        workload_type=WorkloadType.BATCH,
        cpu_demand_units=5.0,
        memory_demand_gb=5.0,
        total_work_units=10.0,
        remaining_work_units=10.0,
        deadline_time=5,  # tight enough to force placement, not delay
    )
    state.all_jobs["job-1"] = job
    state.job_queue = ["job-1"]

    decisions = IntegratedCoordinationPolicy().place_jobs(state)

    assert any(d.action == "place" and d.job_id == "job-1" for d in decisions)
    assert job.rack_id == cool_rack_id


def test_integrated_coordination_delays_flexible_job_when_carbon_price_window_improves():
    state = _one_site_state()
    job = Job(
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
        price_flexible=True,
        latency_sensitive=False,
    )
    state.all_jobs["flex-1"] = job
    state.job_queue = ["flex-1"]

    decisions = IntegratedCoordinationPolicy().place_jobs(state)

    assert any(d.action == "delay" and d.job_id == "flex-1" for d in decisions)
    assert job.job_id in state.job_queue


def test_integrated_coordination_produces_score_breakdown_in_place_reasons():
    state = _one_site_state()
    job = Job(
        job_id="job-1",
        arrival_time=0,
        workload_type=WorkloadType.BATCH,
        cpu_demand_units=5.0,
        memory_demand_gb=5.0,
        total_work_units=10.0,
        remaining_work_units=10.0,
        deadline_time=5,
    )
    state.all_jobs["job-1"] = job
    state.job_queue = ["job-1"]

    decisions = IntegratedCoordinationPolicy().place_jobs(state)
    place = next(d for d in decisions if d.action == "place" and d.job_id == "job-1")

    assert "score=" in place.reason
    assert "carbon=" in place.reason
    assert "thermal=" in place.reason

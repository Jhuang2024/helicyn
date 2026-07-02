import pytest

from helicyn_sim.config import Config, FleetConfig, ServerProfileConfig, SimulationConfig, SiteConfig, WorkloadConfig
from helicyn_sim.models.server import Server
from helicyn_sim.policies.baseline_first_fit import BaselineFirstFitPolicy
from helicyn_sim.simulation.engine import run_simulation


def test_can_fit_boundary():
    server = Server(server_id="s1", rack_id="r1", site_id="site1", cpu_capacity_units=100.0, memory_capacity_gb=512.0)
    assert server.can_fit(100.0, 512.0) is True
    assert server.can_fit(100.01, 512.0) is False
    assert server.can_fit(100.0, 512.01) is False


def test_allocate_raises_when_exceeding_capacity():
    server = Server(server_id="s1", rack_id="r1", site_id="site1", cpu_capacity_units=100.0, memory_capacity_gb=512.0)
    server.allocate(90.0, 400.0, "job-a")
    with pytest.raises(ValueError):
        server.allocate(20.0, 10.0, "job-b")


def test_asleep_server_cannot_fit_anything():
    server = Server(server_id="s1", rack_id="r1", site_id="site1", asleep=True)
    assert server.can_fit(1.0, 1.0) is False


def _tiny_config() -> Config:
    return Config(
        simulation=SimulationConfig(timestep_minutes=5, duration_hours=2, seed=7),
        fleet=FleetConfig(
            sites=[
                SiteConfig(
                    site_id="SITE-A",
                    region="test",
                    racks=1,
                    servers_per_rack=2,
                    base_pue=1.3,
                    cooling_reference_temp_c=20.0,
                )
            ],
            server_profile=ServerProfileConfig(cpu_capacity_units=20.0, memory_capacity_gb=64.0),
        ),
        workload=WorkloadConfig(
            llm_inference_jobs_per_hour_peak=40,
            llm_inference_jobs_per_hour_offpeak=40,
            batch_jobs_per_hour_day=20,
            batch_jobs_per_hour_night=20,
            online_service_jobs_per_hour=20,
            maintenance_jobs_per_day=5,
        ),
    )


def test_no_placement_exceeds_capacity_over_full_run():
    config = _tiny_config()
    policy = BaselineFirstFitPolicy()
    # A heavily oversubscribed tiny fleet forces contention; if the policy
    # ever placed a job the server couldn't fit, Server.allocate would raise.
    state, recorder, _ = run_simulation(config, policy)

    for server in state.servers.values():
        assert server.cpu_allocated_units <= server.cpu_capacity_units + 1e-9
        assert server.memory_allocated_gb <= server.memory_capacity_gb + 1e-9

    # A 2-server, 20 CPU-unit fleet under this workload should be
    # oversubscribed enough that something ends up queued or rejected.
    assert len(state.rejected_job_ids) > 0 or len(state.job_queue) > 0

from helicyn_sim.config import Config, FleetConfig, ServerProfileConfig, SimulationConfig, SiteConfig, WorkloadConfig
from helicyn_sim.policies.baseline_first_fit import BaselineFirstFitPolicy
from helicyn_sim.schemas.workload import Job, WorkloadType
from helicyn_sim.simulation.state import build_initial_state


def _config(racks=1, servers_per_rack=1, cpu_capacity=20.0, memory_capacity=64.0) -> Config:
    return Config(
        simulation=SimulationConfig(timestep_minutes=5, duration_hours=1, seed=1),
        fleet=FleetConfig(
            sites=[SiteConfig(site_id="SITE-A", region="test", racks=racks, servers_per_rack=servers_per_rack)],
            server_profile=ServerProfileConfig(cpu_capacity_units=cpu_capacity, memory_capacity_gb=memory_capacity),
        ),
        workload=WorkloadConfig(),
    )


def _add_job(state, job_id, cpu=10.0, mem=10.0, arrival=0, deadline=100):
    job = Job(
        job_id=job_id,
        arrival_time=arrival,
        workload_type=WorkloadType.BATCH,
        cpu_demand_units=cpu,
        memory_demand_gb=mem,
        total_work_units=50.0,
        remaining_work_units=50.0,
        deadline_time=deadline,
    )
    state.all_jobs[job_id] = job
    state.job_queue.append(job_id)
    return job


def test_baseline_places_jobs_when_capacity_exists():
    config = _config(racks=1, servers_per_rack=1, cpu_capacity=20.0, memory_capacity=64.0)
    state = build_initial_state(config)
    state.all_jobs = {}
    state.job_queue = []
    job = _add_job(state, "job-1", cpu=10.0, mem=10.0)

    policy = BaselineFirstFitPolicy()
    decisions = policy.place_jobs(state)

    assert len(decisions) == 1
    assert decisions[0].action == "place"
    assert job.server_id is not None
    assert job.job_id in state.running_job_ids
    assert state.job_queue == []


def test_queued_jobs_remain_queued_when_no_capacity():
    config = _config(racks=1, servers_per_rack=1, cpu_capacity=10.0, memory_capacity=10.0)
    state = build_initial_state(config)
    state.all_jobs = {}
    state.job_queue = []
    # First job fills the only server.
    _add_job(state, "job-1", cpu=10.0, mem=10.0)
    # Second job cannot fit anywhere, and its deadline hasn't passed yet.
    job2 = _add_job(state, "job-2", cpu=10.0, mem=10.0, deadline=100)

    policy = BaselineFirstFitPolicy()
    decisions = policy.place_jobs(state)

    by_job = {d.job_id: d for d in decisions}
    assert by_job["job-1"].action == "place"
    assert by_job["job-2"].action == "queue"
    assert job2.job_id in state.job_queue
    assert job2.rejected is False


def test_queued_job_rejected_after_deadline_passes():
    config = _config(racks=1, servers_per_rack=1, cpu_capacity=10.0, memory_capacity=10.0)
    state = build_initial_state(config)
    state.all_jobs = {}
    state.job_queue = []
    _add_job(state, "job-1", cpu=10.0, mem=10.0)
    job2 = _add_job(state, "job-2", cpu=10.0, mem=10.0, deadline=0)
    state.step = 5  # past job-2's deadline

    policy = BaselineFirstFitPolicy()
    decisions = policy.place_jobs(state)

    by_job = {d.job_id: d for d in decisions}
    assert by_job["job-2"].action == "reject"
    assert job2.rejected is True
    assert job2.deadline_missed is True
    assert job2.job_id in state.rejected_job_ids

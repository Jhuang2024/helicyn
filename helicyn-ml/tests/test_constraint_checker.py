from datetime import datetime, timezone

from helicyn_ml.policies.constraint_checker import check_constraints
from helicyn_ml.schemas import (
    ActionType,
    CandidateAction,
    FleetState,
    QueuedJob,
    Rack,
    Server,
    Site,
)

NOW = datetime.now(timezone.utc)


def _fleet_with_one_small_server(running_job_ids=None) -> FleetState:
    site = Site(site_id="s1", region="us-west", rack_ids=["r1"])
    rack = Rack(rack_id="r1", site_id="s1", server_ids=["srv1"])
    server = Server(
        server_id="srv1",
        rack_id="r1",
        cpu_capacity=4,
        cpu_used=3,
        memory_capacity_gb=16,
        memory_used_gb=14,
        gpu_capacity=1,
        gpu_used=0,
        running_job_ids=running_job_ids or [],
    )
    return FleetState(timestamp=NOW, sites=[site], racks=[rack], servers=[server])


def test_rejects_placement_exceeding_cpu_capacity():
    fleet = _fleet_with_one_small_server()
    job = QueuedJob(job_id="j1", arrival_time=NOW, cpu_request=10.0)
    action = CandidateAction(action_type=ActionType.PLACE, job_id="j1", target_site_id="s1")
    valid, reason = check_constraints(action, job, fleet)
    assert not valid
    assert "CPU" in reason


def test_rejects_placement_exceeding_memory_capacity():
    fleet = _fleet_with_one_small_server()
    job = QueuedJob(job_id="j1", arrival_time=NOW, cpu_request=0.5, memory_request_gb=100.0)
    action = CandidateAction(action_type=ActionType.PLACE, job_id="j1", target_site_id="s1")
    valid, reason = check_constraints(action, job, fleet)
    assert not valid
    assert "memory" in reason


def test_rejects_sleeping_server_with_running_jobs():
    fleet = _fleet_with_one_small_server(running_job_ids=["job_x"])
    action = CandidateAction(action_type=ActionType.SLEEP_SERVER, target_server_id="srv1")
    valid, reason = check_constraints(action, None, fleet)
    assert not valid
    assert "running jobs" in reason


def test_allows_sleeping_server_with_no_running_jobs():
    fleet = _fleet_with_one_small_server(running_job_ids=[])
    action = CandidateAction(action_type=ActionType.SLEEP_SERVER, target_server_id="srv1")
    valid, reason = check_constraints(action, None, fleet)
    assert valid


def test_rejects_delay_of_non_delayable_latency_sensitive_job():
    fleet = _fleet_with_one_small_server()
    job = QueuedJob(job_id="j1", arrival_time=NOW, latency_sensitive=True, delayable=False)
    action = CandidateAction(action_type=ActionType.DELAY, job_id="j1", delay_minutes=15)
    valid, reason = check_constraints(action, job, fleet)
    assert not valid
    assert "delay" in reason.lower()


def test_allows_delay_of_delayable_job():
    fleet = _fleet_with_one_small_server()
    job = QueuedJob(job_id="j1", arrival_time=NOW, latency_sensitive=False, delayable=True)
    action = CandidateAction(action_type=ActionType.DELAY, job_id="j1", delay_minutes=15)
    valid, _ = check_constraints(action, job, fleet)
    assert valid

from unittest.mock import MagicMock, patch

import requests

from helicyn_sim.config import Config, FleetConfig, ServerProfileConfig, SimulationConfig, SiteConfig, WorkloadConfig
from helicyn_sim.policies.external_helicyn import ExternalHelicynPolicy, ExternalHelicynUnavailableError
from helicyn_sim.schemas.action import ActionType, CandidateAction
from helicyn_sim.schemas.recommendation import Recommendation
from helicyn_sim.schemas.workload import Job, WorkloadType
from helicyn_sim.simulation.state import build_initial_state


def _one_server_state():
    config = Config(
        simulation=SimulationConfig(timestep_minutes=5, duration_hours=1, seed=1),
        fleet=FleetConfig(
            sites=[SiteConfig(site_id="SITE-A", region="test", racks=1, servers_per_rack=1)],
            server_profile=ServerProfileConfig(cpu_capacity_units=10.0, memory_capacity_gb=10.0),
        ),
        workload=WorkloadConfig(),
    )
    state = build_initial_state(config)
    state.all_jobs = {}
    state.job_queue = []
    state.current_site_signals = {
        "SITE-A": {"carbon_intensity_gco2e_per_kwh": 100.0, "electricity_price_usd_per_mwh": 50.0, "ambient_temp_c": 20.0}
    }
    return state


def _queue_job(state, job_id="job-1", cpu=5.0, mem=5.0):
    job = Job(
        job_id=job_id,
        arrival_time=0,
        workload_type=WorkloadType.BATCH,
        cpu_demand_units=cpu,
        memory_demand_gb=mem,
        total_work_units=10.0,
        remaining_work_units=10.0,
        deadline_time=50,
    )
    state.all_jobs[job_id] = job
    state.job_queue.append(job_id)
    return job


def _mock_response(payload: dict) -> MagicMock:
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = payload
    return response


def test_check_available_raises_when_server_unreachable():
    policy = ExternalHelicynPolicy(url="http://127.0.0.1:8765/recommend")
    with patch("helicyn_sim.policies.external_helicyn.requests.get", side_effect=requests.ConnectionError("refused")):
        try:
            policy.check_available()
            assert False, "expected ExternalHelicynUnavailableError"
        except ExternalHelicynUnavailableError:
            pass


def test_place_jobs_raises_when_post_fails():
    state = _one_server_state()
    _queue_job(state)
    policy = ExternalHelicynPolicy(url="http://127.0.0.1:8765/recommend")

    with patch("helicyn_sim.policies.external_helicyn.requests.post", side_effect=requests.Timeout("timed out")):
        try:
            policy.place_jobs(state)
            assert False, "expected ExternalHelicynUnavailableError"
        except ExternalHelicynUnavailableError:
            pass


def test_adapter_rejects_impossible_placement_and_falls_back():
    state = _one_server_state()
    job = _queue_job(state, cpu=5.0, mem=5.0)
    server_id = next(iter(state.servers))

    recommendation = Recommendation(
        timestamp="2024-01-01T00:00:00+00:00",
        selected_actions=[
            CandidateAction(
                action_type=ActionType.PLACE,
                job_id=job.job_id,
                target_server_id=server_id,
                target_rack_id=state.servers[server_id].rack_id,
                target_site_id=state.servers[server_id].site_id,
                metadata={},
            )
        ],
        ranked_actions=[],
        score=0.0,
        explanation="test",
        confidence=0.5,
        model_version="test",
    )
    payload = recommendation.model_dump(mode="json")
    # Corrupt the recommended placement so it exceeds the server's capacity.
    job.cpu_demand_units = 999.0

    policy = ExternalHelicynPolicy(url="http://127.0.0.1:8765/recommend")
    with patch("helicyn_sim.policies.external_helicyn.requests.post", return_value=_mock_response(payload)):
        decisions = policy.place_jobs(state)

    rejected = [d for d in decisions if d.action == "rejected_external_action"]
    assert len(rejected) == 1
    assert rejected[0].reason == "exceeds_cpu_or_memory_capacity"
    # Falls back: job.cpu_demand_units (999) also can't fit anywhere, so it
    # should be queued (not silently dropped) via the safe fallback path.
    fallback = [d for d in decisions if "safe fallback" in d.reason]
    assert len(fallback) == 1
    assert job.job_id in state.job_queue


def test_adapter_accepts_valid_placement():
    state = _one_server_state()
    job = _queue_job(state, cpu=5.0, mem=5.0)
    server_id = next(iter(state.servers))
    server = state.servers[server_id]

    recommendation = Recommendation(
        timestamp="2024-01-01T00:00:00+00:00",
        selected_actions=[
            CandidateAction(
                action_type=ActionType.PLACE,
                job_id=job.job_id,
                target_server_id=server_id,
                target_rack_id=server.rack_id,
                target_site_id=server.site_id,
                metadata={},
            )
        ],
        ranked_actions=[],
        score=0.0,
        explanation="test",
        confidence=0.9,
        model_version="test",
    )
    payload = recommendation.model_dump(mode="json")

    policy = ExternalHelicynPolicy(url="http://127.0.0.1:8765/recommend")
    with patch("helicyn_sim.policies.external_helicyn.requests.post", return_value=_mock_response(payload)):
        decisions = policy.place_jobs(state)

    assert any(d.action == "place" and d.job_id == job.job_id for d in decisions)
    assert job.server_id == server_id
    assert job.job_id in state.running_job_ids
    assert not any(d.action == "rejected_external_action" for d in decisions)


def test_adapter_falls_back_when_job_has_no_recommendation():
    state = _one_server_state()
    job = _queue_job(state, cpu=5.0, mem=5.0)

    recommendation = Recommendation(
        timestamp="2024-01-01T00:00:00+00:00",
        selected_actions=[],
        ranked_actions=[],
        score=0.0,
        explanation="no actions",
        confidence=0.1,
        model_version="test",
        is_fallback=True,
    )
    payload = recommendation.model_dump(mode="json")

    policy = ExternalHelicynPolicy(url="http://127.0.0.1:8765/recommend")
    with patch("helicyn_sim.policies.external_helicyn.requests.post", return_value=_mock_response(payload)):
        decisions = policy.place_jobs(state)

    assert any(d.action == "place" and "safe fallback" in d.reason for d in decisions)
    assert job.server_id is not None

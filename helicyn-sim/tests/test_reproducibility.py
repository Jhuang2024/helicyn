from helicyn_sim.config import load_config
from helicyn_sim.policies import get_policy
from helicyn_sim.simulation.engine import run_simulation


def _run_summary(seed: int):
    config = load_config("configs/demo.yaml")
    config.simulation.duration_hours = 2
    config.simulation.seed = seed
    policy = get_policy("baseline_first_fit")
    state, recorder, accs = run_simulation(config, policy)
    return recorder.finalize(state, accs)


def test_same_seed_gives_same_run_summary():
    summary_a = _run_summary(seed=123)
    summary_b = _run_summary(seed=123)

    excluded = set()  # every field should be deterministic given the same seed
    for key in summary_a:
        if key in excluded:
            continue
        assert summary_a[key] == summary_b[key], f"mismatch on {key}: {summary_a[key]} != {summary_b[key]}"


def test_different_seed_gives_different_workload():
    summary_a = _run_summary(seed=1)
    summary_b = _run_summary(seed=2)

    assert summary_a["total_jobs"] != summary_b["total_jobs"] or (
        summary_a["total_carbon_kgco2e"] != summary_b["total_carbon_kgco2e"]
    )

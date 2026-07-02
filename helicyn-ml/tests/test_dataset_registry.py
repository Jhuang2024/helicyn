from helicyn_ml.datasets.registry import all_cards, list_dataset_ids

EXPECTED_IDS = {
    "alibaba-v2018",
    "alibaba-gpu-v2020",
    "azure-public",
    "azure-llm-2024",
    "google-2019-local",
    "burstgpt",
    "electricity-maps-sample",
    "electricity-maps",
    "gridstatus",
    "open-meteo-sample",
    "open-meteo",
    "scaleout-power",
    "sustain-cluster",
}


def test_all_expected_datasets_registered():
    ids = set(list_dataset_ids())
    assert EXPECTED_IDS.issubset(ids)


def test_dataset_cards_have_required_fields():
    for dataset_id, card in all_cards().items():
        assert card.dataset_id
        assert card.source_url.startswith("http")
        assert card.purpose
        assert isinstance(card.limitations, list) and len(card.limitations) > 0
        assert card.kind in {"workload", "grid", "weather", "power"}

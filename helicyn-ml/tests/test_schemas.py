from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from helicyn_ml.schemas import (
    NormalizedGridRecord,
    NormalizedPowerRecord,
    NormalizedResourceTimeseriesRecord,
    NormalizedWeatherRecord,
    NormalizedWorkloadRecord,
)

NOW = datetime.now(timezone.utc)


def test_valid_workload_record():
    record = NormalizedWorkloadRecord(
        source_dataset="synthetic_sample",
        record_id="r1",
        job_id="job1",
        timestamp=NOW,
        arrival_time=NOW,
        workload_type="llm_inference",
        cpu_request=2.0,
        gpu_request=1.0,
        input_tokens=100,
        output_tokens=50,
    )
    assert record.workload_type == "llm_inference"


def test_invalid_workload_record_negative_cpu():
    with pytest.raises(ValidationError):
        NormalizedWorkloadRecord(
            source_dataset="x",
            record_id="r1",
            job_id="job1",
            timestamp=NOW,
            arrival_time=NOW,
            cpu_request=-5.0,
        )


def test_invalid_workload_record_missing_required():
    with pytest.raises(ValidationError):
        NormalizedWorkloadRecord(source_dataset="x")


def test_valid_grid_record():
    record = NormalizedGridRecord(
        source_dataset="electricity-maps-sample",
        timestamp=NOW,
        region="us-west",
        carbon_intensity_gco2e_per_kwh=300.0,
    )
    assert record.region == "us-west"


def test_invalid_grid_record_renewable_out_of_range():
    with pytest.raises(ValidationError):
        NormalizedGridRecord(
            source_dataset="x",
            timestamp=NOW,
            region="us-west",
            renewable_percentage=150.0,
        )


def test_valid_weather_record():
    record = NormalizedWeatherRecord(source_dataset="open-meteo-sample", timestamp=NOW, region="us-west", ambient_temp_c=21.5)
    assert record.ambient_temp_c == 21.5


def test_valid_power_record():
    record = NormalizedPowerRecord(source_dataset="scaleout-power", timestamp=NOW, power_kw=1.2)
    assert record.power_kw == 1.2


def test_invalid_power_record_negative_power():
    with pytest.raises(ValidationError):
        NormalizedPowerRecord(source_dataset="x", timestamp=NOW, power_kw=-1.0)


def test_valid_resource_record_relative_time():
    record = NormalizedResourceTimeseriesRecord(
        source_dataset="google_cluster_cpu_memory_preprocessed",
        vm_id="vm_1",
        timestamp=None,
        time_index=0,
        timestamp_is_relative=True,
        interval_minutes=5.0,
        cpu_usage_percent=42.0,
        memory_usage_percent=17.5,
    )
    assert record.timestamp_is_relative is True
    assert record.timestamp is None


def test_valid_resource_record_real_time():
    record = NormalizedResourceTimeseriesRecord(
        source_dataset="azure_cpu_usage_small",
        vm_id="azure_aggregate",
        timestamp=NOW,
        time_index=0,
        timestamp_is_relative=False,
        interval_minutes=5.0,
        avg_cpu_usage_percent=1_200_000.0,
    )
    assert record.timestamp_is_relative is False
    # Azure's raw values are not bounded 0-100 (see azure_cpu_small.py docstring)
    # - the schema must not fabricate a percentage bound that would reject them.
    assert record.avg_cpu_usage_percent == 1_200_000.0


def test_resource_record_missing_required_fields():
    with pytest.raises(ValidationError):
        NormalizedResourceTimeseriesRecord(source_dataset="x")


def test_resource_record_has_no_gpu_field():
    """The schema must not carry any GPU field at all - see the module
    docstring on why a nulled/defaulted gpu field would be worse than none.
    """
    assert "gpu" not in NormalizedResourceTimeseriesRecord.model_fields
    fields = NormalizedResourceTimeseriesRecord.model_fields.keys()
    assert not any("gpu" in f.lower() for f in fields)


def test_resource_record_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        NormalizedResourceTimeseriesRecord(
            source_dataset="x",
            vm_id="vm_1",
            timestamp_is_relative=True,
            gpu_usage_percent=50.0,
        )

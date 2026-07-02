from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from helicyn_ml.schemas import (
    NormalizedGridRecord,
    NormalizedPowerRecord,
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

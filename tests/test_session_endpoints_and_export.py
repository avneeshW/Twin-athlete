import time
import pytest
from app import app, telemetry_writer
from twin.storage import vault


def test_session_lifecycle_endpoints():
    """Verify POST /api/session/start, POST /api/session/end, and GET /api/sessions."""
    client = app.test_client()

    sid = f"SES-TEST-MANUAL-{int(time.time())}"
    # 1. Start manual session
    res_start = client.post("/api/session/start", json={
        "device_id": "ESP32-ATHLETE-01",
        "athlete_id": "ATH-0824",
        "session_id": sid,
        "notes": "Tempo run workout"
    })
    assert res_start.status_code == 200
    start_data = res_start.get_json()
    assert start_data["success"] is True
    assert start_data["session_id"] == sid

    # 2. Ingest sample under this session
    client.post("/api/esp32/telemetry", json={
        "device_id": "ESP32-ATHLETE-01",
        "heart_rate": 155.0,
        "spo2": 98.0,
        "ax": 0.2, "ay": 1.1, "az": 0.0,
        "packet": 10
    })

    # 3. End session with RPE and notes
    res_end = client.post("/api/session/end", json={
        "session_id": sid,
        "device_id": "ESP32-ATHLETE-01",
        "rpe_post": 7.5,
        "notes": "Felt good, solid pace throughout"
    })
    assert res_end.status_code == 200
    assert res_end.get_json()["success"] is True

    # 4. List sessions
    res_list = client.get("/api/sessions")
    assert res_list.status_code == 200
    data = res_list.get_json()
    assert data["success"] is True
    sids = [s.get("session_id") or s.get("id") for s in data["sessions"]]
    assert sid in sids


def test_session_csv_export_streaming_and_mock_exclusion():
    """Verify GET /api/sessions/<id>/export.csv streams rows in chunks and excludes mock data unless requested."""
    client = app.test_client()

    sid = f"SES-CSV-{int(time.time())}"
    vault.save_session({
        "session_id": sid,
        "athlete_id": "ATH-0824",
        "device_id": "ESP32-CSV-DEV",
        "start_time": time.time(),
        "activity": "Intervals"
    })

    # Insert 2 real samples and 2 mock samples
    base_id = vault.get_max_sample_id()
    now_ts = time.time()
    samples = [
        # Real sample 1
        {"id": base_id + 1, "session_id": sid, "device_id": "ESP32-CSV-DEV", "seq": 1, "device_ms": 1000,
         "server_ts": now_ts + 1, "hr": 150.0, "spo2": 98.0, "ax": 0.1, "ay": 1.0, "az": 0.0, "gx": 0.0, "gy": 0.0, "gz": 0.0, "cadence": 160, "flags": "normal", "is_mock": 0},
        # Real sample 2
        {"id": base_id + 2, "session_id": sid, "device_id": "ESP32-CSV-DEV", "seq": 2, "device_ms": 2000,
         "server_ts": now_ts + 2, "hr": 152.0, "spo2": 98.0, "ax": 0.1, "ay": 1.0, "az": 0.0, "gx": 0.0, "gy": 0.0, "gz": 0.0, "cadence": 162, "flags": "normal", "is_mock": 0},
        # Mock sample 1
        {"id": base_id + 3, "session_id": sid, "device_id": "mock", "seq": 3, "device_ms": 3000,
         "server_ts": now_ts + 3, "hr": 154.0, "spo2": 98.0, "ax": 0.0, "ay": 1.0, "az": 0.0, "gx": 0.0, "gy": 0.0, "gz": 0.0, "cadence": 165, "flags": "mock", "is_mock": 1},
        # Mock sample 2
        {"id": base_id + 4, "session_id": sid, "device_id": "mock", "seq": 4, "device_ms": 4000,
         "server_ts": now_ts + 4, "hr": 156.0, "spo2": 98.0, "ax": 0.0, "ay": 1.0, "az": 0.0, "gx": 0.0, "gy": 0.0, "gz": 0.0, "cadence": 165, "flags": "mock", "is_mock": 1},
    ]
    vault.insert_samples_batch(samples)

    # 1. Export without include_mock -> must only have 2 real samples (+ 1 header line)
    resp_real = client.get(f"/api/sessions/{sid}/export.csv")
    assert resp_real.status_code == 200
    assert "text/csv" in resp_real.content_type
    content_real = resp_real.data.decode("utf-8").strip().split("\n")
    assert len(content_real) == 3  # Header + 2 data rows
    assert "id,session_id,device_id" in content_real[0]
    assert "device_ms" in content_real[0]

    # Verify no mock samples in real export
    for line in content_real[1:]:
        assert ",mock," not in line
        assert line.endswith(",0")

    # 2. Export with ?include_mock=1 -> must include all 4 samples (+ 1 header line)
    resp_mock = client.get(f"/api/sessions/{sid}/export.csv?include_mock=1")
    assert resp_mock.status_code == 200
    content_mock = resp_mock.data.decode("utf-8").strip().split("\n")
    assert len(content_mock) == 5  # Header + 4 data rows

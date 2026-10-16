import os
import time
import pytest
from app import app, _check_and_flush_audit_rejects_unlocked, _rate_limit_rejects, _contract_rejects
from twin.storage import vault


def test_auth_missing_and_invalid_api_key(monkeypatch):
    """Verify missing or invalid X-API-Key returns 401 when TWIN_API_KEYS is configured."""
    monkeypatch.setenv("TWIN_API_KEYS", "DEV-TEST-01:secretkey1,DEV-TEST-02:secretkey2")
    client = app.test_client()

    # Missing API Key
    res_missing = client.post("/api/esp32/telemetry", json={
        "device_id": "DEV-TEST-01",
        "heart_rate": 140.0,
        "spo2": 98.0,
        "ax": 0.0, "ay": 1.0, "az": 0.0
    })
    assert res_missing.status_code == 401
    assert "Missing X-API-Key" in res_missing.get_json()["error"]

    # Invalid API Key
    res_invalid = client.post(
        "/api/esp32/telemetry",
        json={"device_id": "DEV-TEST-01", "heart_rate": 140.0, "spo2": 98.0, "ax": 0.0, "ay": 1.0, "az": 0.0},
        headers={"X-API-Key": "wrong-secret"}
    )
    assert res_invalid.status_code == 401
    assert "Invalid API key" in res_invalid.get_json()["error"]

    # Valid API Key
    res_valid = client.post(
        "/api/esp32/telemetry",
        json={"device_id": "DEV-TEST-01", "heart_rate": 140.0, "spo2": 98.0, "ax": 0.0, "ay": 1.0, "az": 0.0},
        headers={"X-API-Key": "secretkey1"}
    )
    assert res_valid.status_code == 200

    # Test Session Reset Endpoint Auth
    res_reset_bad = client.post("/api/session/reset")
    assert res_reset_bad.status_code == 401

    res_reset_good = client.post("/api/session/reset", headers={"X-API-Key": "secretkey1"})
    assert res_reset_good.status_code == 200


def test_device_keyed_rate_limiting_independence(monkeypatch):
    """
    Verify rate limiting is keyed by device identity so Device A reaching limit
    does not throttle Device B.
    """
    monkeypatch.setenv("TWIN_API_KEYS", "DEV-A:keyA,DEV-B:keyB")
    client = app.test_client()

    # Saturate Device A (35 packets in <1s)
    dev_a_payload = {"device_id": "DEV-A", "heart_rate": 140.0, "spo2": 98.0, "ax": 0.0, "ay": 1.0, "az": 0.0}
    for i in range(35):
        resp = client.post("/api/esp32/telemetry", json=dev_a_payload, headers={"X-API-Key": "keyA"})
        assert resp.status_code == 200

    # 36th packet for Device A should be rate limited (429)
    resp_a_limited = client.post("/api/esp32/telemetry", json=dev_a_payload, headers={"X-API-Key": "keyA"})
    assert resp_a_limited.status_code == 429

    # Device B posting immediately after must NOT be rate limited
    dev_b_payload = {"device_id": "DEV-B", "heart_rate": 145.0, "spo2": 98.0, "ax": 0.0, "ay": 1.0, "az": 0.0}
    resp_b = client.post("/api/esp32/telemetry", json=dev_b_payload, headers={"X-API-Key": "keyB"})
    assert resp_b.status_code == 200


def test_reject_counters_flushed_to_audit_events():
    """Verify reject counters accumulate in memory and flush to audit_events periodically."""
    # Force audit flush with dummy counts
    _rate_limit_rejects["DEV-AUDIT-TEST"] = 5
    _contract_rejects["DEV-AUDIT-TEST"] = 3

    _check_and_flush_audit_rejects_unlocked(force=True)

    # In-memory counters should be cleared
    assert _rate_limit_rejects.get("DEV-AUDIT-TEST", 0) == 0
    assert _contract_rejects.get("DEV-AUDIT-TEST", 0) == 0

    # Audit events table should contain the flushed records
    events = vault.get_audit_events(limit=10)
    evt_types = [e["event_type"] for e in events]
    assert "RATE_LIMIT_EXCEEDED" in evt_types or "CONTRACT_VALIDATION_REJECT" in evt_types

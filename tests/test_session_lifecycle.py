import time
import pytest
from app import app, registry, telemetry_writer
from twin.session_manager import SessionManager


def test_zero_db_calls_on_ingest(monkeypatch):
    """Verify ingest endpoint executes entirely in memory without touching the database."""
    client = app.test_client()

    # Monkeypatch storage vault connection creation to fail if called
    from twin.storage import vault
    def fail_on_db(*args, **kwargs):
        raise RuntimeError("Database connection should NOT be called on ingest path!")

    monkeypatch.setattr(vault, "_get_connection", fail_on_db)

    payload = {
        "device_id": "ESP32-ZERO-DB-TEST",
        "heart_rate": 145.0,
        "spo2": 98.0,
        "ax": 0.1,
        "ay": 1.0,
        "az": 0.2
    }

    resp = client.post("/api/esp32/telemetry", json=payload)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "success"
    assert "session_id" in data


def test_device_mapping_cache():
    """Verify registry fast device mapping cache and invalidation on mapping update."""
    dev = "ESP32-CACHE-CHECK"
    # Initially fallback to active athlete
    initial_aid = registry.get_athlete_for_device(dev)
    assert initial_aid == registry.active_athlete_id

    # Update mapping using map_device
    target_aid = "ATH-0102"
    registry.map_device(dev, target_aid)

    # In-memory lookup should return target_aid immediately
    assert registry._device_mappings_cache.get(dev) == target_aid
    assert registry.get_athlete_for_device(dev) == target_aid


def test_auto_session_lifecycle_and_idle_close():
    """Verify session auto-creation on first packet and auto-closing after idle timeout."""
    mgr = SessionManager(storage_vault=None, writer=None, idle_timeout=0.6)
    dev = "ESP32-LIFECYCLE-DEV"

    # Packet 1: creates session
    t0 = 1000.0
    s1 = mgr.get_or_create_session(dev, athlete_id="ATH-0824", now=t0)
    assert s1.startswith("SES-ESP32-LIFECYCLE-DEV-")

    # Packet 2 shortly after: reuses same session
    s2 = mgr.get_or_create_session(dev, athlete_id="ATH-0824", now=t0 + 0.3)
    assert s2 == s1

    # Packet 3 after idle timeout elapsed: closes previous and creates new
    s3 = mgr.get_or_create_session(dev, athlete_id="ATH-0824", now=t0 + 1.2)
    assert s3 != s1
    assert s3.startswith("SES-ESP32-LIFECYCLE-DEV-")

    mgr.shutdown()


def test_api_session_reset_closes_active_sessions():
    """Verify /api/session/reset triggers closure of active sessions."""
    client = app.test_client()

    # Ingest a packet with default device id to ensure active session exists
    client.post("/api/esp32/telemetry", json={
        "device_id": "ESP32-ATHLETE-01",
        "heart_rate": 150.0,
        "spo2": 99.0,
        "ax": 0.0, "ay": 1.0, "az": 0.0
    })

    # Call reset
    resp = client.post("/api/session/reset")
    assert resp.status_code == 200
    assert resp.get_json()["success"] is True

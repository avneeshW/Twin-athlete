import time
import pytest
from app import app, engine
from twin.contracts import validate_sensor_packet


def test_contract_accepts_optional_device_ms():
    """Verify contracts accept device_ms optionally, maintaining backward compatibility with old firmware."""
    # With device_ms (new firmware)
    pkt_new = {
        "device_id": "ESP32-NEW-FW",
        "device_ms": 45210,
        "heart_rate": 140.0,
        "spo2": 98.5,
        "ax": 0.1,
        "ay": 1.0,
        "az": 0.0,
        "packet": 1
    }
    res_new = validate_sensor_packet(pkt_new)
    assert res_new.is_valid is True
    assert res_new.sanitized_data["device_ms"] == 45210

    # Without device_ms (legacy firmware)
    pkt_old = {
        "device_id": "ESP32-OLD-FW",
        "heart_rate": 140.0,
        "spo2": 98.5,
        "ax": 0.1,
        "ay": 1.0,
        "az": 0.0,
        "packet": 1
    }
    res_old = validate_sensor_packet(pkt_old)
    assert res_old.is_valid is True
    assert res_old.sanitized_data["device_ms"] is None


def test_sequence_gaps_and_lost_packet_counter():
    """Verify server computes per-device sequence gaps and exposes them in /api/health."""
    client = app.test_client()
    dev = "ESP32-GAP-TEST"

    # Packet 1
    p1 = {
        "device_id": dev,
        "device_ms": 1000,
        "heart_rate": 142.0,
        "spo2": 98.0,
        "ax": 0.0, "ay": 1.0, "az": 0.0,
        "packet": 1
    }
    client.post("/api/esp32/telemetry", json=p1)

    # Packet 2
    p2 = dict(p1, packet=2, device_ms=2000)
    client.post("/api/esp32/telemetry", json=p2)

    # Skip 3 & 4, send Packet 5 (gap = 2 lost packets)
    p5 = dict(p1, packet=5, device_ms=5000)
    client.post("/api/esp32/telemetry", json=p5)

    # Health check should report 2 lost packets for dev
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "lost_packet_counts" in data
    assert data["lost_packet_counts"].get(dev) == 2

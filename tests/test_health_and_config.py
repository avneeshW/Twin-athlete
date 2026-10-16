import os
import json
import pytest
from app import app
from twin.config import parse_api_keys, get_runtime_db_path, DEFAULT_RUNTIME_DB
from twin.storage import StorageVault

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c

def test_api_keys_parser():
    # Comma-separated pairs
    raw = "ESP32-1:secret1, ESP32-2:secret2"
    parsed = parse_api_keys(raw)
    assert parsed["ESP32-1"] == "secret1"
    assert parsed["ESP32-2"] == "secret2"

    # JSON formatted
    json_raw = json.dumps({"ESP32-A": "keyA", "ESP32-B": "keyB"})
    parsed_json = parse_api_keys(json_raw)
    assert parsed_json["ESP32-A"] == "keyA"
    assert parsed_json["ESP32-B"] == "keyB"

    # Empty
    assert parse_api_keys("") == {}
    assert parse_api_keys(None) == {}

def test_runtime_db_path_resolution(monkeypatch, tmp_path):
    custom_db = str(tmp_path / "custom.db")
    monkeypatch.setenv("TWIN_DB_PATH", custom_db)
    assert get_runtime_db_path() == custom_db

def test_health_endpoint(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.get_json()
    assert "status" in data
    assert "storage_mode" in data
    assert "persistent" in data
    assert "db_path" in data
    assert "queue_depth" in data
    assert "dropped_counts" in data
    assert "last_packet_age" in data
    assert data["storage_mode"] in ["file", "tmp", "memory"]
    assert isinstance(data["persistent"], bool)
    assert isinstance(data["queue_depth"], int)
    assert isinstance(data["dropped_counts"], dict)
    assert isinstance(data["last_packet_age"], dict)

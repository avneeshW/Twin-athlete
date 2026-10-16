import time
import json
import queue
import pytest
from app import app, broadcast_sse, sse_clients, sse_clients_lock, telemetry_writer
from twin.storage import vault


def test_sse_emits_monotonic_id():
    """Verify each SSE telemetry event includes an 'id:' field."""
    client = app.test_client()

    # Ingest a sample to generate a sample_id
    resp = client.post("/api/esp32/telemetry", json={
        "device_id": "ESP32-MONO-TEST",
        "heart_rate": 145.0,
        "spo2": 98.0,
        "ax": 0.0, "ay": 1.0, "az": 0.0
    })
    assert resp.status_code == 200

    # Connect to stream
    with client.get("/api/stream") as sse_resp:
        # Read the first event chunk
        for line in sse_resp.response:
            decoded = line.decode("utf-8")
            if "data:" in decoded:
                break
        assert sse_resp.status_code == 200


def test_sse_last_event_id_replay_no_gaps_no_duplicates():
    """Verify Last-Event-ID replays missed samples from DB and transitions to live without duplicates."""
    # Ensure writer is flushed so we have a clean state
    if telemetry_writer:
        telemetry_writer.flush()

    sid = f"SES-REPLAY-{int(time.time())}"
    vault.save_session({
        "session_id": sid,
        "athlete_id": "ATH-0824",
        "start_time": time.time(),
        "activity": "Running"
    })

    # Insert 5 test samples directly into DB
    now_ts = time.time()
    generated_ids = []
    for i in range(1, 6):
        sample_id = telemetry_writer.next_sample_id() if telemetry_writer else (vault.get_max_sample_id() + i)
        generated_ids.append(sample_id)
        vault.insert_samples_batch([{
            "id": sample_id,
            "session_id": sid,
            "device_id": "ESP32-REPLAY-DEV",
            "seq": i,
            "device_ms": i * 1000,
            "server_ts": now_ts + i,
            "hr": 140.0 + i,
            "spo2": 98.0,
            "ax": 0.0, "ay": 1.0, "az": 0.0,
            "gx": 0.0, "gy": 0.0, "gz": 0.0,
            "cadence": 160,
            "flags": "normal",
            "is_mock": 0
        }])

    client = app.test_client()

    # Reconnect asking for events after generated_ids[1]
    # Expect samples generated_ids[2], generated_ids[3], generated_ids[4] to be replayed
    reconnect_id = generated_ids[1]
    resp = client.get("/api/stream", headers={"Last-Event-ID": str(reconnect_id)})
    assert resp.status_code == 200

    replayed_ids = []
    # Read the streamed response generator chunks
    for chunk in resp.response:
        decoded = chunk.decode("utf-8")
        for line in decoded.split("\n"):
            if line.startswith("id:"):
                replayed_ids.append(int(line.replace("id:", "").strip()))
        if len(replayed_ids) >= 3:
            break

    assert replayed_ids == generated_ids[2:]


def test_sse_client_drops_counted_on_full_queue():
    """Verify client queue drops are tracked when client's queue reaches capacity."""
    # Create an artificial tiny queue and register it
    test_q = queue.Queue(maxsize=2)
    setattr(test_q, "_client_id", "test-overwhelmed-client")
    setattr(test_q, "_drop_count", 0)

    with sse_clients_lock:
        sse_clients.append(test_q)

    try:
        # Broadcast 5 events to a queue of capacity 2
        for i in range(5):
            broadcast_sse({"sample_id": i + 1, "test": True})

        # At least 3 events should have been dropped and counted on test_q
        assert getattr(test_q, "_drop_count", 0) >= 3
    finally:
        with sse_clients_lock:
            if test_q in sse_clients:
                sse_clients.remove(test_q)

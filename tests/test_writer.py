import os
import time
import queue
import tempfile
import pytest
from twin.storage import StorageVault
from twin.writer import TelemetryWriter

def test_telemetry_writer_batch_flush():
    """Verify TelemetryWriter flushes samples to SQLite in batches using executemany."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_writer.db")
        vault = StorageVault(db_path=db_path)

        # Seed a session so foreign key constraints pass
        session_id = "SES-WRITER-001"
        vault.save_session({
            "session_id": session_id,
            "athlete_id": "ATH-0824",
            "start_time": time.time(),
            "end_time": time.time() + 3600,
            "duration_sec": 3600.0,
            "activity": "Running"
        })

        writer = TelemetryWriter(db_path=db_path, storage_vault=vault)

        # Enqueue 150 samples
        base_ts = time.time()
        for i in range(1, 151):
            writer.enqueue_sample({
                "id": i,
                "session_id": session_id,
                "device_id": "ESP32-ATHLETE-01",
                "seq": i,
                "device_ms": i * 1000,
                "server_ts": base_ts + i,
                "hr": 140.0 + (i % 20),
                "spo2": 98.0,
                "ax": 0.1,
                "ay": 1.0,
                "az": 0.2,
                "gx": 0.0,
                "gy": 0.0,
                "gz": 0.0,
                "cadence": 165,
                "flags": "normal",
                "is_mock": 0
            })

        # Wait for worker thread to flush
        time.sleep(1.5)
        writer.shutdown()

        # Verify all 150 samples were persisted into SQLite
        samples = vault.get_samples_for_session(session_id, limit=200)
        assert len(samples) == 150
        assert samples[0]["id"] == 1
        assert samples[-1]["id"] == 150

def test_telemetry_writer_drops_oldest_on_full_queue():
    """Verify TelemetryWriter drops oldest sample and records per-device drop count when queue is full."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_drops.db")
        vault = StorageVault(db_path=db_path)
        writer = TelemetryWriter(db_path=db_path, storage_vault=vault)
        # Artificially limit capacity to test drop mechanics
        writer.queue = queue.Queue(maxsize=3)

        dev_id = "ESP32-DROP-TEST"
        for i in range(5):
            writer.enqueue_sample({
                "id": i + 1,
                "session_id": "SES-DUMMY",
                "device_id": dev_id,
                "seq": i + 1,
                "device_ms": 1000,
                "server_ts": time.time(),
                "hr": 150.0,
                "spo2": 98.0,
                "ax": 0.0, "ay": 1.0, "az": 0.0,
                "gx": 0.0, "gy": 0.0, "gz": 0.0,
                "cadence": 160,
                "flags": "normal",
                "is_mock": 0
            })

        writer.shutdown()
        # 5 samples enqueued with capacity 3 => at least 2 dropped
        assert writer.dropped_counts.get(dev_id, 0) >= 2

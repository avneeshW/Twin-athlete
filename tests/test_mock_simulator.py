import unittest
import json
import time
import tempfile
import os
import shutil
from twin.storage import StorageVault
from twin.writer import TelemetryWriter
from twin.session_manager import SessionManager
import app as flask_app


class TestMockSimulator(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_mock.db")
        self.vault = StorageVault(db_path=self.db_path)
        self.writer = TelemetryWriter(storage_vault=self.vault)
        self.session_mgr = SessionManager(storage_vault=self.vault, writer=self.writer, idle_timeout=60.0)

        self._orig_vault = flask_app.vault
        self._orig_writer = flask_app.telemetry_writer
        self._orig_session_manager = flask_app.session_manager

        flask_app.app.config["TESTING"] = True
        flask_app.vault = self.vault
        flask_app.telemetry_writer = self.writer
        flask_app.session_manager = self.session_mgr
        self.client = flask_app.app.test_client()

    def tearDown(self):
        if self.session_mgr:
            self.session_mgr.shutdown()
        if self.writer:
            self.writer.shutdown()
        flask_app.vault = self._orig_vault
        flask_app.telemetry_writer = self._orig_writer
        flask_app.session_manager = self._orig_session_manager
        self.temp_dir.cleanup()

    def test_mock_sample_tagging_and_export_exclusion(self):
        now_ts = time.time()
        # Create a real session and a mock session
        self.vault.save_session({
            "session_id": "SES-REAL-001",
            "id": "SES-REAL-001",
            "athlete_id": "ATH-0824",
            "device_id": "ESP32-ATHLETE-01",
            "is_mock": 0,
            "start_time": now_ts - 100,
            "end_time": now_ts - 50,
            "duration_sec": 50,
            "training_load": 25.0
        })

        self.vault.save_session({
            "session_id": "SES-MOCK-001",
            "id": "SES-MOCK-001",
            "athlete_id": "ATH-0824",
            "device_id": "mock",
            "is_mock": 1,
            "start_time": now_ts - 200,
            "end_time": now_ts - 150,
            "duration_sec": 50,
            "training_load": 15.0
        })

        # Insert samples: one real sample in real session, one mock sample in real session, and mock samples in mock session
        self.vault.insert_samples_batch([
            {
                "id": 1,
                "session_id": "SES-REAL-001",
                "device_id": "ESP32-ATHLETE-01",
                "seq": 1,
                "device_ms": 1000,
                "server_ts": now_ts,
                "hr": 150.0,
                "spo2": 98.0,
                "ax": 0.1,
                "ay": 1.0,
                "az": 0.0,
                "gx": 0.0,
                "gy": 0.0,
                "gz": 0.0,
                "cadence": 160,
                "flags": "normal",
                "is_mock": 0
            },
            {
                "id": 2,
                "session_id": "SES-REAL-001",
                "device_id": "mock",
                "seq": 2,
                "device_ms": 2000,
                "server_ts": now_ts + 1,
                "hr": 140.0,
                "spo2": 99.0,
                "ax": 0.0,
                "ay": 1.0,
                "az": 0.0,
                "gx": 0.0,
                "gy": 0.0,
                "gz": 0.0,
                "cadence": 150,
                "flags": "mock",
                "is_mock": 1
            },
            {
                "id": 3,
                "session_id": "SES-MOCK-001",
                "device_id": "mock",
                "seq": 1,
                "device_ms": 1000,
                "server_ts": now_ts - 190,
                "hr": 135.0,
                "spo2": 98.0,
                "ax": 0.0,
                "ay": 1.0,
                "az": 0.0,
                "gx": 0.0,
                "gy": 0.0,
                "gz": 0.0,
                "cadence": 140,
                "flags": "mock",
                "is_mock": 1
            }
        ])

        # 1. get_recent_sessions excludes mock session by default
        recent_real = self.vault.get_recent_sessions("ATH-0824", include_mock=False)
        self.assertEqual(len(recent_real), 1)
        self.assertEqual(recent_real[0]["session_id"], "SES-REAL-001")

        recent_all = self.vault.get_recent_sessions("ATH-0824", include_mock=True)
        self.assertEqual(len(recent_all), 2)

        # 2. list_sessions excludes mock session by default
        list_real = self.vault.list_sessions(include_mock=False)
        self.assertEqual(len(list_real), 1)
        self.assertEqual(list_real[0]["session_id"], "SES-REAL-001")

        # 3. get_samples_for_session excludes mock sample by default
        samples_real = self.vault.get_samples_for_session("SES-REAL-001", include_mock=False)
        self.assertEqual(len(samples_real), 1)
        self.assertEqual(samples_real[0]["id"], 1)

        samples_all = self.vault.get_samples_for_session("SES-REAL-001", include_mock=True)
        self.assertEqual(len(samples_all), 2)

        # 4. CSV export of real session without ?include_mock=1 only exports real samples
        res = self.client.get("/api/sessions/SES-REAL-001/export.csv")
        self.assertEqual(res.status_code, 200)
        csv_text = res.data.decode("utf-8")
        lines = [l for l in csv_text.strip().split("\n") if l]
        # Header + 1 sample
        self.assertEqual(len(lines), 2)
        self.assertIn("ESP32-ATHLETE-01", lines[1])
        self.assertNotIn("mock", lines[1])

        # 5. CSV export of mock session without ?include_mock=1 returns 403 Forbidden
        res_mock = self.client.get("/api/sessions/SES-MOCK-001/export.csv")
        self.assertEqual(res_mock.status_code, 403)
        self.assertIn("marked as mock", res_mock.data.decode("utf-8"))

        # 6. CSV export of mock session with ?include_mock=1 succeeds
        res_mock_ok = self.client.get("/api/sessions/SES-MOCK-001/export.csv?include_mock=1")
        self.assertEqual(res_mock_ok.status_code, 200)
        lines_mock = [l for l in res_mock_ok.data.decode("utf-8").strip().split("\n") if l]
        self.assertEqual(len(lines_mock), 2)
        self.assertIn("SES-MOCK-001", lines_mock[1])

    def test_ingest_tags_simulated_packet_as_mock(self):
        # Post a packet with device_id containing SIMULATED
        payload = {
            "device_id": "ESP32-SIMULATED-DEV",
            "packet": 1,
            "device_ms": 1000,
            "heart_rate": 140.0,
            "spo2": 98.0,
            "ax": 0.1,
            "ay": 0.9,
            "az": 0.0,
            "battery": 95,
            "temperature": 36.5
        }
        res = self.client.post("/api/esp32/telemetry", json=payload)
        self.assertEqual(res.status_code, 200)

        # Writer flush
        self.writer.flush(timeout=2.0)

        # Check DB
        conn = self.vault._get_connection()
        try:
            cur = conn.execute("SELECT * FROM samples WHERE seq = 1")
            row = cur.fetchone()
            self.assertIsNotNone(row)
            d = dict(row)
            self.assertEqual(d["device_id"], "mock")
            self.assertEqual(d["is_mock"], 1)
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main()

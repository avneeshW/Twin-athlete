import unittest
import json
from app import app, engine


class TestE2EIntegration(unittest.TestCase):

    def setUp(self):
        self.client = app.test_client()

    def test_index_serves(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn(b"Digital Twin Athlete", res.data)
        self.assertIn(b"ESP32", res.data)

    def test_status_endpoint(self):
        res = self.client.get("/api/status")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "online")
        self.assertTrue(data["models_ready"])

    def test_esp32_telemetry_post(self):
        payload = {
            "device_id": "ESP32-ATHLETE-01",
            "heart_rate": 152.4,
            "spo2": 98.2,
            "ax": 0.45,
            "ay": 1.82,
            "az": 0.12,
            "battery": 91
        }
        res = self.client.post("/api/esp32/telemetry", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["processed_hr"], 152)
        self.assertEqual(data["hr_zone"], "Tempo")
        self.assertEqual(data["activity"], "Running")

    def test_esp32_status(self):
        res = self.client.get("/api/esp32/status")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("connected", data)
        self.assertIn("status", data)
        self.assertEqual(data["device_id"], "ESP32-ATHLETE-01")

    def test_mock_feed_toggle(self):
        # Start
        res = self.client.post("/api/esp32/mock-feed", json={"action": "start"})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()["mock_running"])

        # Stop
        res = self.client.post("/api/esp32/mock-feed", json={"action": "stop"})
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.get_json()["mock_running"])

    def test_session_reset(self):
        res = self.client.post("/api/session/reset")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()["success"])

    def test_dashboard_data_live(self):
        res = self.client.get("/api/dashboard-data?timeframe=1H")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("vitals", data)
        self.assertIn("charts", data)
        self.assertIn("twin_status", data)
        self.assertIn("device", data)


if __name__ == "__main__":
    unittest.main()

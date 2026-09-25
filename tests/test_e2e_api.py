import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

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

    def test_multi_athlete_api_endpoints(self):
        # 1. List athletes
        res = self.client.get("/api/athletes")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("athletes", data)
        self.assertGreaterEqual(len(data["athletes"]), 5)
        self.assertEqual(data["active_athlete_id"], "ATH-0824")

        # 2. Coach squad overview
        res_coach = self.client.get("/api/coach/team-overview")
        self.assertEqual(res_coach.status_code, 200)
        coach_data = res_coach.get_json()
        self.assertIn("roster", coach_data)
        self.assertIn("average_readiness", coach_data)
        self.assertGreaterEqual(coach_data["squad_size"], 5)

        # 3. Switch active athlete
        res_switch = self.client.post("/api/athlete/switch", json={"athlete_id": "ATH-0102"})
        self.assertEqual(res_switch.status_code, 200)
        switch_data = res_switch.get_json()
        self.assertTrue(switch_data["success"])
        self.assertEqual(switch_data["active_athlete_id"], "ATH-0102")

        # 4. Map hardware device
        res_map = self.client.post("/api/devices/map", json={
            "device_id": "ESP32-ATH-TEST",
            "athlete_id": "ATH-0102"
        })
        self.assertEqual(res_map.status_code, 200)
        self.assertTrue(res_map.get_json()["success"])

        # 5. Check device mappings
        res_mappings = self.client.get("/api/devices/mappings")
        self.assertEqual(res_mappings.status_code, 200)
        self.assertEqual(res_mappings.get_json()["mappings"].get("ESP32-ATH-TEST"), "ATH-0102")

        # 6. Switch back to ATH-0824 for test isolation
        self.client.post("/api/athlete/switch", json={"athlete_id": "ATH-0824"})


if __name__ == "__main__":
    unittest.main()


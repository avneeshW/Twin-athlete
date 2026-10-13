import unittest
import os
import sys
import json
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import app, start_mock_feed, stop_mock_feed
from twin.telemetry import TelemetryEngine

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


class TestESP32SimulationAndGraphs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.config["TESTING"] = True
        cls.client = app.test_client()

        with open(os.path.join(ROOT_DIR, "static", "index.html"), "r", encoding="utf-8") as f:
            cls.static_html = f.read()

        with open(os.path.join(ROOT_DIR, "public", "index.html"), "r", encoding="utf-8") as f:
            cls.public_html = f.read()

        with open(os.path.join(ROOT_DIR, "static", "app.js"), "r", encoding="utf-8") as f:
            cls.static_js = f.read()

        with open(os.path.join(ROOT_DIR, "public", "app.js"), "r", encoding="utf-8") as f:
            cls.public_js = f.read()

    def tearDown(self):
        # Always ensure mock feed is stopped after each test
        stop_mock_feed()

    def test_mock_feed_api_lifecycle(self):
        """Verify POST /api/esp32/mock-feed lifecycle: start, check status, stop, check status."""
        # Start mock feed
        start_res = self.client.post("/api/esp32/mock-feed", json={"action": "start"})
        self.assertEqual(start_res.status_code, 200)
        start_data = start_res.get_json()
        self.assertTrue(start_data["mock_running"])
        self.assertTrue(start_data["connected"])

        # Check esp32 status endpoint reflects mock_mode
        status_res = self.client.get("/api/esp32/status")
        self.assertEqual(status_res.status_code, 200)
        status_data = status_res.get_json()
        self.assertTrue(status_data["mock_mode"])
        self.assertIn("Simulated Feed", status_data["status"])

        # Check dashboard data endpoint reflects mock_mode
        dash_res = self.client.get("/api/dashboard-data")
        self.assertEqual(dash_res.status_code, 200)
        dash_data = dash_res.get_json()
        self.assertTrue(dash_data["device"]["mock_mode"])

        # Stop mock feed
        stop_res = self.client.post("/api/esp32/mock-feed", json={"action": "stop"})
        self.assertEqual(stop_res.status_code, 200)
        stop_data = stop_res.get_json()
        self.assertFalse(stop_data["mock_running"])
        self.assertFalse(stop_data["connected"])

        # Verify status endpoint reflects disconnected / stopped state
        status_res_after = self.client.get("/api/esp32/status")
        status_data_after = status_res_after.get_json()
        self.assertFalse(status_data_after["mock_mode"])

    def test_telemetry_engine_provenance_and_mock_mode(self):
        """Verify TelemetryEngine correctly flags simulated packets as DEMO with mock_mode=True."""
        engine = TelemetryEngine(athlete_age=24, athlete_weight_kg=72.0, resting_hr=55.0)

        # Ingest simulated packet
        sim_packet = {
            "device_id": "ESP32-SIMULATED-RUNNER",
            "heart_rate": 145.0,
            "spo2": 98.0,
            "ax": 0.2,
            "ay": 1.4,
            "az": -0.3,
            "battery": 92
        }
        state = engine.process_telemetry(sim_packet)
        self.assertEqual(state["device"]["provenance"], "DEMO")
        self.assertTrue(state["device"]["mock_mode"])
        self.assertTrue(state["device"]["connected"])

        latest = engine.get_latest_state()
        self.assertEqual(latest["device"]["provenance"], "DEMO")
        self.assertTrue(latest["device"]["mock_mode"])

        # Ingest physical wearable packet (not containing SIMULAT or MOCK)
        live_packet = {
            "device_id": "ESP32-ATHLETE-01",
            "heart_rate": 130.0,
            "spo2": 99.0,
            "ax": 0.1,
            "ay": 1.0,
            "az": 0.0,
            "battery": 88
        }
        live_state = engine.process_telemetry(live_packet)
        self.assertEqual(live_state["device"]["provenance"], "LIVE")
        self.assertFalse(live_state["device"]["mock_mode"])

    def test_simulation_button_markup_separation(self):
        """Verify HTML markup cleanly decouples button icons, labels, and hidden controls."""
        for html_content, name in [(self.static_html, "static"), (self.public_html, "public")]:
            self.assertIn('id="btnLiveToggleSim"', html_content, f"Missing btnLiveToggleSim in {name}")
            self.assertIn('id="liveSimBtnIcon"', html_content, f"Missing liveSimBtnIcon in {name}")
            self.assertIn('id="liveSimBtnText"', html_content, f"Missing liveSimBtnText in {name}")
            self.assertIn('id="btnToggleSimFeed"', html_content, f"Missing btnToggleSimFeed in {name}")
            self.assertIn('id="simFeedBtnText"', html_content, f"Missing simFeedBtnText in {name}")

            # Verify that simFeedBtnText does NOT wrap liveSimBtnText
            bad_nesting = '<span id="simFeedBtnText">\n              <span>⚡</span>\n              <span id="liveSimBtnText">'
            self.assertNotIn(bad_nesting, html_content, f"Found broken nested button spans in {name}")

    def test_graph_containers_and_persistent_elements(self):
        """Verify all graph canvas IDs and containers exist in both static and public index.html."""
        for html_content, name in [(self.static_html, "static"), (self.public_html, "public")]:
            self.assertIn('id="heartRateChart"', html_content, f"Missing heartRateChart canvas in {name}")
            self.assertIn('id="movementChart"', html_content, f"Missing movementChart canvas in {name}")
            self.assertIn('id="hrCanvasContainer"', html_content, f"Missing hrCanvasContainer in {name}")
            self.assertIn('id="movementCanvasContainer"', html_content, f"Missing movementCanvasContainer in {name}")
            self.assertIn('id="scheduleTrajectoryChart"', html_content, f"Missing scheduleTrajectoryChart in {name}")

    def test_javascript_chart_persistence_and_empty_states(self):
        """Verify JS includes empty state handlers, resize observers, and dimension fallbacks."""
        for js_content, name in [(self.static_js, "static"), (self.public_js, "public")]:
            self.assertIn("Waiting for sensor data...", js_content, f"Missing empty state message in {name}")
            self.assertIn("initChartResizeObservers", js_content, f"Missing initChartResizeObservers in {name}")
            self.assertIn("updateSimulatorButtonUI", js_content, f"Missing updateSimulatorButtonUI in {name}")
            self.assertIn("startMockFallbackPolling", js_content, f"Missing startMockFallbackPolling in {name}")
            self.assertIn("isTogglingMock", js_content, f"Missing concurrency guard in {name}")

    def test_static_and_public_parity(self):
        """Verify static/ and public/ files are 100% synchronized."""
        self.assertEqual(self.static_html, self.public_html, "static and public index.html out of sync")
        self.assertEqual(self.static_js, self.public_js, "static and public app.js out of sync")


if __name__ == "__main__":
    unittest.main()

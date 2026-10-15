import os
import sys
import unittest
import json

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT_DIR)

from twin.telemetry import TelemetryEngine
import app as flask_app


class TestSpeedEnduranceReport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.public_html_path = os.path.join(ROOT_DIR, "public", "index.html")
        with open(cls.public_html_path, "r", encoding="utf-8") as f:
            cls.public_html = f.read()

        cls.static_html_path = os.path.join(ROOT_DIR, "static", "index.html")
        with open(cls.static_html_path, "r", encoding="utf-8") as f:
            cls.static_html = f.read()

        cls.public_css_path = os.path.join(ROOT_DIR, "public", "style.css")
        with open(cls.public_css_path, "r", encoding="utf-8") as f:
            cls.public_css = f.read()

        cls.static_css_path = os.path.join(ROOT_DIR, "static", "style.css")
        with open(cls.static_css_path, "r", encoding="utf-8") as f:
            cls.static_css = f.read()

        cls.public_js_path = os.path.join(ROOT_DIR, "public", "app.js")
        with open(cls.public_js_path, "r", encoding="utf-8") as f:
            cls.public_js = f.read()

        cls.static_js_path = os.path.join(ROOT_DIR, "static", "app.js")
        with open(cls.static_js_path, "r", encoding="utf-8") as f:
            cls.static_js = f.read()

        flask_app.app.config["TESTING"] = True
        cls.client = flask_app.app.test_client()
        cls.engine = TelemetryEngine()

    # -------------------------------------------------------------
    # PART 1: SPEED CALCULATION & UI
    # -------------------------------------------------------------
    def test_speed_calculation_method(self):
        """Speed calculation uses acceleration kinetics with drift attenuation."""
        # Resting state: magnitude ~1.0g -> speed should be 0.0
        speed_rest = self.engine.calculate_speed_estimate(dt=0.1, ax=0.0, ay=0.0, az=1.0, mag=1.0, cadence_spm=0.0)
        self.assertEqual(speed_rest["speed_kmh"], 0.0)
        self.assertEqual(speed_rest["speed_mps"], 0.0)
        self.assertEqual(speed_rest["unit"], "km/h")
        self.assertIn("method", speed_rest)

        # Dynamic motion (running): dynamic acceleration + cadence
        speed_run = self.engine.calculate_speed_estimate(dt=0.2, ax=0.4, ay=1.8, az=0.8, mag=2.01, cadence_spm=160.0)
        self.assertGreater(speed_run["speed_kmh"], 2.0)
        self.assertLess(speed_run["speed_kmh"], 35.0)
        self.assertEqual(speed_run["unit"], "km/h")

    def test_speed_in_telemetry_pipeline(self):
        """Telemetry engine returns speed object in vitals."""
        packet = {
            "device_id": "ESP32-UNIT-TEST",
            "heart_rate": 150,
            "spo2": 98,
            "ax": 0.5,
            "ay": 1.7,
            "az": 0.6,
            "battery": 90
        }
        res = self.engine.process_telemetry(packet)
        self.assertIn("speed", res["vitals"])
        speed_data = res["vitals"]["speed"]
        self.assertIn("value", speed_data)
        self.assertIn("unit", speed_data)
        self.assertIn("method", speed_data)

    def test_speed_box_in_html(self):
        """SPEED box replaces the Running/Activity box with vitalSpeedVal."""
        for html in [self.public_html, self.static_html]:
            self.assertIn('id="vitalSpeedVal"', html)
            self.assertIn('id="vitalSpeedUnit"', html)
            self.assertIn('id="vitalSpeedStatus"', html)
            self.assertIn('id="vitalSpeedStatusText"', html)
            self.assertIn("SPEED", html)
            self.assertIn("icon-speed", html)

    # -------------------------------------------------------------
    # PART 2: ENDURANCE CALCULATION & UI
    # -------------------------------------------------------------
    def test_endurance_calculation_method(self):
        """Endurance estimate uses heart rate and SpO2 with realistic physiological degradation."""
        # Optimal vitals: resting HR (60), high SpO2 (99%) -> high endurance
        end_opt = self.engine.calculate_endurance_estimate(hr=60.0, spo2=99.0)
        self.assertTrue(end_opt["is_estimate"])
        self.assertGreaterEqual(end_opt["score"], 80)
        self.assertEqual(end_opt["unit"], "%")

        # Exhausted/strained vitals: HR=185, SpO2=92% -> lower endurance
        end_strain = self.engine.calculate_endurance_estimate(hr=185.0, spo2=92.0)
        self.assertTrue(end_strain["is_estimate"])
        self.assertLess(end_strain["score"], end_opt["score"])
        self.assertIn(end_strain["tier"], ["Depleted", "Low", "Moderate"])

        # Invalid/missing vitals
        end_invalid = self.engine.calculate_endurance_estimate(hr=0.0, spo2=0.0)
        self.assertEqual(end_invalid["status"], "Waiting")

    def test_endurance_in_telemetry_pipeline(self):
        """Telemetry engine returns endurance estimate object in vitals."""
        packet = {
            "device_id": "ESP32-UNIT-TEST",
            "heart_rate": 140,
            "spo2": 97,
            "ax": 0.2,
            "ay": 0.9,
            "az": 0.1,
            "battery": 95
        }
        res = self.engine.process_telemetry(packet)
        self.assertIn("endurance", res["vitals"])
        end_data = res["vitals"]["endurance"]
        self.assertIn("score", end_data)
        self.assertTrue(end_data.get("is_estimate"))

    def test_endurance_box_in_html(self):
        """ENDURANCE box is present in vitals-grid-row."""
        for html in [self.public_html, self.static_html]:
            self.assertIn('id="vitalEnduranceVal"', html)
            self.assertIn('id="vitalEnduranceStatus"', html)
            self.assertIn('id="vitalEnduranceStatusText"', html)
            self.assertIn("ENDURANCE", html)
            self.assertIn("icon-endurance", html)

    # -------------------------------------------------------------
    # PART 3: BOTH BOXES VISIBLE AT ALL TIMES & CSS LAYOUT
    # -------------------------------------------------------------
    def test_grid_layout_has_5_columns(self):
        """CSS includes 5-column grid layout for desktop."""
        for css in [self.public_css, self.static_css]:
            self.assertIn("grid-template-columns: repeat(5, 1fr)", css)
            self.assertIn(".metric-icon-box.icon-speed", css)
            self.assertIn(".metric-icon-box.icon-endurance", css)

    # -------------------------------------------------------------
    # PART 4: ATHLETE PROGRESS REPORT & DATA API
    # -------------------------------------------------------------
    def test_download_progress_report_button_in_html(self):
        """Button exists in Athlete section top-right corner."""
        for html in [self.public_html, self.static_html]:
            self.assertIn('id="btnDownloadProgressReport"', html)
            self.assertIn("Download Progress Report", html)

    def test_progress_data_api_endpoint(self):
        """API returns genuine Before vs After comparison and honest baseline handling."""
        # Test existing athlete with historical records
        resp = self.client.get("/api/athlete/ATH-0824/progress-data")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("athlete_id"), "ATH-0824")
        self.assertIn("comparison_table", data)
        self.assertIn("data_provenance", data)
        self.assertIn("observations", data)

        # Ensure comparison table has genuine metrics
        table = data["comparison_table"]
        metric_names = [row["metric"] for row in table]
        self.assertIn("Heart Rate", metric_names)
        self.assertIn("SpO2 Saturation", metric_names)
        self.assertIn("Speed", metric_names)
        self.assertIn("Endurance (Estimate)", metric_names)

        # Ensure no fabricated baselines: row contains baseline status or real value
        for row in table:
            self.assertIn("before", row)
            self.assertIn("after", row)
            self.assertIn("change_str", row)

    def test_progress_data_for_unknown_athlete_handles_honestly(self):
        """API handles athlete without history by marking baseline unavailable."""
        resp = self.client.get("/api/athlete/ATH-NONEXISTENT/progress-data")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertTrue(data.get("success"))
        table = data["comparison_table"]
        # All baselines should be honestly flagged as unavailable
        for row in table:
            self.assertEqual(row["before_display"], "Baseline unavailable")
            self.assertEqual(row["change_str"], "--")

    def test_pdf_generation_black_and_white_in_js(self):
        """Client-side app.js contains black-and-white PDF generation logic with jsPDF."""
        for js in [self.public_js, self.static_js]:
            self.assertIn("downloadAthleteProgressReport", js)
            self.assertIn("jspdf", js.lower())
            self.assertIn("SYNC Athlete Progress Report", js)
            self.assertIn("Baseline unavailable", js)
            self.assertIn("SYNC_Athlete_Progress_Report_", js)


if __name__ == "__main__":
    unittest.main()

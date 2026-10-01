import unittest
import os
import re

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

class TestAthleteDashboardChanges(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        html_path = os.path.join(ROOT_DIR, "static", "index.html")
        with open(html_path, "r", encoding="utf-8") as f:
            cls.html = f.read()

        css_path = os.path.join(ROOT_DIR, "static", "style.css")
        with open(css_path, "r", encoding="utf-8") as f:
            cls.css = f.read()

        js_path = os.path.join(ROOT_DIR, "static", "app.js")
        with open(js_path, "r", encoding="utf-8") as f:
            cls.js = f.read()

    def test_status_matrix_completely_removed(self):
        """1. REMOVE 'ATHLETE DIGITAL TWIN STATUS MATRIX'"""
        self.assertNotIn("Athlete Digital Twin Status Matrix", self.html)
        self.assertNotIn("COMPUTATIONAL BIOMARKERS", self.html)
        self.assertNotIn("twin-pillars-grid", self.html)
        self.assertNotIn("dashboard-pillars-section", self.html)

    def test_telemetry_section_relocated_to_top(self):
        """2. MOVE 'LIVE BIOMETRIC TELEMETRY & INERTIAL KINEMATICS' to top under hero"""
        hero_idx = self.html.find('class="dashboard-hero-section"')
        telemetry_idx = self.html.find('class="dashboard-telemetry-section"')
        safety_idx = self.html.find('class="dashboard-safety-section"')
        sessions_idx = self.html.find('class="dashboard-history-section"')

        self.assertNotEqual(hero_idx, -1)
        self.assertNotEqual(telemetry_idx, -1)
        self.assertNotEqual(safety_idx, -1)
        self.assertNotEqual(sessions_idx, -1)

        # Order must be: hero -> telemetry -> safety -> sessions
        self.assertTrue(hero_idx < telemetry_idx < safety_idx < sessions_idx)

    def test_vitals_functional_ids_preserved(self):
        """5. KEEP THE SENSOR CARDS FUNCTIONAL"""
        required_vital_ids = [
            "vitalHrVal", "vitalHrTrend", "vitalHrStatus", "vitalHrStatusText",
            "vitalSpo2Val", "vitalSpo2Status", "vitalSpo2StatusText",
            "vitalActivityVal", "vitalActivitySub",
            "vitalAccelVal", "vitalAccelTrend", "vitalAccelStatus", "vitalAccelStatusText"
        ]
        for vid in required_vital_ids:
            self.assertIn(f'id="{vid}"', self.html, f"Missing vital element id: {vid}")

    def test_sensor_telemetry_moved_to_analytics(self):
        """3. & 6. MOVE 'LIVE DYNAMIC SENSOR TELEMETRY' TO ANALYTICS"""
        dashboard_idx = self.html.find('id="view-dashboard"')
        analytics_idx = self.html.find('id="view-analytics"')
        sensor_card_idx = self.html.find('class="card sensor-data-card"')

        self.assertNotEqual(sensor_card_idx, -1)
        # Must be inside #view-analytics (after analytics_idx)
        self.assertTrue(sensor_card_idx > analytics_idx)

        # Ensure not duplicated
        second_sensor_card_idx = self.html.find('class="card sensor-data-card"', sensor_card_idx + 1)
        self.assertEqual(second_sensor_card_idx, -1)

        # Ensure canvas IDs are present
        self.assertIn('id="heartRateChart"', self.html)
        self.assertIn('id="movementChart"', self.html)
        self.assertIn('id="hrCanvasContainer"', self.html)
        self.assertIn('id="movementCanvasContainer"', self.html)
        self.assertIn('id="accelLegendGroup"', self.html)

    def test_improved_sensor_icons(self):
        """4. IMPROVE THE SENSOR ICONS - subtle, professional, no neon glow"""
        # Ensure icon boxes use subtle tints and borders
        self.assertIn(".metric-icon-box.icon-heart", self.css)
        self.assertIn(".metric-icon-box.icon-spo2", self.css)
        self.assertIn(".metric-icon-box.icon-activity", self.css)
        self.assertIn(".metric-icon-box.icon-accel", self.css)

        # Ensure neon drop shadow is removed from cardiac pulse
        self.assertNotIn("filter: drop-shadow(0 0 14px rgba(255, 69, 58, 0.9))", self.css)
        self.assertNotIn("filter: drop-shadow(0 0 10px rgba(255, 69, 58, 0.8))", self.css)

if __name__ == "__main__":
    unittest.main()

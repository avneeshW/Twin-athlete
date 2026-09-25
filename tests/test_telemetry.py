import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
import time
from twin.telemetry import TelemetryEngine


class TestTelemetryEngine(unittest.TestCase):

    def setUp(self):
        self.engine = TelemetryEngine(athlete_age=24, athlete_weight_kg=72.0, resting_hr=55.0)

    def test_hr_zones(self):
        # Max HR = 220 - 24 = 196
        # Zone 1: < 60% = < 117.6
        z1 = self.engine.get_hr_zone(95)
        self.assertEqual(z1["zone"], 1)
        self.assertEqual(z1["label"], "Recovery")

        # Zone 2: 60 - 70% = 117.6 - 137.2
        z2 = self.engine.get_hr_zone(125)
        self.assertEqual(z2["zone"], 2)
        self.assertEqual(z2["label"], "Aerobic")

        # Zone 3: 70 - 80% = 137.2 - 156.8
        z3 = self.engine.get_hr_zone(145)
        self.assertEqual(z3["zone"], 3)
        self.assertEqual(z3["label"], "Tempo")

        # Zone 4: 80 - 90% = 156.8 - 176.4
        z4 = self.engine.get_hr_zone(165)
        self.assertEqual(z4["zone"], 4)
        self.assertEqual(z4["label"], "Threshold")

        # Zone 5: >= 90% = >= 176.4
        z5 = self.engine.get_hr_zone(185)
        self.assertEqual(z5["zone"], 5)
        self.assertEqual(z5["label"], "VO2 Max")

    def test_spo2_assessment(self):
        norm = self.engine.assess_spo2(98.0)
        self.assertEqual(norm["status"], "Normal")
        self.assertIsNone(norm["alert"])

        mild = self.engine.assess_spo2(92.0)
        self.assertEqual(mild["status"], "Mild Hypoxia")

        crit = self.engine.assess_spo2(87.0)
        self.assertEqual(crit["status"], "Critical Hypoxia")
        self.assertIn("ALERT", crit["alert"])

    def test_activity_classification(self):
        rest = self.engine.classify_activity(1.02, 0.02)
        self.assertEqual(rest["activity"], "Resting")

        walk = self.engine.classify_activity(1.35, 0.15)
        self.assertEqual(walk["activity"], "Walking")

        run = self.engine.classify_activity(2.1, 0.5)
        self.assertEqual(run["activity"], "Running")

        sprint = self.engine.classify_activity(3.2, 1.2)
        self.assertEqual(sprint["activity"], "Sprinting")

    def test_calories_burned(self):
        kcal = self.engine.calculate_calories_burned(hr=150, dt_seconds=60)
        # Should be a reasonable aerobic burn rate (~10 - 16 kcal/min for 72kg, 24yo)
        self.assertTrue(10.0 <= kcal <= 18.0, f"Unexpected kcal: {kcal}")

    def test_process_telemetry_packet(self):
        packet = {
            "device_id": "ESP32-TEST-UNIT",
            "heart_rate": 142,
            "spo2": 97,
            "ax": 0.35,
            "ay": 1.45,
            "az": 0.85,
            "battery": 88
        }
        res = self.engine.process_telemetry(packet)

        self.assertIn("device", res)
        self.assertEqual(res["device"]["id"], "ESP32-TEST-UNIT")
        self.assertEqual(res["device"]["battery"], 88)
        self.assertIn("vitals", res)
        self.assertEqual(res["vitals"]["heart_rate"]["value"], 142)
        self.assertEqual(res["vitals"]["spo2"]["value"], 97)
        self.assertIn("recent_session", res)
        self.assertIn("twin_status", res)
        self.assertIn("charts", res)
        self.assertTrue(len(res["charts"]["heart_rate"]["points"]) > 0)


if __name__ == "__main__":
    unittest.main()

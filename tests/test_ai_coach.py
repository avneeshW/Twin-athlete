"""
Unit & Integration Test Suite for Personalized Digital Twin + AI Athlete Coach
Verifies:
1. Modular Physiological Scoring (Readiness, Recovery, Fatigue, Performance, Load)
2. Overall State Classification (Ready, Recovery, High Fatigue)
3. Smart Anomaly & Injury-Risk Indicator Detection
4. AI Daily Recommendation & Factor Attribution
5. What-If Comparative Scenario Simulation (A vs B vs C vs Custom)
6. Natural-Language AI Insights & Automated Weekly Report
7. Full Flask API Endpoint Responses
"""

import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
import json
import pandas as pd
from twin import coach as ai_coach_engine
import app


class TestAICoachEngine(unittest.TestCase):

    def setUp(self):
        self.client = app.app.test_client()

    def test_modular_scoring(self):
        # 1. Training Load
        load = ai_coach_engine.calculate_training_load(duration_min=60, intensity_pct=0.65)
        self.assertGreater(load, 0)
        self.assertIsInstance(load, float)

        # 2. Recovery & Fatigue
        rec = ai_coach_engine.calculate_recovery(sleep_hours=8.0, prev_fatigue=30.0)
        self.assertTrue(10.0 <= rec <= 99.0)

        fat = ai_coach_engine.calculate_fatigue(prev_fatigue=30.0, daily_load=45.0, sleep_hours=8.0)
        self.assertTrue(5.0 <= fat <= 98.0)

        # 3. Readiness (Modular weights)
        readiness = ai_coach_engine.calculate_readiness(recovery=78.0, fatigue=38.0, sleep_hours=7.8)
        self.assertTrue(10.0 <= readiness <= 99.0)

        # 4. Performance
        perf = ai_coach_engine.calculate_performance(readiness=readiness, recovery=78.0)
        self.assertTrue(10.0 <= perf <= 99.0)

    def test_overall_state_classification(self):
        # High Fatigue
        k1, l1, c1 = ai_coach_engine.classify_overall_state(readiness=50.0, fatigue=68.0, recovery=55.0)
        self.assertEqual(k1, "HIGH_FATIGUE")
        self.assertEqual(c1, "red")

        # Recovery Recommended
        k2, l2, c2 = ai_coach_engine.classify_overall_state(readiness=60.0, fatigue=40.0, recovery=58.0)
        self.assertEqual(k2, "RECOVERY_RECOMMENDED")
        self.assertEqual(c2, "amber")

        # Ready for Training
        k3, l3, c3 = ai_coach_engine.classify_overall_state(readiness=85.0, fatigue=32.0, recovery=82.0)
        self.assertEqual(k3, "READY_FOR_TRAINING")
        self.assertEqual(c3, "green")

    def test_anomaly_detection_clinical_wording(self):
        # Spike test
        alerts = ai_coach_engine.detect_anomalies({
            "daily_load": 75.0,
            "fatigue": 58.0,
            "recovery": 52.0,
            "asymmetry_pct": 14.2,
            "max_impact_g": 3.1
        })
        self.assertGreaterEqual(len(alerts), 1)

        # Verify phrasing is training-risk indicator, NOT diagnosis
        for a in alerts:
            text = (a.get("description", "") + " " + a.get("title", "")).lower()
            self.assertNotIn("you are injured", text)
            self.assertIn("suggested_action", a)
            self.assertIn("risk_factors", a)

    def test_daily_recommendation_and_why_factors(self):
        rec = ai_coach_engine.generate_recommendation({
            "readiness": 85.0,
            "fatigue": 35.0,
            "recovery": 80.0,
            "sleep_hours": 8.0
        })
        self.assertIn("headline", rec)
        self.assertIn("focus", rec)
        self.assertIn("duration_min", rec)
        self.assertIn("why_factors", rec)
        self.assertGreaterEqual(len(rec["why_factors"]), 4)

    def test_what_if_comparative_scenarios(self):
        results = ai_coach_engine.simulate_scenarios_comparison(
            current_state={"fatigue": 38.0, "recovery": 78.0, "readiness": 85.0},
            custom_duration=75,
            custom_intensity=0.80
        )
        self.assertIn("scenarios", results)
        scenarios = results["scenarios"]
        self.assertEqual(len(scenarios), 4)

        # Scenario A (High) vs Scenario C (Low)
        sc_a = next(s for s in scenarios if s["id"] == "A")
        sc_c = next(s for s in scenarios if s["id"] == "C")
        self.assertGreater(sc_a["daily_load"], sc_c["daily_load"])
        self.assertGreater(sc_a["predicted_fatigue"], sc_c["predicted_fatigue"])
        self.assertIn("disclaimer", sc_a)

    def test_weekly_report(self):
        rep = ai_coach_engine.generate_weekly_report()
        self.assertIn("ai_summary", rep)
        self.assertIn("performance", rep)
        self.assertIn("training", rep)
        self.assertIn("recovery", rep)

    def test_api_endpoints(self):
        # 1. Coach Overview
        res = self.client.get("/api/ai/coach-overview")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("athlete", data)
        self.assertIn("digital_twin", data)
        self.assertIn("recommendation", data)
        self.assertIn("smart_alerts", data)
        self.assertIn("insights", data)
        self.assertIn("weekly_report", data)
        self.assertEqual(data["digital_twin"]["overall_state"]["key"], "READY_FOR_TRAINING")

        # 2. What-If Scenarios
        res2 = self.client.post("/api/ai/what-if-scenarios", json={"duration": 90, "intensity": 0.85})
        self.assertEqual(res2.status_code, 200)
        data2 = res2.get_json()
        self.assertEqual(len(data2["scenarios"]), 4)

        # 3. Why Recommendation
        res3 = self.client.get("/api/ai/why-recommendation")
        self.assertEqual(res3.status_code, 200)
        data3 = res3.get_json()
        self.assertIn("weights", data3)
        self.assertIn("factors", data3)

        # 4. Weekly Report
        res4 = self.client.get("/api/ai/weekly-report")
        self.assertEqual(res4.status_code, 200)
        data4 = res4.get_json()
        self.assertIn("ai_summary", data4)

        # 5. Enriched Dashboard Data
        res5 = self.client.get("/api/dashboard-data")
        self.assertEqual(res5.status_code, 200)
        data5 = res5.get_json()
        self.assertIn("twin_status", data5)
        self.assertIn("overall_state_label", data5["twin_status"])
        self.assertIn("readiness_value", data5["twin_status"])


if __name__ == "__main__":
    unittest.main()

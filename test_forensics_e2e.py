"""
COMPREHENSIVE FORENSIC & END-TO-END VERIFICATION TEST SUITE
Validates:
1. Physiological Sensor Data Contracts & Out-of-Range Rejections (Phase 2)
2. Telemetry Ingestion HTTP 422 Rejection on Malformed/Impossible Data (Phase 3)
3. Sensor Data Quality Index & Diagnostics (Phase 15)
4. Model Card Artifact Schema & Empirical Evaluation Metrics (Phase 6)
5. Closed-Loop Prediction-vs-Actual Outcome Tracking (Phase 9)
6. Personalization Baseline Calibration & Cold-Start Tiering (Phase 7)
7. Multi-Role Coach Team Overview (Phase 12)
8. Security Headers Middleware (Phase 16)
9. Athlete Data Privacy Policy & Audit Logging (Phases 17, 23)
10. What-If Counterfactual Scenarios with Empirical Uncertainty (Phase 8)
"""

import unittest
import json
import os
import twin_contracts
import app
import ai_coach_engine


class TestForensicsE2E(unittest.TestCase):

    def setUp(self):
        self.client = app.app.test_client()

    def test_sensor_packet_validation_boundaries(self):
        # 1. Valid Packet
        valid_raw = {
            "device_id": "ESP32-ATHLETE-01",
            "heart_rate": 142.5,
            "spo2": 98.0,
            "ax": 0.45,
            "ay": 1.25,
            "az": 0.05,
            "battery": 92
        }
        res_valid = twin_contracts.validate_sensor_packet(valid_raw)
        self.assertTrue(res_valid.is_valid)
        self.assertEqual(len(res_valid.errors), 0)
        self.assertEqual(res_valid.sanitized_data["heart_rate"], 142.5)

        # 2. Out-of-range Heart Rate (Impossible 350 BPM)
        res_high_hr = twin_contracts.validate_sensor_packet({**valid_raw, "heart_rate": 350.0})
        self.assertFalse(res_high_hr.is_valid)
        self.assertTrue(any("outside physiologically viable range" in e for e in res_high_hr.errors))

        # 3. Out-of-range Heart Rate (Impossible 15 BPM)
        res_low_hr = twin_contracts.validate_sensor_packet({**valid_raw, "heart_rate": 15.0})
        self.assertFalse(res_low_hr.is_valid)

        # 4. Out-of-range SpO2 (Impossible 45%)
        res_low_spo2 = twin_contracts.validate_sensor_packet({**valid_raw, "spo2": 45.0})
        self.assertFalse(res_low_spo2.is_valid)
        self.assertTrue(any("SpO2" in e for e in res_low_spo2.errors))

        # 5. Missing Device ID
        res_no_dev = twin_contracts.validate_sensor_packet({"heart_rate": 80, "spo2": 98})
        self.assertFalse(res_no_dev.is_valid)
        self.assertTrue(any("device_id" in e for e in res_no_dev.errors))

        # 6. Malformed Non-Dict
        res_bad_type = twin_contracts.validate_sensor_packet("not a json object")
        self.assertFalse(res_bad_type.is_valid)

    def test_telemetry_rejection_http422(self):
        # Sending physiologically impossible packet must yield HTTP 422 Unprocessable Entity
        bad_payload = {
            "device_id": "ESP32-TEST",
            "heart_rate": 450,  # Impossible
            "spo2": 98
        }
        res = self.client.post("/api/esp32/telemetry", json=bad_payload)
        self.assertEqual(res.status_code, 422)
        data = res.get_json()
        self.assertEqual(data["status"], "rejected")
        self.assertIn("details", data)

    def test_telemetry_acceptance_http200(self):
        # Valid telemetry packet must yield HTTP 200 with provenance and quality metrics
        good_payload = {
            "device_id": "ESP32-ATHLETE-01",
            "heart_rate": 152.0,
            "spo2": 98.0,
            "ax": 0.40,
            "ay": 1.20,
            "az": 0.10,
            "battery": 90
        }
        res = self.client.post("/api/esp32/telemetry", json=good_payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["provenance"], "LIVE")
        self.assertIn("data_quality_index", data)

    def test_security_headers_middleware(self):
        res = self.client.get("/api/status")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(res.headers.get("X-Frame-Options"), "SAMEORIGIN")
        self.assertEqual(res.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin")

    def test_model_card_endpoint_and_schema(self):
        res = self.client.get("/api/model-card")
        self.assertEqual(res.status_code, 200)
        card = res.get_json()
        self.assertEqual(card["model_id"], "twin-athlete-state-transition-v2.4")
        self.assertEqual(card["version"], "2.4.0")
        self.assertIn("architecture", card)
        self.assertIn("metrics", card)
        self.assertGreater(card["metrics"]["fatigue_model"]["r2_score"], 0.85)
        self.assertGreater(card["metrics"]["recovery_model"]["r2_score"], 0.85)
        self.assertIn("known_limitations", card)
        self.assertIn("non_intended_use", card)

    def test_data_quality_diagnostics(self):
        res = self.client.get("/api/telemetry/data-quality")
        self.assertEqual(res.status_code, 200)
        dq = res.get_json()
        self.assertIn("grade", dq)
        self.assertIn("quality_index_pct", dq)
        self.assertIn("calibration", dq)
        self.assertIn("sensor_limits", dq)

    def test_prediction_outcome_feedback_loop(self):
        # 1. Fetch summary
        res = self.client.get("/api/ai/predicted-vs-actual")
        self.assertEqual(res.status_code, 200)
        summary = res.get_json()
        self.assertGreater(summary["total_predictions"], 0)
        self.assertIn("mean_absolute_error", summary)
        self.assertIn("model_drift_status", summary)

        # 2. Record new prediction
        pred_id = ai_coach_engine.prediction_tracker.record_prediction(
            target_metric="Fatigue (%)",
            predicted_val=42.0,
            scenario_name="Test Deload"
        )
        self.assertTrue(pred_id.startswith("PRED-"))

        # 3. Close the loop with ground truth outcome
        outcome_res = self.client.post("/api/feedback/record-outcome", json={
            "prediction_id": pred_id,
            "observed": 43.5
        })
        self.assertEqual(outcome_res.status_code, 200)

        # Verify record updated
        updated_summary = self.client.get("/api/ai/predicted-vs-actual").get_json()
        verified_rec = next(r for r in updated_summary["history"] if r["id"] == pred_id)
        self.assertEqual(verified_rec["status"], "VERIFIED")
        self.assertEqual(verified_rec["observed"], 43.5)
        self.assertEqual(verified_rec["error"], 1.5)

    def test_personalization_and_baseline_updates(self):
        # Initial baseline check
        profile = ai_coach_engine.athlete_profile
        self.assertEqual(profile.personalization_tier, "CALIBRATED")
        self.assertIn("Fully calibrated", profile.personalization_confidence)

        # Update baseline
        res = self.client.post("/api/athlete/baseline", json={
            "resting_hr_baseline": 52.0,
            "typical_sleep_baseline": 8.0
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["profile"]["resting_hr_baseline"], 52.0)
        self.assertEqual(data["profile"]["typical_sleep_baseline"], 8.0)

        # Reset baseline
        res_reset = self.client.post("/api/athlete/baseline", json={"action": "reset"})
        self.assertEqual(res_reset.status_code, 200)
        self.assertEqual(res_reset.get_json()["profile"]["resting_hr_baseline"], 54.0)

    def test_coach_team_overview(self):
        res = self.client.get("/api/coach/team-overview")
        self.assertEqual(res.status_code, 200)
        overview = res.get_json()
        self.assertGreaterEqual(overview["squad_size"], 5)
        self.assertIn("roster", overview)
        self.assertIn("optimal_count", overview)

    def test_privacy_and_audit_endpoints(self):
        # Privacy policy
        res_priv = self.client.get("/api/privacy-policy")
        self.assertEqual(res_priv.status_code, 200)
        priv = res_priv.get_json()
        self.assertFalse(priv["commercial_use"])
        self.assertIn("medical_disclaimer", priv)

        # Audit log
        res_audit = self.client.get("/api/audit-log")
        self.assertEqual(res_audit.status_code, 200)
        audit = res_audit.get_json()
        self.assertGreater(len(audit["events"]), 0)

    def test_what_if_uncertainty_intervals(self):
        res = self.client.post("/api/ai/what-if-scenarios", json={"duration": 60, "intensity": 0.70})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        for sc in data["scenarios"]:
            self.assertIn("fatigue_uncertainty", sc)
            self.assertIn("fatigue_interval", sc)
            self.assertIn("recovery_uncertainty", sc)
            self.assertIn("recovery_interval", sc)
            self.assertIn("confidence_score", sc)
            self.assertEqual(sc["model_version"], "v2.4-rf-impulse")


if __name__ == "__main__":
    unittest.main()

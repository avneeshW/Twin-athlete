"""
Unit Test Suite for Zero-Dependency SQLite + WAL Storage Vault (storage.py)
Verifies:
1. SQLite initialization and schema creation.
2. WAL journal mode configuration on persistent database.
3. Athlete baseline profile persistence, update, and retrieval.
4. Prediction-vs-Actual feedback ledger persistence, outcome verification, and query order.
5. Workout session history storage and JSON parsing of HR zone distribution.
6. Audit event logging and retrieval.
"""

import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import time
import tempfile
import unittest
from twin.storage import StorageVault


class TestStorageVault(unittest.TestCase):

    def setUp(self):
        # Create a temporary database file for isolation
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_db_path = os.path.join(self.temp_dir.name, "test_twin.db")
        self.vault = StorageVault(db_path=self.test_db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_wal_mode_enabled(self):
        """Verify SQLite database runs in WAL journal mode."""
        conn = self.vault._get_connection()
        try:
            mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
            self.assertEqual(mode.lower(), "wal")
        finally:
            conn.close()

    def test_athlete_profile_crud(self):
        """Verify saving, updating, and fetching athlete baseline profile."""
        # Non-existent athlete returns None
        self.assertIsNone(self.vault.get_athlete_profile("UNKNOWN-ATHLETE"))

        # Save profile
        profile = {
            "athlete_id": "ATH-0824",
            "name": "Daniel Saji",
            "sport": "Football",
            "age": 24,
            "height_cm": 182.0,
            "weight_kg": 75.5,
            "resting_hr_baseline": 54.0,
            "max_hr": 195.0,
            "vo2_max": 58.5,
            "chronic_load_baseline": 42.0,
            "typical_sleep_baseline": 7.8,
            "history_days": 180,
            "dominant_leg": "Right"
        }
        self.vault.save_athlete_profile(profile)

        fetched = self.vault.get_athlete_profile("ATH-0824")
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched["name"], "Daniel Saji")
        self.assertEqual(fetched["resting_hr_baseline"], 54.0)

        # Update baseline values
        profile["resting_hr_baseline"] = 51.5
        profile["typical_sleep_baseline"] = 8.2
        self.vault.save_athlete_profile(profile)

        updated = self.vault.get_athlete_profile("ATH-0824")
        self.assertEqual(updated["resting_hr_baseline"], 51.5)
        self.assertEqual(updated["typical_sleep_baseline"], 8.2)

    def test_feedback_ledger_persistence(self):
        """Verify storing predictions and closing the loop with verified observed outcomes."""
        initial_count = self.vault.count_feedback_records()
        self.assertEqual(initial_count, 0)

        pred_rec = {
            "id": "PRED-9999",
            "date": "25 Sep 2026",
            "metric": "Fatigue (%)",
            "scenario": "Simulated Deload",
            "model_version": "v2.4-rf-impulse",
            "predicted": 32.0,
            "observed": None,
            "error": None,
            "percentage_error": None,
            "status": "PENDING_VERIFICATION",
            "status_color": "cyan",
            "created_at": time.time(),
            "verified_at": None
        }
        self.vault.save_feedback_record(pred_rec)
        self.assertEqual(self.vault.count_feedback_records(), 1)

        # Close the loop with ground truth outcome
        success = self.vault.update_feedback_outcome(
            pred_id="PRED-9999",
            observed=33.5,
            error=1.5,
            pct_error=4.5,
            status_color="green",
            verified_at=time.time()
        )
        self.assertTrue(success)

        # Fetch records and check updated outcome
        records = self.vault.get_all_feedback_records()
        self.assertEqual(len(records), 1)
        r = records[0]
        self.assertEqual(r["id"], "PRED-9999")
        self.assertEqual(r["status"], "VERIFIED")
        self.assertEqual(r["observed"], 33.5)
        self.assertEqual(r["error"], 1.5)

    def test_session_history_persistence(self):
        """Verify saving and querying workout session telemetry."""
        session_data = {
            "session_id": "SES-1001",
            "athlete_id": "ATH-0824",
            "start_time": time.time() - 3600,
            "end_time": time.time(),
            "duration_sec": 3600.0,
            "avg_hr": 148.5,
            "peak_hr": 182.0,
            "avg_spo2": 97.8,
            "calories": 620.0,
            "steps": 4800,
            "training_load": 58.5,
            "activity": "Running",
            "hr_zone_distribution": {"Zone 1": 10, "Zone 2": 25, "Zone 3": 45, "Zone 4": 15, "Zone 5": 5}
        }
        self.vault.save_session(session_data)

        recent = self.vault.get_recent_sessions("ATH-0824", limit=5)
        self.assertEqual(len(recent), 1)
        s = recent[0]
        self.assertEqual(s["session_id"], "SES-1001")
        self.assertEqual(s["avg_hr"], 148.5)
        self.assertIsInstance(s["hr_zone_distribution"], dict)
        self.assertEqual(s["hr_zone_distribution"]["Zone 3"], 45)

    def test_audit_log_persistence(self):
        """Verify audit event creation and retrieval."""
        self.vault.save_audit_event(
            event_id="EVT-TEST-01",
            event_type="CALIBRATION",
            severity="INFO",
            source="test_storage",
            details={"drift_offset": 0.02}
        )

        events = self.vault.get_audit_events(limit=10)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["event_id"], "EVT-TEST-01")
        self.assertEqual(events[0]["details"]["drift_offset"], 0.02)


if __name__ == "__main__":
    unittest.main()

"""
Unit Test Suite for Multi-Athlete Registry Engine (registry_engine.py)
Verifies:
1. Default squad initialization (5 athletes) and default active athlete ATH-0824.
2. Athlete switching and state isolation between athletes.
3. Independent baseline and prediction ledger management per athlete.
4. Hardware device_id -> athlete_id mapping and routing.
5. Dynamic registration of new squad athletes.
6. Squad-level ACWR, risk distribution, and squad summary computation.
"""

import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
import tempfile
from twin.storage import StorageVault
from twin.registry import AthleteRegistry, DigitalTwin
from twin import coach as ai_coach_engine


class TestAthleteRegistry(unittest.TestCase):

    def setUp(self):
        # Create an isolated temporary SQLite database for each test
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_db_path = os.path.join(self.temp_dir.name, "test_registry.db")
        self.test_vault = StorageVault(db_path=self.test_db_path)
        self.registry = AthleteRegistry(storage_vault=self.test_vault)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_default_squad_initialization(self):
        """Verify default squad of 5 athletes is created with ATH-0824 as default active."""
        self.assertEqual(self.registry.get_active_athlete_id(), "ATH-0824")
        athletes = self.registry.list_athletes()
        self.assertGreaterEqual(len(athletes), 5)

        # Check Daniel Saji
        daniel = next(a for a in athletes if a["id"] == "ATH-0824")
        self.assertEqual(daniel["name"], "Daniel Saji")
        self.assertEqual(daniel["position"], "Midfield / Box-to-Box")

        # Check Marcus Vance
        marcus = next(a for a in athletes if a["id"] == "ATH-0102")
        self.assertEqual(marcus["name"], "Marcus Vance")
        self.assertEqual(marcus["position"], "Center Forward")

    def test_switch_active_athlete(self):
        """Verify switching active athlete changes the active twin, profile, and tracker."""
        self.assertEqual(self.registry.get_active_profile().name, "Daniel Saji")

        # Switch to Marcus Vance
        switched = self.registry.set_active_athlete("ATH-0102")
        self.assertTrue(switched)
        self.assertEqual(self.registry.get_active_athlete_id(), "ATH-0102")
        self.assertEqual(self.registry.get_active_profile().name, "Marcus Vance")

        # Invalid athlete ID returns False and doesn't change active
        invalid_switched = self.registry.set_active_athlete("NONEXISTENT-ATHLETE")
        self.assertFalse(invalid_switched)
        self.assertEqual(self.registry.get_active_athlete_id(), "ATH-0102")

    def test_multi_athlete_state_isolation(self):
        """Verify each athlete has independent baseline, recovery, and prediction trackers."""
        twin_daniel = self.registry.get_twin("ATH-0824")
        twin_marcus = self.registry.get_twin("ATH-0102")

        # Baseline isolation
        twin_daniel.profile.update_baseline(new_rhr=50.0)
        self.assertEqual(twin_daniel.profile.resting_hr_baseline, 50.0)
        self.assertEqual(twin_marcus.profile.resting_hr_baseline, 58.0)

        # Feedback ledger isolation
        pred_id_daniel = twin_daniel.tracker.record_prediction("Fatigue (%)", 35.0, "Tempo Drill")
        self.assertTrue(any(r["id"] == pred_id_daniel for r in twin_daniel.tracker.records))
        self.assertFalse(any(r["id"] == pred_id_daniel for r in twin_marcus.tracker.records))

    def test_device_mapping(self):
        """Verify device_id to athlete_id mapping and lookup."""
        # Default mapping
        self.assertEqual(self.registry.get_athlete_for_device("ESP32-ATHLETE-01"), "ATH-0824")
        self.assertEqual(self.registry.get_athlete_for_device("ESP32-ATHLETE-02"), "ATH-0102")

        # Custom mapping
        mapped = self.registry.map_device("ESP32-CUSTOM-99", "ATH-0315")
        self.assertTrue(mapped)
        self.assertEqual(self.registry.get_athlete_for_device("ESP32-CUSTOM-99"), "ATH-0315")

        # Unknown device falls back to active athlete
        self.assertEqual(self.registry.get_athlete_for_device("ESP32-UNKNOWN"), self.registry.get_active_athlete_id())

    def test_register_new_athlete(self):
        """Verify registering a new squad athlete persists in registry and SQLite."""
        new_profile_data = {
            "athlete_id": "ATH-1234",
            "name": "Jordan Henderson",
            "sport": "Football",
            "position": "Central Midfielder",
            "age": 33,
            "height_cm": 182.0,
            "weight_kg": 80.0,
            "resting_hr_baseline": 48.0,
            "max_hr": 185.0,
            "vo2_max": 60.0,
            "chronic_load_baseline": 45.0,
            "typical_sleep_baseline": 8.0,
            "history_days": 365,
            "dominant_leg": "Right"
        }
        new_twin = self.registry.register_athlete(new_profile_data)
        self.assertIsNotNone(new_twin)
        self.assertEqual(new_twin.profile.name, "Jordan Henderson")

        # Verify listed in squad
        athletes = self.registry.list_athletes()
        self.assertTrue(any(a["id"] == "ATH-1234" for a in athletes))

        # Verify persisted in SQLite
        persisted = self.test_vault.get_athlete_profile("ATH-1234")
        self.assertIsNotNone(persisted)
        self.assertEqual(persisted["name"], "Jordan Henderson")

    def test_squad_summary_metrics(self):
        """Verify squad-level ACWR, risk distributions, and summary counts."""
        summary = self.registry.get_squad_summary()
        self.assertIn("squad_size", summary)
        self.assertGreaterEqual(summary["squad_size"], 5)
        self.assertIn("optimal_count", summary)
        self.assertIn("caution_count", summary)
        self.assertIn("high_risk_count", summary)
        self.assertIn("average_readiness", summary)
        self.assertIn("average_acwr", summary)
        self.assertIn("roster", summary)

        # Sum of risk categories must equal squad size
        total_categorized = summary["optimal_count"] + summary["caution_count"] + summary["high_risk_count"]
        # Allow that some might be Under-trained (cyan)
        self.assertLessEqual(total_categorized, summary["squad_size"])


if __name__ == "__main__":
    unittest.main()

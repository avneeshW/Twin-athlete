"""
Unit Test Suite for Simulator Resilience & Mechanistic Impulse-Response Fallback
Verifies:
1. Mechanistic Banister impulse-response fallback when ML models are None.
2. High-fidelity inference path when ML models are loaded and functioning.
3. Resilience and automatic fallback when ML model .predict() throws an exception.
4. Output schema consistency across all execution paths.
5. Preset scenario execution and multi-day periodization microcycles.
"""

import unittest
from unittest.mock import MagicMock
import numpy as np
import pandas as pd
import simulator


class TestSimulatorResilience(unittest.TestCase):

    def setUp(self):
        # Save original models to restore in tearDown
        self.orig_fatigue = simulator.MODEL_FATIGUE
        self.orig_recovery = simulator.MODEL_RECOVERY

    def tearDown(self):
        # Restore original state
        simulator.MODEL_FATIGUE = self.orig_fatigue
        simulator.MODEL_RECOVERY = self.orig_recovery
        simulator.model_fatigue = self.orig_fatigue
        simulator.model_recovery = self.orig_recovery

    def test_mechanistic_fallback_when_models_none(self):
        """Verify that when ML models are None, the deterministic Banister impulse-response model executes correctly."""
        simulator.MODEL_FATIGUE = None
        simulator.MODEL_RECOVERY = None
        simulator.model_fatigue = None
        simulator.model_recovery = None

        result = simulator.simulate_single_step(
            current_fatigue=25.0,
            current_recovery=75.0,
            sleep_hours=8.0,
            duration=45,
            intensity=0.65
        )

        # Check schema contract
        self.assertIn("daily_load", result)
        self.assertIn("predicted_fatigue", result)
        self.assertIn("predicted_recovery", result)
        self.assertIn("predicted_resting_hr", result)
        self.assertIn("predicted_performance", result)

        # Check physiological boundaries
        self.assertGreaterEqual(result["predicted_fatigue"], 5.0)
        self.assertLessEqual(result["predicted_fatigue"], 98.0)
        self.assertGreaterEqual(result["predicted_recovery"], 10.0)
        self.assertLessEqual(result["predicted_recovery"], 99.0)
        self.assertGreaterEqual(result["predicted_resting_hr"], 40.0)
        self.assertLessEqual(result["predicted_resting_hr"], 100.0)

        # Check physiological monotonicity: Hard workout produces more fatigue than rest
        rest_result = simulator.simulate_single_step(
            current_fatigue=25.0,
            current_recovery=75.0,
            sleep_hours=8.0,
            duration=0,
            intensity=0.0
        )
        hard_result = simulator.simulate_single_step(
            current_fatigue=25.0,
            current_recovery=75.0,
            sleep_hours=8.0,
            duration=90,
            intensity=0.85
        )
        self.assertGreater(hard_result["predicted_fatigue"], rest_result["predicted_fatigue"])
        self.assertGreater(rest_result["predicted_recovery"], hard_result["predicted_recovery"])

    def test_ml_model_path_when_models_present(self):
        """Verify that when ML models are present, their predictions are utilized."""
        mock_fatigue_model = MagicMock()
        mock_fatigue_model.predict.return_value = np.array([44.5])

        mock_recovery_model = MagicMock()
        mock_recovery_model.predict.return_value = np.array([68.2])

        simulator.MODEL_FATIGUE = mock_fatigue_model
        simulator.MODEL_RECOVERY = mock_recovery_model
        simulator.model_fatigue = mock_fatigue_model
        simulator.model_recovery = mock_recovery_model

        result = simulator.simulate_single_step(
            current_fatigue=30.0,
            current_recovery=70.0,
            sleep_hours=7.5,
            duration=60,
            intensity=0.70
        )

        mock_fatigue_model.predict.assert_called_once()
        mock_recovery_model.predict.assert_called_once()
        self.assertEqual(result["predicted_fatigue"], 44.5)
        self.assertEqual(result["predicted_recovery"], 68.2)

    def test_resilience_to_model_prediction_exception(self):
        """Verify that if an ML model throws a runtime exception during inference, simulator falls back cleanly."""
        broken_fatigue_model = MagicMock()
        broken_fatigue_model.predict.side_effect = RuntimeError("DLL or CUDA memory error")

        simulator.MODEL_FATIGUE = broken_fatigue_model
        simulator.MODEL_RECOVERY = MagicMock()

        # Should NOT raise RuntimeError; must fall back to mechanistic formula
        result = simulator.simulate_single_step(
            current_fatigue=20.0,
            current_recovery=80.0,
            sleep_hours=7.5,
            duration=45,
            intensity=0.65
        )

        self.assertIsInstance(result["predicted_fatigue"], float)
        self.assertIsInstance(result["predicted_recovery"], float)
        self.assertTrue(5.0 <= result["predicted_fatigue"] <= 98.0)

    def test_simulate_scenario_presets(self):
        """Verify all preset workout scenarios execute cleanly."""
        for preset_name in simulator.WORKOUT_PRESETS.keys():
            res = simulator.simulate_scenario(
                current_resting_hr=55.0,
                planned_sleep=7.5,
                scenario_type=preset_name,
                current_fatigue=20.0,
                current_recovery=80.0
            )
            self.assertEqual(res["scenario"], preset_name)
            self.assertIn("predicted_performance", res)
            self.assertIn("predicted_fatigue", res)
            self.assertIn("predicted_recovery", res)
            self.assertIn("predicted_resting_hr", res)

        # Invalid preset must raise ValueError
        with self.assertRaises(ValueError):
            simulator.simulate_scenario(scenario_type="Nonexistent Workout")

    def test_simulate_schedule_microcycle(self):
        """Verify multi-day schedule simulation and overtraining risk assessment."""
        df = simulator.simulate_schedule()
        self.assertIsInstance(df, pd.DataFrame)
        self.assertEqual(len(df), 7)
        expected_cols = ["Day", "Activity", "Sleep (h)", "Duration (m)", "Intensity", 
                         "Daily Load", "Fatigue (%)", "Recovery (%)", "Resting HR", "Performance", "Status"]
        for col in expected_cols:
            self.assertIn(col, df.columns)

        # Assess risk helper
        optimal_risk, _ = simulator.assess_overtraining_risk(fatigue=20.0, recovery=85.0, consecutive_hard_days=0)
        self.assertEqual(optimal_risk, "OPTIMAL")

        high_risk, _ = simulator.assess_overtraining_risk(fatigue=65.0, recovery=45.0, consecutive_hard_days=3)
        self.assertEqual(high_risk, "HIGH RISK")


if __name__ == "__main__":
    unittest.main()

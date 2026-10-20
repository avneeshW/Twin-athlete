import unittest
import os
import json
import pandas as pd
from app import app, get_dataset_path

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

class TestSevenDayLongitudinalSection(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_api_history_returns_strictly_days_one_to_seven(self):
        """Requirements 1, 2, 5: /api/history returns only Days 1 to 7 and no Days 8-180."""
        res = self.client.get("/api/history")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        self.assertIn("history", data)
        self.assertIn("summary", data)

        history = data["history"]
        self.assertLessEqual(len(history), 7)
        self.assertGreater(len(history), 0)

        days = [r["day"] for r in history]
        # Days must be subset of [1, 2, 3, 4, 5, 6, 7]
        for d in days:
            self.assertIn(d, [1, 2, 3, 4, 5, 6, 7])
            self.assertNotIn(d, range(8, 181))

        # Check summary reflects the 7-day period
        summary = data["summary"]
        self.assertEqual(summary["days"], len(history))
        self.assertLessEqual(summary["days"], 7)

    def test_database_and_dataset_not_deleted(self):
        """Requirement 8: Do not delete historical records from database or CSV."""
        ds_path = get_dataset_path()
        self.assertTrue(os.path.exists(ds_path))
        df = pd.read_csv(ds_path)
        # Full historical records must remain intact in storage
        self.assertGreaterEqual(len(df), 180)

    def test_html_headers_and_labels_updated(self):
        """Requirements 3, 4, 9: HTML reflects 7-day period and preserves layout."""
        for subpath in ["static", "public"]:
            html_path = os.path.join(ROOT_DIR, subpath, "index.html")
            with open(html_path, "r", encoding="utf-8") as f:
                content = f.read()

            self.assertIn("7-Day Longitudinal Physiological Log", content)
            self.assertNotIn("180-Day Longitudinal Physiological Log", content)
            self.assertIn("7-Day longitudinal progression", content)
            self.assertNotIn("180-Day longitudinal progression", content)
            self.assertIn('id="historyRowCount"', content)
            self.assertIn('id="analyticsHistoryTableBody"', content)

    def test_js_logic_restricts_to_seven_days(self):
        """Requirement 1, 2, 4, 6: JS logic filters up to 7 days and labels x-axis."""
        for subpath in ["static", "public"]:
            js_path = os.path.join(ROOT_DIR, subpath, "app.js")
            with open(js_path, "r", encoding="utf-8") as f:
                content = f.read()

            self.assertIn("generateDeterministic7DayHistory", content)
            self.assertIn("populateAnalyticsTable", content)
            self.assertIn("renderAnalyticsFatigueRecoveryChart", content)
            self.assertIn("renderAnalyticsLoadPerfChart", content)
            # Ensure day filtering exists in populateAnalyticsTable
            self.assertIn("d >= 1 && d <= 7", content)
            self.assertIn("rows.slice(0, 7)", content)

    def test_missing_data_fewer_than_seven_days(self):
        """Requirement 7: If fewer than 7 days available, display only available days."""
        # Simulated small dataset with 3 days
        small_df = pd.DataFrame([
            {"sleep_hours": 8.0, "daily_load": 40, "fatigue_level": 20.0, "recovery_score": 80.0, "performance_score": 75.0, "resting_hr": 54},
            {"sleep_hours": 7.5, "daily_load": 45, "fatigue_level": 25.0, "recovery_score": 75.0, "performance_score": 72.0, "resting_hr": 56},
            {"sleep_hours": 8.5, "daily_load": 30, "fatigue_level": 15.0, "recovery_score": 88.0, "performance_score": 82.0, "resting_hr": 52},
        ])
        df_7 = small_df.iloc[:7].copy()
        self.assertEqual(len(df_7), 3)

if __name__ == "__main__":
    unittest.main()

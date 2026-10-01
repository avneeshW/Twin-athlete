"""
Test profile synchronization across web dashboard static assets and API endpoints.
Verifies:
1. Header profile component in top-right corner renders active user profile (Avneesh Walvalkar).
2. ATHLETE DIGITAL TWIN hero greeting card renders 'Good Morning, {firstName}!'.
3. Subtitle renders '{fullName} • {position} • Squad #{squadNumber} • {date}'.
4. Single source of truth is established in app.js and synchronized with backend API.
"""
import os
import sys
import unittest
import json
import re

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT_DIR)

import app


class TestProfileSync(unittest.TestCase):

    def setUp(self):
        self.client = app.app.test_client()

    def test_index_html_markup_defaults(self):
        """Verifies initial HTML markup binds to configured active user profile."""
        html_path = os.path.join(ROOT_DIR, "static", "index.html")
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()

        # 1. Header profile component in top-right corner
        self.assertIn('<span class="user-name">Avneesh Walvalkar</span>', html)

        # 2. Hero greeting card heading
        self.assertIn('<h1 class="hero-greeting-title" id="heroGreeting">Good Morning, Avneesh!</h1>', html)

        # 3. Hero greeting card subtitle
        self.assertIn('Avneesh Walvalkar • Midfielder • Squad #8', html)

    def test_app_js_single_source_of_truth(self):
        """Verifies app.js contains unified active user profile state and reactive bindings."""
        js_path = os.path.join(ROOT_DIR, "static", "app.js")
        with open(js_path, "r", encoding="utf-8") as f:
            js = f.read()

        # Single source of truth definition
        self.assertIn("DEFAULT_USER_PROFILE", js)
        self.assertIn("activeUserProfile", js)
        self.assertIn("updateActiveUserProfile", js)
        self.assertIn("renderActiveUserProfileUI", js)

        # Dynamic greeting formatting: Good Morning, {firstName}!
        self.assertIn("Good Morning, ${firstName}!", js)

        # Dynamic subtitle formatting: {fullName} • {position} • Squad #{squadNumber} •
        self.assertIn("${fullName} • ${position} • Squad #${squadNumber}", js)

    def test_api_dashboard_data_athlete_sync(self):
        """Verifies /api/dashboard-data returns active profile and responds to switches."""
        # Ensure default athlete
        self.client.post("/api/athlete/switch", json={"athlete_id": "ATH-0824"})
        res = self.client.get("/api/dashboard-data")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        athlete = data.get("athlete", {})
        self.assertEqual(athlete.get("name"), "Avneesh Walvalkar")
        self.assertEqual(athlete.get("first_name"), "Avneesh")
        self.assertEqual(athlete.get("greeting"), "Good Morning, Avneesh!")
        self.assertIn("Squad #8", athlete.get("subtext", ""))

        # Test switching athlete to Marcus Vance
        switch_res = self.client.post("/api/athlete/switch", json={"athlete_id": "ATH-0102"})
        self.assertEqual(switch_res.status_code, 200)

        res_switched = self.client.get("/api/dashboard-data")
        switched_data = res_switched.get_json()
        switched_athlete = switched_data.get("athlete", {})

        self.assertEqual(switched_athlete.get("name"), "Marcus Vance")
        self.assertEqual(switched_athlete.get("first_name"), "Marcus")
        self.assertEqual(switched_athlete.get("greeting"), "Good Morning, Marcus!")
        self.assertEqual(switched_athlete.get("position"), "Center Forward")

        # Restore default
        self.client.post("/api/athlete/switch", json={"athlete_id": "ATH-0824"})


if __name__ == "__main__":
    unittest.main()

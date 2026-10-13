"""
Test suite validating:
1. Complete removal of the large horizontal athlete movement image under Current State.
2. Improved small athletic movement icon beside Current State with SYNC green styling.
3. Retention of all baseline metrics and established baseline info.
4. Dynamic local device time greeting for morning, afternoon, and evening across boundaries.
"""
import os
import unittest
import subprocess
import json

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class TestCurrentStateAndDynamicGreeting(unittest.TestCase):

    def setUp(self):
        with open(os.path.join(ROOT_DIR, "static", "index.html"), "r", encoding="utf-8") as f:
            self.static_html = f.read()
        with open(os.path.join(ROOT_DIR, "public", "index.html"), "r", encoding="utf-8") as f:
            self.public_html = f.read()

        with open(os.path.join(ROOT_DIR, "static", "style.css"), "r", encoding="utf-8") as f:
            self.static_css = f.read()
        with open(os.path.join(ROOT_DIR, "public", "style.css"), "r", encoding="utf-8") as f:
            self.public_css = f.read()

        with open(os.path.join(ROOT_DIR, "static", "app.js"), "r", encoding="utf-8") as f:
            self.static_js = f.read()
        with open(os.path.join(ROOT_DIR, "public", "app.js"), "r", encoding="utf-8") as f:
            self.public_js = f.read()

    def test_large_horizontal_image_removed(self):
        """Verify the large horizontal image and its wrapper container are completely removed."""
        for name, html in [("static", self.static_html), ("public", self.public_html)]:
            self.assertNotIn("current_state_prediction.png", html, f"{name}/index.html still references current_state_prediction.png")
            self.assertNotIn("whatif-current-state-img-wrap", html, f"{name}/index.html still contains whatif-current-state-img-wrap")

    def test_current_state_metrics_and_baseline_retained(self):
        """Verify all training metrics, calculations and baseline text are preserved under Current State."""
        required_metric_ids = [
            "baseIntensityBadge",
            "baseDurationText",
            "baseFatigueVal",
            "baseRecoveryVal",
            "baseReadinessVal",
        ]
        for name, html in [("static", self.static_html), ("public", self.public_html)]:
            self.assertIn("Current State", html)
            self.assertIn("Avneesh Walvalkar • Established Baseline", html)
            for mid in required_metric_ids:
                self.assertIn(f'id="{mid}"', html, f"Missing metric element: {mid} in {name}/index.html")

    def test_small_current_state_icon_improved_and_styled(self):
        """Verify the smaller Current State icon uses athletic movement icon and green accent."""
        for name, html in [("static", self.static_html), ("public", self.public_html)]:
            self.assertIn("whatif-icon-circle icon-athlete-green", html)
            # Ensure SVG runner path elements are present
            self.assertIn("<circle cx=\"13\" cy=\"4\"", html)
            self.assertIn("M15 21v-4l-4-3 1-6", html)

        for name, css in [("static", self.static_css), ("public", self.public_css)]:
            self.assertIn(".icon-athlete-green", css)
            self.assertIn("var(--whoop-green-bg)", css)
            self.assertIn("var(--whoop-green)", css)

    def test_dynamic_greeting_js_implementation_and_time_ranges(self):
        """Execute node test against app.js dynamic greeting logic verifying all time boundaries."""
        node_script = """
        const fs = require('fs');
        const path = require('path');
        const js = fs.readFileSync(path.join(process.cwd(), 'static', 'app.js'), 'utf8');

        // Extract functions
        const fnBlock = js.match(/function getTimeBasedGreetingPrefix[\\s\\S]*?function getDynamicGreeting[\\s\\S]*?\\n\\}/);
        if (!fnBlock) {
            console.error(JSON.stringify({ error: "functions not found" }));
            process.exit(1);
        }

        const activeUserProfile = { firstName: "Avneesh", name: "Avneesh Walvalkar" };
        function getFirstName(n) { return n.split(' ')[0]; }

        eval(fnBlock[0]);

        function testHour(h, m) {
            const d = new Date(2026, 9, 13, h, m, 0);
            return getTimeBasedGreetingPrefix(d);
        }

        const results = {
            morning_5am: testHour(5, 0),
            morning_8am: testHour(8, 30),
            morning_1159am: testHour(11, 59),
            afternoon_12pm: testHour(12, 0),
            afternoon_2pm: testHour(14, 15),
            afternoon_459pm: testHour(16, 59),
            evening_5pm: testHour(17, 0),
            evening_10pm: testHour(22, 0),
            evening_midnight: testHour(0, 0),
            evening_3am: testHour(3, 30),
            evening_459am: testHour(4, 59),
            greeting_avneesh: getDynamicGreeting("Avneesh", new Date(2026, 9, 13, 8, 0, 0)),
            greeting_marcus: getDynamicGreeting("Marcus", new Date(2026, 9, 13, 14, 0, 0)),
            greeting_evening: getDynamicGreeting("Avneesh", new Date(2026, 9, 13, 20, 0, 0))
        };
        console.log(JSON.stringify(results));
        """
        proc = subprocess.run(
            ["node", "-e", node_script],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
            check=True
        )
        res = json.loads(proc.stdout)

        # 5:00 AM to 11:59 AM: Good morning
        self.assertEqual(res["morning_5am"], "Good morning")
        self.assertEqual(res["morning_8am"], "Good morning")
        self.assertEqual(res["morning_1159am"], "Good morning")

        # 12:00 PM to 4:59 PM: Good afternoon
        self.assertEqual(res["afternoon_12pm"], "Good afternoon")
        self.assertEqual(res["afternoon_2pm"], "Good afternoon")
        self.assertEqual(res["afternoon_459pm"], "Good afternoon")

        # 5:00 PM to 4:59 AM: Good evening (including midnight)
        self.assertEqual(res["evening_5pm"], "Good evening")
        self.assertEqual(res["evening_10pm"], "Good evening")
        self.assertEqual(res["evening_midnight"], "Good evening")
        self.assertEqual(res["evening_3am"], "Good evening")
        self.assertEqual(res["evening_459am"], "Good evening")

        # User names
        self.assertEqual(res["greeting_avneesh"], "Good morning, Avneesh")
        self.assertEqual(res["greeting_marcus"], "Good afternoon, Marcus")
        self.assertEqual(res["greeting_evening"], "Good evening, Avneesh")


if __name__ == "__main__":
    unittest.main()

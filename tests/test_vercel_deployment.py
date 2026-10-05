"""
Unit tests verifying Vercel deployment configuration, serverless entrypoint,
and static asset routing.
"""
import os
import json
import unittest

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class TestVercelDeployment(unittest.TestCase):

    def test_vercel_json_exists_and_valid(self):
        v_path = os.path.join(ROOT_DIR, "vercel.json")
        self.assertTrue(os.path.exists(v_path), "vercel.json must exist at project root")
        with open(v_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertIn("rewrites", data)
        sources = [r["source"] for r in data["rewrites"]]
        self.assertTrue(any("/api" in s for s in sources), "Rewrites must include /api handler")

    def test_vercelignore_exists(self):
        vi_path = os.path.join(ROOT_DIR, ".vercelignore")
        self.assertTrue(os.path.exists(vi_path), ".vercelignore must exist")
        with open(vi_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("hist_edge.db", content)

    def test_public_static_assets_exist(self):
        public_dir = os.path.join(ROOT_DIR, "public")
        self.assertTrue(os.path.isdir(public_dir), "public/ directory must exist for Vercel CDN")
        self.assertTrue(os.path.exists(os.path.join(public_dir, "index.html")))
        self.assertTrue(os.path.exists(os.path.join(public_dir, "style.css")))
        self.assertTrue(os.path.exists(os.path.join(public_dir, "app.js")))
        self.assertTrue(os.path.isdir(os.path.join(public_dir, "images")))
        self.assertTrue(os.path.isdir(os.path.join(public_dir, "videos")))

    def test_serverless_api_entrypoint(self):
        import api.index as serverless_module
        self.assertTrue(hasattr(serverless_module, "app"), "api/index.py must expose 'app'")
        client = serverless_module.app.test_client()

        res = client.get("/api/dashboard-data")
        self.assertEqual(res.status_code, 200)
        json_data = res.get_json()
        self.assertIn("athlete", json_data)
        self.assertIn("vitals", json_data)

    def test_storage_vault_serverless_resilience(self):
        os.environ["VERCEL"] = "1"
        from twin.storage import StorageVault
        vault = StorageVault()
        self.assertIsNotNone(vault)
        # Verify athlete profile retrieval
        profile = vault.get_athlete_profile("ATH-0824")
        self.assertIsNotNone(profile)
        self.assertEqual(profile.get("athlete_id"), "ATH-0824")


if __name__ == "__main__":
    unittest.main()

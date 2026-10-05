"""
Unit tests verifying Vercel deployment configuration, serverless entrypoint,
and static asset routing.
"""
import os
import json
import unittest

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class TestVercelDeployment(unittest.TestCase):

    def test_pyproject_toml_exists_and_valid(self):
        p_path = os.path.join(ROOT_DIR, "pyproject.toml")
        self.assertTrue(os.path.exists(p_path), "pyproject.toml must exist at project root")
        with open(p_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("requires-python = \">=3.12\"", content)

    def test_vercel_json_exists_and_valid(self):
        vj_path = os.path.join(ROOT_DIR, "vercel.json")
        self.assertTrue(os.path.exists(vj_path), "vercel.json must exist at project root")
        with open(vj_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertIn("rewrites", data)
        destinations = [r.get("destination") for r in data["rewrites"]]
        self.assertTrue(any("api/index.py" in d for d in destinations))

    def test_api_entrypoint_exists_and_exports_app(self):
        entry_path = os.path.join(ROOT_DIR, "api", "index.py")
        self.assertTrue(os.path.exists(entry_path), "api/index.py must exist")
        from api.index import app as entry_app
        self.assertIsNotNone(entry_app)

    def test_vercelignore_exists(self):
        vi_path = os.path.join(ROOT_DIR, ".vercelignore")
        self.assertTrue(os.path.exists(vi_path), ".vercelignore must exist")
        with open(vi_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("hist_edge.db", content)

    def test_python_version_pinned(self):
        pv_path = os.path.join(ROOT_DIR, ".python-version")
        self.assertTrue(os.path.exists(pv_path), ".python-version must exist")
        with open(pv_path, "r", encoding="utf-8") as f:
            content = f.read().strip()
        self.assertEqual(content, "3.12")

    def test_public_static_assets_exist(self):
        public_dir = os.path.join(ROOT_DIR, "public")
        self.assertTrue(os.path.isdir(public_dir), "public/ directory must exist for Vercel CDN")
        self.assertTrue(os.path.exists(os.path.join(public_dir, "index.html")))
        self.assertTrue(os.path.exists(os.path.join(public_dir, "style.css")))
        self.assertTrue(os.path.exists(os.path.join(public_dir, "app.js")))
        self.assertTrue(os.path.isdir(os.path.join(public_dir, "images")))
        self.assertTrue(os.path.isdir(os.path.join(public_dir, "videos")))

    def test_flask_app_api_endpoints(self):
        from app import app
        client = app.test_client()

        res = client.get("/api/dashboard-data")
        self.assertEqual(res.status_code, 200)
        json_data = res.get_json()
        self.assertIn("athlete", json_data)
        self.assertIn("vitals", json_data)

        # Test alias route
        res_alias = client.get("/dashboard-data")
        self.assertEqual(res_alias.status_code, 200)

        # Test API root
        res_root = client.get("/api")
        self.assertEqual(res_root.status_code, 200)
        self.assertEqual(res_root.get_json().get("status"), "online")

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

import os
import sys
import traceback
from flask import Flask, jsonify, request

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

os.environ["VERCEL"] = "1"

app = Flask(__name__)


@app.route("/api/health")
@app.route("/api/test-imports")
def diagnostic():
    results = {}
    modules = [
        "numpy",
        "joblib",
        "twin.compat",
        "twin.contracts",
        "twin.simulator",
        "twin.storage",
        "twin.coach",
        "twin.telemetry",
        "twin.registry",
        "ml.generate_data",
        "app"
    ]
    for mod in modules:
        try:
            __import__(mod)
            results[mod] = "OK"
        except Exception as e:
            results[mod] = f"ERROR: {e} | {traceback.format_exc()}"

    return jsonify({
        "status": "online",
        "service": "Digital Twin Athlete Diagnostics",
        "python_version": sys.version,
        "cwd": os.getcwd(),
        "root_dir": ROOT_DIR,
        "files_in_root": os.listdir(ROOT_DIR) if os.path.exists(ROOT_DIR) else [],
        "modules": results
    }), 200


# Try to load production app
_prod_app = None
_prod_err = None
try:
    import app as prod_module
    _prod_app = prod_module.app
except Exception as e:
    _prod_err = f"{e}\n{traceback.format_exc()}"


@app.route("/api", defaults={"subpath": ""}, methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
@app.route("/api/<path:subpath>", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
def proxy_to_prod(subpath=""):
    if subpath in ("health", "test-imports"):
        return diagnostic()

    if _prod_app is None:
        return jsonify({
            "success": False,
            "error": "Production app failed to import during cold start",
            "traceback": _prod_err
        }), 500

    # Dispatch request into production Flask app
    with _prod_app.test_request_context(
        path="/api/" + subpath if subpath else "/api",
        base_url=request.base_url,
        query_string=request.query_string,
        method=request.method,
        headers=dict(request.headers),
        data=request.get_data()
    ):
        try:
            return _prod_app.full_dispatch_request()
        except Exception as e:
            return jsonify({
                "success": False,
                "error": f"Dispatch error: {e}",
                "traceback": traceback.format_exc()
            }), 500

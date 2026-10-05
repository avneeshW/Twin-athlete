import os
import sys
import traceback

# Ensure the repository root directory is in sys.path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

# Flag serverless runtime
os.environ["VERCEL"] = "1"

try:
    from app import app
except Exception as e:
    err_trace = traceback.format_exc()
    from flask import Flask, jsonify
    app = Flask(__name__)

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
    def vercel_import_error_handler(path=""):
        return jsonify({
            "success": False,
            "error": "Digital Twin Vercel Import Error",
            "message": str(e),
            "traceback": err_trace
        }), 500

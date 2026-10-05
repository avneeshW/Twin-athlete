import os
import sys
import urllib.parse
import traceback

# Ensure repository root is on sys.path so app, twin, and ml can be imported
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

# Mark serverless environment
os.environ["VERCEL"] = "1"

try:
    from app import app as flask_app
except Exception:
    err_trace = traceback.format_exc()
    from flask import Flask, jsonify
    flask_app = Flask(__name__)

    @flask_app.route("/", defaults={"path": ""})
    @flask_app.route("/<path:path>", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
    def vercel_init_error_handler(path):
        return jsonify({
            "success": False,
            "error": "Digital Twin Vercel Initialization Error",
            "traceback": err_trace
        }), 500


class VercelWSGIWrapper:
    """WSGI middleware ensuring PATH_INFO correctly preserves /api/ route on Vercel."""

    def __init__(self, application):
        self.application = application

    def __getattr__(self, name):
        return getattr(self.application, name)

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "")
        if path == "/api" or path == "/api/":
            qs = environ.get("QUERY_STRING", "")
            if "__path=" in qs:
                params = urllib.parse.parse_qs(qs)
                sub = params.get("__path", [""])[0]
                if sub:
                    environ["PATH_INFO"] = "/api/" + sub.lstrip("/")
        return self.application(environ, start_response)


# Vercel entrypoint callable
app = VercelWSGIWrapper(flask_app)

import os
import sys
import urllib.parse
import traceback

# Ensure the repository root directory is in sys.path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

# Flag serverless runtime
os.environ["VERCEL"] = "1"

try:
    from app import app

    class VercelPathNormalizer:
        """WSGI middleware ensuring PATH_INFO correctly routes to Flask endpoints under Vercel rewrites."""

        def __init__(self, wsgi_app):
            self.wsgi_app = wsgi_app

        def __call__(self, environ, start_response):
            qs = environ.get("QUERY_STRING", "")
            if "__endpoint=" in qs:
                params = urllib.parse.parse_qs(qs)
                endpoint = params.pop("__endpoint", [""])[0]
                if endpoint:
                    environ["PATH_INFO"] = "/api/" + endpoint.lstrip("/")
                    new_qs = urllib.parse.urlencode([(k, v) for k, vs in params.items() for v in vs])
                    environ["QUERY_STRING"] = new_qs
            return self.wsgi_app(environ, start_response)

    app.wsgi_app = VercelPathNormalizer(app.wsgi_app)

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

from http.server import BaseHTTPRequestHandler
import sys
import json
import os
import traceback

# Ensure repository root is on sys.path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

os.environ["VERCEL"] = "1"


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.end_headers()

        diag = {
            "status": "ok",
            "python_version": sys.version,
            "cwd": os.getcwd(),
            "root_dir": ROOT_DIR,
            "sys_path": sys.path,
            "files_in_cwd": os.listdir(".") if os.path.exists(".") else [],
            "files_in_root": os.listdir(ROOT_DIR) if os.path.exists(ROOT_DIR) else [],
            "files_in_tmp": os.listdir("/tmp") if os.path.exists("/tmp") else [],
            "environ_keys": list(os.environ.keys()),
        }

        try:
            import app
            diag["app_import"] = "SUCCESS"
            diag["app_routes"] = [str(rule) for rule in app.app.url_map.iter_rules()]
        except Exception as e:
            diag["app_import"] = "FAILED"
            diag["app_error"] = str(e)
            diag["app_traceback"] = traceback.format_exc()

        self.wfile.write(json.dumps(diag, indent=2).encode())

from http.server import BaseHTTPRequestHandler
import sys
import json
import os

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        info = {
            "status": "ok",
            "python_version": sys.version,
            "cwd": os.getcwd(),
            "files": os.listdir(".") if os.path.exists(".") else [],
            "sys_path": sys.path
        }
        self.wfile.write(json.dumps(info, indent=2).encode())

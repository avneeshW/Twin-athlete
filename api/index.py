from flask import Flask, jsonify
import sys
import os

app = Flask(__name__)

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
def hello(path):
    return jsonify({
        "status": "ok",
        "path": path,
        "python_version": sys.version,
        "cwd": os.getcwd()
    })

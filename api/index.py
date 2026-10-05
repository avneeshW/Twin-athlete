from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def catch_all(path=""):
    return jsonify({
        "status": "ok",
        "message": "Vercel Python Serverless Function is ALIVE!",
        "path": path
    }), 200

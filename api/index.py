import os
import sys

# Ensure repository root is on sys.path so app, twin, and ml can be imported
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

# Mark serverless environment
os.environ["VERCEL"] = "1"

# Export Flask application instance for Vercel Serverless Function runtime
from app import app

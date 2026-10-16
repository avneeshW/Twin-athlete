"""
DIGITAL TWIN ATHLETE - CONFIGURATION & ENVIRONMENT MANAGEMENT
Handles runtime database path (TWIN_DB_PATH), API key authentication settings (TWIN_API_KEYS),
and runtime deployment flags.
"""

import os
import json
from typing import Dict, Optional

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_RUNTIME_DB = os.path.join(BASE_DIR, "data", "twin_runtime.db")
SEED_DB_FILE = os.path.join(BASE_DIR, "twin_athlete.db")


def get_runtime_db_path() -> str:
    """Returns the resolved runtime database path."""
    raw = os.environ.get("TWIN_DB_PATH") or os.environ.get("TWIN_DB_FILE") or DEFAULT_RUNTIME_DB
    if raw == ":memory:" or str(raw).startswith("file:"):
        return raw
    if not os.path.isabs(raw):
        return os.path.abspath(os.path.join(BASE_DIR, raw))
    return raw


def parse_api_keys(env_val: Optional[str] = None) -> Dict[str, str]:
    """
    Parses TWIN_API_KEYS environment variable.
    Supported formats:
    - Comma-separated pairs: "device1:key1,device2:key2"
    - JSON dictionary: '{"device1": "key1", "device2": "key2"}'
    Returns dict mapping device_id -> api_key.
    """
    raw = env_val if env_val is not None else os.environ.get("TWIN_API_KEYS", "")
    if not raw or not raw.strip():
        return {}
    raw = raw.strip()
    if raw.startswith("{") and raw.endswith("}"):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return {str(k).strip(): str(v).strip() for k, v in parsed.items()}
        except Exception:
            pass

    mapping = {}
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        if ":" in item:
            parts = item.split(":", 1)
            mapping[parts[0].strip()] = parts[1].strip()
        else:
            mapping[item] = item
    return mapping


def get_configured_api_keys() -> Dict[str, str]:
    """Returns the parsed mapping of configured API keys {device_id: key}."""
    return parse_api_keys()

"""
Root-level backward compatibility shim for telemetry_engine.
Safely re-exports from twin.telemetry.
"""
try:
    from twin.telemetry import *
    from twin.telemetry import TelemetryEngine, engine
except Exception as e:
    print(f"[telemetry_engine shim] Notice: twin.telemetry import error: {e}")
    TelemetryEngine = None
    engine = None

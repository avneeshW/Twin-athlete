"""
Root-level backward compatibility shim for registry_engine.
Safely re-exports from twin.registry.
"""
try:
    from twin.registry import *
    from twin.registry import AthleteRegistry, DigitalTwin, registry
except Exception as e:
    print(f"[registry_engine shim] Notice: twin.registry import error: {e}")
    AthleteRegistry = None
    DigitalTwin = None
    registry = None

"""
Root-level backward compatibility shim for twin_contracts.
Safely re-exports from twin.contracts.
"""
try:
    from twin.contracts import *
except Exception as e:
    print(f"[twin_contracts shim] Notice: twin.contracts import error: {e}")

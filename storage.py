"""
Root-level backward compatibility shim for storage.
Safely re-exports from twin.storage.
"""
try:
    from twin.storage import *
    from twin.storage import StorageVault, vault
except Exception as e:
    print(f"[storage shim] Notice: twin.storage import error: {e}")
    StorageVault = None
    vault = None

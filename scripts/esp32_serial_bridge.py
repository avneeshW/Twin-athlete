#!/usr/bin/env python3
"""
DIGITAL TWIN ATHLETE - ESP32 USB SERIAL BRIDGE
Entrypoint script forwarding serial telemetry packets over USB UART to the backend.
Supports TWIN_API_KEY environment variable.
"""

import sys
import os

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from twin.bridge import main

if __name__ == "__main__":
    main()

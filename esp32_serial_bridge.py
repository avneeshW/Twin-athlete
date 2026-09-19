"""
ESP32 USB Serial Telemetry Bridge
Forwards incoming JSON serial packets from an ESP32 connected via USB cable
directly to the Digital Twin Athlete local server.
"""

import sys
import json
import time

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    print("\n[!] 'pyserial' is not installed. To use the USB Serial bridge, run:")
    print("    pip install pyserial\n")
    sys.exit(1)

try:
    import urllib.request
except ImportError:
    pass

DEFAULT_SERVER = "http://127.0.0.1:5000/api/esp32/telemetry"
BAUD_RATE = 115200


def find_esp32_port():
    """Scans and auto-selects available USB serial COM port."""
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        return None

    print(f"Detected {len(ports)} serial device(s):")
    for p in ports:
        print(f"  - {p.device}: {p.description} (HWID: {p.hwid})")

    # Look for common ESP32 USB-to-UART bridge chips (CP210x, CH340, FTDI, Silicon Labs)
    for p in ports:
        desc = p.description.lower()
        if any(keyword in desc for keyword in ["cp210", "ch340", "ch341", "ftdi", "usb serial", "uart", "esp32"]):
            return p.device

    # Fallback to the first available port
    return ports[0].device


def main():
    print("=" * 60)
    print(" DIGITAL TWIN ATHLETE: ESP32 USB SERIAL BRIDGE")
    print("=" * 60)

    port = find_esp32_port()
    if not port:
        print("\n[!] No serial ports detected! Please connect your ESP32 via USB.")
        sys.exit(1)

    print(f"\n[+] Opening port {port} at {BAUD_RATE} baud...")

    try:
        ser = serial.Serial(port, BAUD_RATE, timeout=2.0)
        time.sleep(1.5)  # Allow ESP32 reboot upon DTR toggle
        print(f"[+] Connected to {port}! Forwarding packets to {DEFAULT_SERVER}")
        print("[+] Press Ctrl+C to stop.\n")
    except Exception as e:
        print(f"\n[!] Failed to open port {port}: {e}")
        sys.exit(1)

    packet_num = 0

    while True:
        try:
            raw_line = ser.readline().decode("utf-8", errors="ignore").strip()
            if not raw_line:
                continue

            # Check if line is a valid JSON telemetry payload
            if raw_line.startswith("{") and raw_line.endswith("}"):
                try:
                    payload = json.loads(raw_line)
                    req = urllib.request.Request(
                        DEFAULT_SERVER,
                        data=json.dumps(payload).encode("utf-8"),
                        headers={"Content-Type": "application/json"}
                    )
                    with urllib.request.urlopen(req, timeout=2.0) as resp:
                        packet_num += 1
                        hr = payload.get("heart_rate", "N/A")
                        spo2 = payload.get("spo2", "N/A")
                        print(f"[{packet_num:04d}] Forwarded -> HR: {hr} BPM | SpO2: {spo2}% | Accel: ({payload.get('ax')}, {payload.get('ay')}, {payload.get('az')})")
                except Exception as post_err:
                    print(f"[-] Server error: {post_err}")
            else:
                # Debug output from ESP32
                print(f"[ESP32 Log] {raw_line}")

        except KeyboardInterrupt:
            print("\n[!] Serial bridge stopped by user.")
            break
        except Exception as err:
            print(f"[!] Read error: {err}")
            time.sleep(1)

    ser.close()


if __name__ == "__main__":
    main()

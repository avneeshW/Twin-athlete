# ESP32 Athlete Tracker: Wiring & Setup Guide

This guide explains how to connect sensors to your ESP32 board, flash the firmware, and stream real-time biometrics to the **Digital Twin Athlete** cockpit.

---

## 1. Hardware Required

1. **ESP32 Development Board** (ESP32 DevKit v1, NodeMCU-32S, ESP32-WROOM-32, etc.)
2. **MAX30102** Pulse Oximeter & Heart Rate Sensor Module
3. **MPU6050** 6-Axis Accelerometer & Gyroscope Module
4. Jumper Wires & Breadboard
5. Micro-USB or USB-C Cable

---

## 2. Wiring Diagram (I2C Shared Bus)

Both the **MAX30102** and **MPU6050** sensors communicate over the shared I2C bus on the ESP32.

| ESP32 Pin | MAX30102 Pin | MPU6050 Pin | Notes |
| :--- | :--- | :--- | :--- |
| **3.3V** | VCC / VIN | VCC | Power (Do **not** use 5V to protect I2C levels) |
| **GND** | GND | GND | Common Ground |
| **GPIO 21** | SDA | SDA | Shared I2C Data Line |
| **GPIO 22** | SCL | SCL | Shared I2C Clock Line |

> [!TIP]
> **No sensors attached yet?**
> You can flash the firmware immediately! The firmware automatically detects whether sensors are present. If they are not found, it runs a realistic sports biomechanics simulation so you can verify Wi-Fi communication and dashboard reception right away.

---

## 3. Flashing with Arduino IDE

1. **Install Arduino IDE**: Download from [arduino.cc](https://www.arduino.cc/en/software).
2. **Add ESP32 Board Support**:
   - In Arduino IDE, go to **File > Preferences**.
   - In *Additional Boards Manager URLs*, add:
     ```text
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Go to **Tools > Board > Boards Manager**, search for `esp32` by Espressif Systems, and click **Install**.
3. **Open the Sketch**:
   - Open `firmware/esp32_athlete_tracker/esp32_athlete_tracker.ino`.
4. **Configure Wi-Fi & PC Server Address**:
   - In lines 30–33 of `esp32_athlete_tracker.ino`, update:
     ```cpp
     const char* WIFI_SSID     = "YOUR_WIFI_NAME";
     const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
     const char* SERVER_URL    = "http://192.168.1.XX:5000/api/esp32/telemetry";
     ```
   - *How to find your PC's IP address on Windows:*
     Open Command Prompt/PowerShell and run `ipconfig`. Look for **IPv4 Address** (e.g. `192.168.1.150` or `192.168.29.X`).
5. **Select Board & Port**:
   - **Tools > Board > ESP32 Arduino > ESP32 Dev Module**
   - **Tools > Port > Select your ESP32 COM Port** (e.g., `COM3`, `COM4`, etc.)
6. **Upload**:
   - Click the **Upload** arrow (→).
   - Once uploaded, open **Tools > Serial Monitor** at **115200 baud** to see connection logs and transmitted JSON packets.

---

## 4. Alternative: Streaming via USB Serial Cable

If you are away from Wi-Fi or testing at your desk, you can stream telemetry directly over the USB cable using the included Python bridge:

```bash
python esp32_serial_bridge.py
```

This utility automatically connects to your ESP32 COM port and forwards every JSON packet directly to `http://localhost:5000/api/esp32/telemetry`.

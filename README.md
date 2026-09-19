# 🏃 Twin-Athlete: Digital Twin Biometric & Performance Cockpit

An end-to-end IoT, Machine Learning, and Real-Time Digital Twin platform for athletes. It pairs physical wearable telemetry (ESP32 with MAX30102 & MPU6050) with predictive machine learning models to simulate, monitor, and optimize athletic performance, fatigue levels, and recovery dynamics in real time.

---

## 🌟 Key Features

- **⚡ Real-Time IoT Telemetry Stream**: Collects tri-axial acceleration, cadence, heart rate, and SpO2 from an ESP32 hardware tracker via HTTP/SSE or serial bridge.
- **🧠 Predictive Digital Twin Models**: Machine learning models (`twin_fatigue_model.pkl` and `twin_recovery_model.pkl`) predicting fatigue accumulation, recovery trajectory, and cardiac drift.
- **📊 Modern Web Cockpit**: High-performance dashboard featuring real-time biometric gauges, cadence & impact dynamics, cardiovascular strain curves, and fatigue forecasts.
- **🔄 Synthetic Simulation Engine**: Built-in realistic runner telemetry generator for offline testing, calibration, and demonstrations without hardware attached.
- **🔌 Hardware Firmware Included**: ESP32 C++ Arduino firmware (`firmware/esp32_athlete_tracker/`) with fallback sensor simulation mode and I2C wiring schematics.
- **🐳 Deployment Ready**: Includes `Dockerfile` and `Procfile` for containerized hosting or cloud platforms.

---

## 📁 Repository Structure

```text
├── app.py                     # Flask web server, SSE real-time streaming, and REST API
├── telemetry_engine.py        # Real-time biometric processing & feature extraction
├── simulator.py               # Biomechanical simulation & model evaluation
├── generate_data.py           # Synthetic athlete dataset generator
├── train_digital_twin.py      # ML pipeline for training fatigue and recovery models
├── esp32_serial_bridge.py     # USB-Serial bridge for wired ESP32 telemetry
├── verify_live_system.py      # End-to-end integration test & sanity checker
├── test_e2e_api.py            # API endpoint integration test suite
├── test_telemetry.py          # Unit tests for telemetry calculations
├── synthetic_athlete_dataset.csv # Training dataset
├── twin_fatigue_model.pkl     # Trained Random Forest / Gradient Boosting fatigue model
├── twin_recovery_model.pkl    # Trained recovery trajectory model
├── twin_features.json         # Feature specification schema
├── firmware/
│   ├── WIRING_GUIDE.md        # Hardware setup & pinout documentation
│   └── esp32_athlete_tracker/ # ESP32 Arduino C++ firmware
├── static/
│   ├── index.html             # Dashboard UI
│   ├── style.css              # Custom styling & dark cockpit theme
│   ├── app.js                 # Frontend telemetry state & visualizer logic
│   └── images/                # Visual assets and athlete avatars
├── Dockerfile                 # Docker container specification
├── Procfile                   # Cloud platform process file
└── requirements.txt           # Python dependencies
```

---

## 🚀 Quick Start

### 1. Prerequisites

- Python 3.9+ installed
- (Optional) ESP32 development board with MAX30102 and MPU6050 sensors

### 2. Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/avneeshW/Twin-athlete.git
cd Twin-athlete
pip install -r requirements.txt
```

### 3. Run the Dashboard

Launch the Flask application:

```bash
python app.py
```

Open your browser and navigate to:
```text
http://localhost:5000
```

### 4. Running the Built-in Simulation Feed

If you do not have physical ESP32 hardware connected, you can start the built-in mock telemetry feed directly from the web interface or via the API:

```bash
curl -X POST http://localhost:5000/api/mock/start
```

---

## 📡 Hardware & Firmware Setup

See [`firmware/WIRING_GUIDE.md`](firmware/WIRING_GUIDE.md) for detailed schematics and instructions.

### Sensor Connections (Shared I2C):
| ESP32 Pin | MAX30102 Pin | MPU6050 Pin | Description |
| :--- | :--- | :--- | :--- |
| **3.3V** | VCC / VIN | VCC | Power (3.3V) |
| **GND** | GND | GND | Ground |
| **GPIO 21** | SDA | SDA | I2C Data Line |
| **GPIO 22** | SCL | SCL | I2C Clock Line |

Flash the sketch located at `firmware/esp32_athlete_tracker/esp32_athlete_tracker.ino` using the Arduino IDE.

---

## 🧪 Testing & Validation

Run the test suites to ensure all endpoints and mathematical calculations are sound:

```bash
python test_telemetry.py
python test_e2e_api.py
python verify_live_system.py
```

---

## 📜 License

MIT License. Feel free to use, modify, and distribute.

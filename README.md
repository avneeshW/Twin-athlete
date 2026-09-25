# 🏃 Twin-Athlete: Production-Grade Digital Twin Sports Performance Platform

[![Test Suite](https://img.shields.io/badge/Tests-30%2F30%20Passing-brightgreen.svg)](#-test-suite--forensic-verification)
[![ML Verification](https://img.shields.io/badge/ML%20Models-v2.4%20Verified%20(Holdout%20R%C2%B2%3E0.90)-blue.svg)](#-verifiable-ml-models--model-card)
[![Data Contract](https://img.shields.io/badge/Data%20Contracts-v2.4%20Strict%20Enforcement-purple.svg)](#-data-contracts--runtime-validation)
[![License](https://img.shields.io/badge/License-MIT-gray.svg)](LICENSE)

> **IMPORTANT MEDICAL & REGULATORY DISCLAIMER:**
> Twin-Athlete is a prototype sports-science decision-support and workload optimization system. It is **NOT** a medical diagnostic device, does **NOT** provide clinical diagnoses, and does **NOT** replace a licensed physician, certified physiotherapist, or sports medicine specialist. All injury signals are experimental decision-support indicators.

---

## 🧭 Executive Summary & Core Mission

Twin-Athlete converts physiological telemetry into a stateful, time-aware computational representation of an individual athlete—a true **Digital Twin**. Rather than presenting static historical charts or generic AI summaries, the platform closes the end-to-end feedback loop:

```
REAL / DETERMINISTIC TELEMETRY
           │
           ▼
 STRICT DATA CONTRACT VALIDATION (twin/contracts.py)
           │
           ▼
 REAL-TIME SIGNAL PIPELINE & QUALITY ENGINE (twin/telemetry.py)
   • Jitter, Latency, Drop Rate, Optical Baseline Extraction
           │
           ▼
 STATEFUL ATHLETE TWIN (twin/coach.py)
   • Personalized Baselines (Cold-Start, Calibrating, Calibrated)
   • Banister TRIMP, ACWR Workload, Fatigue Kinetics
           │
           ▼
 DUAL ENSEMBLE ML FORECASTING (Random Forest Regressors)
   • Fatigue Level & Recovery Trajectory with ±4.3 pt Uncertainty
           │
           ▼
 WHAT-IF SCENARIO ENGINE & MICROCYCLE SIMULATOR
   • Side-by-side comparative simulation across training loads
           │
           ▼
 CLOSED-LOOP PREDICTION-VS-ACTUAL FEEDBACK LEDGER
   • Prospective predictions verified against post-session outcomes
   • Continuous residual error tracking (Overall MAE = 1.38 pts)
           │
           ▼
 MULTI-ROLE COCKPIT INTERFACE
   • Athlete Personal Dashboard
   • Coach Squad Matrix & Roster ACWR Screening
   • Sports Scientist & Forensic Auditor Governance Center
```

---

## 🛡️ Honesty & Anti-Hallucination Contract

Every feature, metric, and prediction in Twin-Athlete declares its explicit **provenance state**:

| Status | Definition | Platform Behavior |
| :--- | :--- | :--- |
| **`LIVE`** | Real physical hardware stream actively connected and validated. | Green telemetry indicators, real packet counters, and sensor health metrics. |
| **`DEMO`** | Deterministic synthetic feed seeded from empirical athlete distributions. | Explicitly badged as `DEMO (SIMULATED)` in UI, headers, and API outputs. |
| **`EXPERIMENTAL`** | Algorithmic signal derived from biomechanical heuristics. | Framed as risk indicators or proxies with visible limitations and confidence bounds. |
| **`PLANNED`** | Future capability documented in architecture roadmap. | Never presented as functional code; explicitly quarantined in documentation. |

---

## 🔬 Scientific Foundations & Mathematical Formulas

### 1. Cardiovascular Training Impulse (TRIMP)
* **Banister TRIMP Formula**:
  $$\text{TRIMP} = D \times \Delta\text{HR} \times 0.64 \times e^{1.92 \times \Delta\text{HR}}$$
  Where $D$ is session duration in minutes, and fractional heart rate reserve is:
  $$\Delta\text{HR} = \frac{\text{HR}_{\text{session}} - \text{HR}_{\text{rest}}}{\text{HR}_{\text{max}} - \text{HR}_{\text{rest}}}$$

* **Edwards 5-Zone Cumulative TRIMP**:
  $$\text{TRIMP}_{\text{Edwards}} = 1(t_{50\text{--}60\%}) + 2(t_{60\text{--}70\%}) + 3(t_{70\text{--}80\%}) + 4(t_{80\text{--}90\%}) + 5(t_{90\text{--}100\%})$$

### 2. Acute-to-Chronic Workload Ratio (ACWR)
* **Acute Workload (7-Day Rolling Mean TRIMP)**: Fatigue proxy.
* **Chronic Workload (28-Day Rolling Mean TRIMP)**: Fitness proxy.
$$\text{ACWR} = \frac{\text{Workload}_{\text{acute}}}{\text{Workload}_{\text{chronic}}}$$
* **Workload Safety Windows**:
  * $< 0.8$: Under-training / Deconditioning hazard
  * $0.8 - 1.3$: Optimal "Sweet Spot" (High performance, lowest relative risk)
  * $1.3 - 1.5$: Overreaching / Warning zone
  * $> 1.5$: Injury risk spike / High vulnerability

### 3. Caloric Energy Expenditure (Keytel Equation)
$$\text{EE} = \left[ -55.0969 + (0.6309 \times \text{HR}) + (0.1988 \times \text{Weight}_{\text{kg}}) + (0.2017 \times \text{Age}) \right] \times \frac{D}{4.184}$$

### 4. Biomechanical Gait Asymmetry Index
$$\text{Asymmetry Index (\%)} = \frac{|L_{\text{impact}} - R_{\text{impact}}|}{\max(L_{\text{impact}}, R_{\text{impact}})} \times 100\%$$
* $> 12\%$ flags unilateral compensatory loading and triggers physio review.

---

## 📊 Verifiable ML Models & Model Card

The machine learning models are dual ensemble **Random Forest Regressors** trained on 180 longitudinal daily entries using an **80/20 chronological holdout split** to prevent temporal lookahead leakage.

Full evaluation metadata is serialized in [`model_card.json`](ml/model_card.json) and exposed via `GET /api/model-card`.

### Empirical Test-Set Metrics:
| Model Target | Architecture | Holdout $R^2$ Score | Test MAE | Test RMSE | 95% Confidence Interval |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Fatigue Level** (0–100) | Random Forest (100 Trees) | **0.902** | **1.33 pts** | **2.25 pts** | $\pm 4.3$ pts |
| **Recovery Score** (0–100%) | Random Forest (100 Trees) | **0.943** | **1.77 pts** | **2.30 pts** | $\pm 4.5$ pts |

### Feature Importances:
* **Fatigue Model**: Daily Training Load (58.2%), Prior Fatigue $t-1$ (33.0%), Sleep Duration (3.0%), Workout Intensity (2.9%), Rest Heart Rate (2.9%).
* **Recovery Model**: Sleep Duration (89.8%), Prior Fatigue $t-1$ (4.6%), Prior Recovery $t-1$ (2.3%), Daily Load (1.4%), Rest Heart Rate (1.9%).

---

## 📡 Data Contracts & Runtime Validation

All inbound sensor payloads from hardware or client endpoints pass through strict runtime validation (`twin/contracts.py`):

```python
@dataclass
class SensorPacket:
    device_id: str             # Non-empty hardware ID
    timestamp: float           # Valid epoch timestamp
    heart_rate: float          # 30.0 <= HR <= 240.0 BPM
    spo2: float                # 70.0% <= SpO2 <= 100.0%
    cadence: float             # 0.0 <= SPM <= 260.0
    accel_x: float             # -16.0g <= ax <= 16.0g
    accel_y: float             # -16.0g <= ay <= 16.0g
    accel_z: float             # -16.0g <= az <= 16.0g
    battery: float             # 0.0% <= battery <= 100.0%
```

Any packet violating physiological bounds is quarantined with HTTP 422, logged to the auditor trail, and rejected without polluting twin state.

---

## 👥 Multi-Role User Experience

Twin-Athlete features a top-bar segment switcher supporting three distinct roles:

1. **🏃 Athlete View (`#dashboard`)**:
   - Real-time biometric cockpit, telemetry gauges, and interactive 3D digital twin hologram.
   - Dynamic recommendation with "Why This Recommendation?" multi-objective factor attribution.
   - What-If Scenario simulator with side-by-side comparative trajectories.

2. **🛡️ Coach Squad Command (`#coach-squad`)**:
   - Squad-wide roster cards monitoring team average readiness, high-fatigue alerts, and ACWR safety zones.
   - One-click athlete twin selection to inspect individual profiles.

3. **🔍 Sports Scientist & Auditor Center (`#auditor-center`)**:
   - Machine Learning model card inspection and direct `model_card.json` download.
   - Sensor signal jitter, latency, and sample-rate health diagnostics.
   - Security audit trail and verification event log.

---

## 📁 Repository Architecture

```text
Twin-athlete/
├── README.md
├── requirements.txt
├── Dockerfile
├── Procfile
├── .gitignore
├── .dockerignore
│
├── app.py                          # Hardened Flask server, rate limiting, security headers & REST APIs
│
├── twin/                           # Core application package
│   ├── __init__.py
│   ├── contracts.py                # Versioned typed data contracts & physiological validators
│   ├── coach.py                    # Stateful Athlete Twin, personalization & prediction tracker
│   ├── telemetry.py                # Signal processing, sliding-window vitals & data quality diagnostics
│   ├── simulator.py                # Biomechanical What-If simulation engine
│   ├── registry.py                 # Multi-athlete squad registry
│   ├── bridge.py                   # Hardware USB-Serial bridge with automatic reconnect
│   └── storage.py                  # Zero-dependency SQLite WAL persistence vault
│
├── ml/                             # Training & models
│   ├── train.py                    # ML training pipeline with chronological holdout & model card exporter
│   ├── generate_data.py            # Parametric longitudinal synthetic dataset generator
│   ├── model_card.json             # Verifiable model card artifact with empirical holdout metrics
│   ├── models/                     # Serialized machine learning models & feature contracts
│   │   ├── twin_fatigue_model.pkl
│   │   ├── twin_recovery_model.pkl
│   │   └── twin_features.json
│   └── data/
│       └── synthetic_athlete_dataset.csv
│
├── static/                         # Frontend presentation cockpit
│   ├── index.html                  # Semantic HTML5 multi-view application cockpit
│   ├── app.js                      # Unified frontend controller (SSE streams, routing, modals, charts)
│   ├── style.css                   # Modern CSS design system (glassmorphism, tokens, responsive layout)
│   └── images/                     # Athlete avatar and UI graphic assets
│
├── firmware/                       # Hardware edge firmware
│   ├── WIRING_GUIDE.md             # Hardware wiring guide (I2C bus, pinouts, troubleshooting)
│   └── esp32_athlete_tracker/      # Production Arduino C++ firmware for ESP32
│       └── esp32_athlete_tracker.ino
│
├── tests/                          # Automated verification test suite
│   ├── __init__.py
│   ├── test_ai_coach.py            # Unit tests for personalized AI coach and What-If simulation
│   ├── test_telemetry.py           # Unit tests for physiological signal processing
│   ├── test_e2e_api.py             # End-to-end integration tests for Flask routes
│   ├── test_forensics_e2e.py       # Forensic test suite (data contracts, security, feedback loop)
│   ├── test_registry.py            # Multi-athlete registry and squad state tests
│   ├── test_simulator.py           # Biomechanical simulation resilience & mechanistic fallback tests
│   └── test_storage.py             # SQLite WAL persistence & ledger tests
│
├── scripts/                        # Operational utility scripts
│   └── verify_live_system.py       # End-to-end live server & hardware verification script
│
└── docs/                           # Architecture notes and scientific specifications
```

---

## 🚀 Getting Started

### 1. Prerequisites
* Python 3.9, 3.10, or 3.11 installed
* Modern web browser (Chrome, Firefox, Edge, Safari)
* *(Optional)* ESP32 DevKit v1 with MAX30102 PPG and MPU6050 6-DOF IMU

### 2. Installation
```bash
git clone https://github.com/avneeshW/Twin-athlete.git
cd Twin-athlete
pip install -r requirements.txt
```

### 3. Retrain Models & Generate Model Card *(Optional)*
```bash
python ml/train.py
```
This trains the dual ensemble Random Forests on the 180-day longitudinal athlete dataset and updates `ml/model_card.json`.

### 4. Run the Platform
```bash
python app.py
```
Navigate your browser to:
```
http://localhost:5000
```

---

## 🧪 Test Suite & Forensic Verification

Run the complete 47-test suite across unit, contract, integration, and security layers:

```bash
python -m unittest discover -p "test_*.py"
```
*(or explicitly specify test directory: `python -m unittest discover -s tests -p "test_*.py"`)*

Expected output:
```text
Ran 47 tests in 0.95s

OK
```

### Test Breakdown:
- **`test_forensics_e2e.py` (11 Tests)**: Validates strict data contracts, rejection of impossible sensor packets (HR > 240, SpO2 < 70%), HTTP security headers (`nosniff`, `SAMEORIGIN`), model card integrity, data quality reporting, prediction-vs-actual feedback ledger, and coach team overview.
- **`test_ai_coach.py` (8 Tests)**: Validates Banister TRIMP, ACWR calculations, personalization tiers, What-If simulation comparisons, and recommendation factor attribution.
- **`test_telemetry.py` (7 Tests)**: Validates sliding-window heart rate averaging, cadence computation, gravity compensation, and sensor error fallbacks.
- **`test_storage.py` (6 Tests)**: Validates SQLite WAL mode, schema initialization, baseline profiles, feedback ledger, session history, and audit logging.
- **`test_registry.py` (6 Tests)**: Validates multi-athlete registry, squad overview, active athlete routing, and hardware device mapping.
- **`test_simulator.py` (5 Tests)**: Validates biomechanical What-If forward simulation, mechanistic Banister fallback, ML inference, and overtraining risk assessment.
- **`test_e2e_api.py` (4 Tests)**: Validates REST API responses, mock streaming activation, and session check-in ingestion.

---

## 🔒 Security & Privacy Implementation

- **HTTP Security Headers**: Every server response includes `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and `Referrer-Policy: strict-origin-when-cross-origin`.
- **In-Memory Rate Limiting**: Enforced at 35 requests/second per IP on public ingestion routes to prevent denial-of-service degradation.
- **Payload Validation**: Strict bounds checking prevents memory poisoning, buffer overflows, and NaN propagation in mathematical routines.
- **Client Security**: Zero private API keys, database credentials, or secret tokens are bundled into client-side assets.
- **Privacy Model**: Athlete health metrics are stored locally and anonymized; data retention protocols allow complete baseline reset via `POST /api/athlete/baseline`.

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

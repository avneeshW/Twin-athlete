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
* Python 3.9, 3.10, 3.11, or 3.12 installed
* Modern web browser (Chrome, Firefox, Edge, Safari)
* *(Optional)* ESP32 DevKit v1 with MAX30100 PPG optical sensor (I2C `0x57`) and MPU6050 6-DOF IMU (I2C `0x68`)

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
Or for production deployment using Gunicorn with the single-worker requirement:
```bash
gunicorn --worker-class gthread --workers 1 --threads 4 --bind 0.0.0.0:5000 app:app
```
Navigate your browser to:
```
http://localhost:5000
```

---

## ⚡ Hardened Phase 2 Architecture & Operations

### 1. Database Architecture & `TWIN_DB_PATH`
* **Committed Seed DB vs. Runtime DB**:
  - `twin_athlete.db` is the committed baseline seed file (tracked in Git, containing athlete profiles and reference baseline history).
  - Runtime mutations are written to `TWIN_DB_PATH` (defaults to `data/twin_runtime.db`, gitignored).
  - On first launch, the seed database is automatically copied to `data/twin_runtime.db` if it does not already exist. Real incoming athlete telemetry and workout sessions never mutate the committed seed repository file.
* **Per-Connection Pragmas**: Every SQLite connection applies:
  ```sql
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  ```
* **Raw Sensor Storage (`samples` table)**:
  - Extends `session_history` with `id`, `device_id`, `is_mock`, `rpe_post`, and `notes`.
  - Added new `samples` table storing raw telemetry: `id`, `session_id`, `device_id`, `seq`, `device_ms`, `server_ts`, `hr`, `spo2`, `ax`, `ay`, `az`, `gx`, `gy`, `gz`, `cadence`, `flags`, `is_mock`.
  - Fast query indices on `(session_id, id)` and `(device_id, server_ts)`.

### 2. High-Performance Zero-DB Ingestion Path
* **Zero Database Calls on Hot Ingest**:
  - `POST /api/esp32/telemetry` validates contracts and resolves device routing from an in-memory cache of `device_mappings` without touching SQLite.
  - Telemetry samples are pushed off the request thread via non-blocking `queue.put_nowait()` into a bounded queue (depth 5,000).
  - If the queue is saturated, the oldest sample is dropped to protect memory, and per-device drop counters are incremented.
* **Single Long-Lived Writer Thread**:
  - A background `TelemetryWriter` worker commits batched samples via `executemany` every ~1 second or 100 samples in a single transaction.
  - If SQLite encounters a lock or operational delay, transactions are kept in a bounded retry buffer with exponential backoff—never raising or stalling sensor ingestion or client SSE streams.
  - Clean graceful shutdown is guaranteed via `atexit` and `SIGTERM` handlers.

### 3. Session Lifecycle & Streaming CSV Export
* **Automated & Manual Session Control**:
  - **Auto-Session**: First telemetry packet from any device automatically starts an active session (`SES-<device_id>-<timestamp>`).
  - **Auto-Close on Idle**: Sessions auto-close after 60 seconds of inactivity (`TWIN_SESSION_IDLE_TIMEOUT`), persisting session aggregates to `session_history` so data is never lost if a user forgets to click Stop.
  - `POST /api/session/start`: Manually start or name a workout session with custom notes.
  - `POST /api/session/end`: Closes active session and records athlete RPE (`rpe_post`), post-workout notes, and summary statistics.
  - `POST /api/session/reset`: Instantly resets active session state while preserving persistent history.
  - `GET /api/sessions`: Lists recorded sessions with optional `?include_mock=1` filtering.
* **Chunked Streaming CSV Export**:
  - `GET /api/sessions/<session_id>/export.csv` streams raw per-sample sensor records in chunks of 1,000 rows using a memory-efficient generator.
  - Real exports strictly exclude mock samples (`is_mock=0`). Mock sessions return `403 Forbidden` unless explicitly requested with `?include_mock=1`.

### 4. Monotonic SSE IDs & Replay on Reconnect
* **Monotonic Event Sequencing**: Every SSE event receives a monotonic `id:` seeded from `MAX(samples.id)` at startup.
* **`Last-Event-ID` Replay**: On reconnect with `Last-Event-ID: <id>`, the server forces a flush of pending queue samples, queries SQLite for missed events (capped at 5,000 events or 5 minutes), replays them to the client in order, and transitions to the live stream without duplicating events.
* **Client Drop Accounting**: If an individual browser client's SSE queue fills, drops are tracked and reported in `/api/health`.

### 5. API Keys & Device Authentication
* **Device-Keyed Rate Limiting**:
  - Authenticated ingestion: 35 packets/sec per authenticated `device_id`, backed by a 150 req/sec per-IP backstop.
  - Set `TWIN_API_KEYS` in your environment:
    ```bash
    export TWIN_API_KEYS="ESP32-ATHLETE-01:secret-key-1,ESP32-MAX30100:secret-key-2"
    ```
  - When enabled, `POST /api/esp32/telemetry` and session endpoints require `X-API-Key`, verified using constant-time `hmac.compare_digest`.
  - Firmware reads credentials from gitignored `firmware/config.h` (template in `firmware/config.example.h`).
  - Serial bridge supports `--api-key <key>` for automated USB UART authentication.

### 6. Deployment Architecture: Single-Worker Requirement
* **Why Single-Worker (`gthread`)?**:
  - Twin-Athlete's architecture uses in-process memory state: per-client SSE broadcast queues, the bounded 5,000-sample ingest queue, session managers, and the dedicated writer thread.
  - Running multi-process pre-fork workers (e.g. `gunicorn -w 4`) fragments client SSE connections across workers, duplicates session managers, and causes multi-process SQLite write-lock contention.
  - Always deploy with:
    ```text
    web: gunicorn --worker-class gthread --workers 1 --threads 4 --bind 0.0.0.0:$PORT app:app
    ```

### 7. Serverless Limitations (Vercel / AWS Lambda)
* **Ephemeral Fallback**:
  - On serverless environments (`VERCEL` or `AWS_LAMBDA_FUNCTION_NAME`), SQLite automatically uses ephemeral `/tmp/twin_athlete.db`.
  - `GET /api/health` indicates `persistent: false` and `storage_mode: "tmp"`.
  - The web cockpit renders a persistent red alert banner warning that changes are temporary across lambda invocations.
* **Loud Local Failures**:
  - On local development and self-hosted instances, SQLite operational errors **fail loudly** (retrying with backoff and raising exceptions) and will NEVER silently degrade to `/tmp` or `:memory:`.

### 8. Edge Sensors & Hardware Guidance
* **MAX30100 Pulse Oximeter (`0x57`)**:
  - Direct register manipulation for Red and IR optical LEDs.
  - **Important Wiring Note**: Many commercial MAX30100 breakout modules have on-board 4.7 kΩ pull-ups mistakenly tied to 1.8V rather than 3.3V, causing I2C timeouts on ESP32s. Connect `VIN` to 3.3V and see `firmware/WIRING_GUIDE.md` for pull-up remediation instructions.
* **MPU6050 6-Axis IMU (`0x68`)**:
  - 3-axis accelerometer and 3-axis gyroscope for stride detection, impact deceleration, and running cadence.

---

## 🧪 Test Suite & Forensic Verification

Run the complete 116-test suite covering units, contracts, storage migrations, thread batching, SSE replay, and end-to-end APIs:

```bash
python -m pytest tests/
```

All 116 tests execute in under 10 seconds with zero external database dependencies.

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

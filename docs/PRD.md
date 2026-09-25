# Product Requirements Document (PRD)
## Twin-Athlete: Autonomous Digital Twin Sports Performance Platform
**Document Version:** `2.5.0`  
**Status:** Approved / Active Development  
**Target Release:** Production-Minded Prototype (Q4 2026)  

---

### 1. Executive Summary & Problem Statement

Modern competitive athletes and high-performance training squads generate high volumes of physiological telemetry across smartwatches, optical pulse oximeters, and inertial measurement units (IMUs). Despite this data abundance, sports practitioners face three core architectural failures:

1. **Uncalibrated, Static Metrics:** Off-the-shelf commercial wearables benchmark an athlete against generic population averages rather than a persistent, personalized longitudinal baseline.
2. **Absence of Counterfactual What-If Simulation:** Athletes cannot evaluate prospective consequences before executing a workout (e.g., *"If I train for 90 minutes at 85% intensity on 6.5 hours of sleep, what is my predicted neuromuscular fatigue tomorrow?"*).
3. **Black-Box Readiness Scores without Closed-Loop Accountability:** Commercial proprietary readiness scores never expose their residual error or reconcile prospective predictions against retrospective ground truth.

**Twin-Athlete solves this** by translating raw, multi-modal wearable telemetry into a stateful, time-aware computational representation of an individual athlete—a **Digital Twin**. Grounded in peer-reviewed sports science, strict runtime data contracts, and dual Random Forest models with deterministic differential fallbacks, the platform closes the loop from physical sensor acquisition to actionable coaching decisions.

---

### 2. Medical & Regulatory Disclaimer (Non-Negotiable)

> [!WARNING]
> **IMPORTANT MEDICAL & REGULATORY DISCLAIMER:**  
> Twin-Athlete is an experimental sports-science decision-support and workload optimization system. It is **NOT** a medical diagnostic device, does **NOT** provide clinical diagnoses, and does **NOT** replace a licensed physician, certified physiotherapist, or sports medicine specialist. All injury signals, fatigue curves, and readiness scores are decision-support heuristics.

---

### 3. Target User Personas

| Persona | Role & Context | Primary Needs & Pain Points | Primary Interface |
| :--- | :--- | :--- | :--- |
| **1. The Individual Athlete** (*e.g., Daniel Saji*) | Midfield football runner tracking personal recovery, workload, and match readiness. | • Needs objective readiness scores calibrated to personal baseline.<br>• Wants to test training alternatives before committing.<br>• Demands actionable, non-punitive explanations of *why* rest is recommended. | **Athlete Cockpit View**<br>(Readiness gauge, TRIMP accumulator, What-If simulator, sleep calibration) |
| **2. The Squad Coach** | Head performance coach managing 25+ players across training microcycles. | • Monitors team-wide acute:chronic workload ratios (ACWR).<br>• Needs early warning for acute workload spikes (ACWR > 1.35).<br>• Adjusts drill volume dynamically per player. | **Coach Squad Matrix**<br>(Roster risk classification, ACWR scatter, squad deload alerts) |
| **3. The Sports Scientist & Auditor** | Biomechanist or regulatory auditor evaluating model validity and data integrity. | • Demands mathematical provenance and model cards.<br>• Inspects packet jitter, drop rate, and sensor baseline drift.<br>• Audits prediction-vs-actual residual error (MAE). | **Forensic Governance Center**<br>(Model Card v2.4, feedback ledger, data quality index, audit logs) |

---

### 4. Core User Stories

* **US-01 (Athlete - What-If Simulation):** As an athlete, I want to adjust workout duration and planned sleep in the simulator to see my predicted next-day fatigue and recovery before stepping onto the training pitch.
* **US-02 (Athlete - Provenance Transparency):** As an athlete, I want to clearly distinguish whether my vitals are `LIVE` from my wearable or `DEMO` from a synthetic feed, so that I never mistake a simulation for physical reality.
* **US-03 (Coach - Squad Screening):** As a squad coach, I want to view my team roster categorized by *Optimal*, *High Workload Spike*, and *High Fatigue* states, so that I can modify drill participation before training starts.
* **US-04 (Sports Scientist - Feedback Ledger):** As a sports scientist, I want to review the retrospective residual error (MAE) of historical predictions against post-session ground truth, so that I can mathematically evaluate model drift.
* **US-05 (Auditor - Boundary Enforcement):** As a compliance auditor, I want physically impossible sensor values (e.g., HR > 240 BPM or SpO2 < 70%) to be actively rejected with an HTTP 422 error and recorded in the audit log.
* **US-06 (Athlete - Data Sovereignty):** As an athlete, I want my baseline calibration data and session histories stored locally in an embedded database without third-party cloud data monetization.

---

### 5. Functional Requirements

#### 5.1 Telemetry Ingestion & Data Contracts (P0 - Must Have)
* **FR-01:** System shall ingest JSON telemetry packets via `POST /api/esp32/telemetry`.
* **FR-02:** System shall validate all packets against strict physiological bounds ($30 \le \text{HR} \le 240$ BPM, $70 \le \text{SpO2} \le 100\%$, $|\text{accel}| \le 16g$).
* **FR-03:** Out-of-bounds or malformed packets must be rejected with HTTP 422 Unprocessable Entity.
* **FR-04:** Packets shall be annotated with provenance tags (`LIVE`, `DEMO`, or `EXPERIMENTAL`).
* **FR-05:** Calculate signal quality metrics: packet jitter ($\sigma_{\Delta t}$), packet drop rate (%), and optical DC baseline drift.

#### 5.2 Athlete Twin Engine & Scientific Kinetics (P0 - Must Have)
* **FR-06:** Compute cardiovascular Training Impulse using Banister's exponential TRIMP formula.
* **FR-07:** Track Acute (7-day) and Chronic (28-day) Workload Ratios (ACWR) with Gabbett safe bands ($0.8 \le \text{ACWR} \le 1.3$).
* **FR-08:** Calculate Keytel energy expenditure (gross kcal burned per minute).
* **FR-09:** Derive bilateral gait asymmetry percentage from vertical acceleration peaks ($|a_y| > 1.2g$).
* **FR-10:** Support three calibration tiers: `COLD_START` (<7 days), `CALIBRATING` (7–28 days), and `CALIBRATED` (28+ days).

#### 5.3 Simulation & Mechanistic Fallback (P0 - Must Have)
* **FR-11:** Execute 1-day forward step transitions using dual Random Forest models when available.
* **FR-12:** Fall back silently to deterministic Banister impulse-response kinetics if ML models are unavailable or inference fails.
* **FR-13:** Expose workout presets: *Rest Day*, *Recovery Jog*, *Normal Training*, *Hard Training*, and *Max Exertion*.
* **FR-14:** Output $\pm 4.3$ point empirical uncertainty bounds on forward predictions.

#### 5.4 Persistence & Closed-Loop Feedback Ledger (P0 - Must Have)
* **FR-15:** Persist athlete baselines, prediction records, session summaries, and audit logs using embedded SQLite with Write-Ahead Logging (WAL) enabled.
* **FR-16:** Record prospective predictions with unique IDs (`PRED-XXXX`) and provide `POST /api/feedback/record-outcome` to compute residual errors upon session verification.

#### 5.5 Multi-Athlete Registry (P1 - Should Have)
* **FR-17:** Support an `AthleteRegistry` that maintains distinct stateful twins for multiple players keyed by `athlete_id`.
* **FR-18:** Provide squad-wide ACWR distribution and team deload alerts in the Coach view.

#### 5.6 Real-World Activity Replay (P2 - Nice to Have)
* **FR-19:** Support file upload and playback of standard CSV/FIT activity files through the live ingestion pipeline with speed multipliers (1x, 2x, 5x).

---

### 6. Non-Functional Requirements (NFRs)

* **NFR-01 (End-to-End Latency):** Ingestion-to-display latency across the Server-Sent Events (SSE) pipeline shall remain below 50ms at 1 Hz streaming frequency.
* **NFR-02 (Zero-Ops / Self-Contained):** The platform must operate offline without mandatory cloud connections, external message queues, or third-party database services.
* **NFR-03 (Fault Tolerance & Resilience):** The application must not crash due to missing model files or OS binary execution policies, seamlessly falling back to mechanistic formulas.
* **NFR-04 (Security & Hardening):** Every response must enforce `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and strict origin referrer policies. Ingestion endpoints must enforce rate limiting at 35 req/sec per IP.
* **NFR-05 (Data Privacy):** Biometric telemetry must be stored locally on the host machine. The platform shall provide endpoints to reset baselines and export raw JSON records.

---

### 7. Success Metrics & Verification Criteria

| Metric | Target Goal | Verification Method |
| :--- | :--- | :--- |
| **Model Accuracy (Holdout $R^2$)** | $\ge 0.90$ for Fatigue, $\ge 0.90$ for Recovery | Holdout validation on 180-day longitudinal athlete dataset |
| **Mean Absolute Error (MAE)** | $\le 2.0$ points across verified predictions | Closed-loop feedback ledger tracking |
| **Test Suite Coverage** | 100% passing across 40 unit/contract/e2e tests | `python -m unittest discover -p "test_*.py"` |
| **Ingestion Resilience** | Zero unhandled crashes on invalid sensor inputs | Contract boundary tests with out-of-range payloads |
| **Pipeline Latency** | $< 50$ms packet ingestion to client UI render | In-memory packet arrival vs SSE push timestamps |

---

### 8. Explicit Non-Goals & Out-of-Scope

* **NG-01:** Diagnosing medical cardiac conditions, arrhythmias, ischemia, or structural pathologies.
* **NG-02:** Serving as a clinical replacement for 12-lead ECG, hospital pulse oximetry, or medical emergency equipment.
* **NG-03:** Commercial athlete biometric profiling, monetization, or selling data to advertising networks.

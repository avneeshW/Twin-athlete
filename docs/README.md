# 🏃 Twin-Athlete Documentation Index

**System Version:** `v2.5.0`  
**License:** MIT  
**Repository:** [github.com/avneeshW/Twin-athlete](https://github.com/avneeshW/Twin-athlete)

---

### 🛡️ Medical & Regulatory Disclaimer
> **IMPORTANT NOTICE:**  
> Twin-Athlete is an experimental sports-science decision-support and training workload optimization system. It is **NOT** a medical diagnostic device, does **NOT** provide clinical diagnoses, and does **NOT** replace a licensed physician, certified physiotherapist, or sports medicine specialist. All injury signals, fatigue curves, and readiness scores are decision-support heuristics.

---

### 📚 Documentation Suite

This directory contains the canonical architectural, scientific, and product specifications for the **Twin-Athlete** platform:

| Document | Description | Target Audience |
| :--- | :--- | :--- |
| **[PRD.md](PRD.md)** | **Product Requirements Document**<br>Problem statement, user personas, functional requirements (P0–P2), non-functional requirements, success metrics, and non-goals. | Product Managers, Engineers, Sports Scientists |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | **System Design Document**<br>Recommended modular file hierarchy, end-to-end telemetry pipeline, SQLite WAL persistence, multi-athlete registry, and hardware integration. | Systems Architects, Backend Engineers |
| **[TECH_STACK.md](TECH_STACK.md)** | **Tech Stack & Architectural Rationale**<br>Component choices, version constraints, anti-bloat principles, and forensic verification strategy. | Full-Stack Engineers, DevOps |
| **[SCIENTIFIC_FOUNDATIONS.md](SCIENTIFIC_FOUNDATIONS.md)** | **Mathematical & Physiological Reference**<br>Formal formulations: Banister TRIMP, Edwards TRIMP, Gabbett ACWR, Keytel Caloric EE, Gait Asymmetry, and 2-component kinetics. | Sports Scientists, Biomechanists, ML Engineers |

---

### 🧭 Core Mission & Architectural Principles

1. **Honesty-First Provenance:** Every metric, chart, and prediction explicitly declares its state (`LIVE` for physical hardware, `DEMO` for synthetic streams, `EXPERIMENTAL` for biomechanical proxies).
2. **Strict Data Contracts:** Telemetry is bounded and sanitized before entering the computational twin; physically impossible sensor values are rejected with HTTP 422.
3. **Dual-Mode Simulation Resilience:** Machine learning models (Dual Random Forests) are backed by deterministic Banister impulse-response kinetics as a guaranteed fallback.
4. **Zero-Dependency Local Persistence:** Athlete baselines, completed sessions, and closed-loop feedback ledgers are stored locally in SQLite with Write-Ahead Logging (WAL) for speed and data sovereignty.

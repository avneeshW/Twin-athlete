"""
DIGITAL TWIN ATHLETE — DATA CONTRACTS & VALIDATION SCHEMAS
Phase 2 Implementation: Typed, versioned schemas and runtime validators for:
- SensorPacket (inbound ESP32 telemetry)
- TelemetrySample (normalized sensor readings)
- AthleteProfile (persistent personalized athlete model)
- TwinState (stateful, time-aware digital twin)
- PredictionRecord & OutcomeRecord (prediction-vs-actual feedback loop)
- DataQualityReport (sensor integrity & signal health)
- AuditEvent (security & state transition logging)
"""

import time
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict


SCHEMA_VERSION = "2.4.0"


# ==============================================================================
# 1. SENSOR & TELEMETRY CONTRACTS
# ==============================================================================

# Acceptable physiological boundaries for wearable sensors
HR_MIN_BPM = 30.0
HR_MAX_BPM = 240.0
SPO2_MIN_PCT = 70.0
SPO2_MAX_PCT = 100.0
BATTERY_MIN_PCT = 0
BATTERY_MAX_PCT = 100
MAX_ACCEL_G = 16.0  # Max dynamic range for MPU6050 configured to +/- 16g
MAX_PACKET_AGE_SEC = 30.0


@dataclass
class SensorPacketValidationResult:
    is_valid: bool
    errors: List[str]
    warnings: List[str]
    sanitized_data: Optional[Dict[str, Any]] = None


def validate_sensor_packet(raw: Any) -> SensorPacketValidationResult:
    """
    Strict validation of inbound ESP32 telemetry payload.
    Rejects malformed, missing, or physiologically impossible values.
    """
    errors: List[str] = []
    warnings: List[str] = []

    if not isinstance(raw, dict):
        return SensorPacketValidationResult(
            is_valid=False,
            errors=["Payload must be a JSON object."],
            warnings=[]
        )

    # 1. Device ID
    device_id = raw.get("device_id")
    if not device_id or not isinstance(device_id, str) or len(device_id.strip()) == 0:
        errors.append("Field 'device_id' is required and must be a non-empty string.")
    else:
        device_id = device_id.strip()

    # 2. Heart Rate (MAX30102 PPG)
    raw_hr = raw.get("heart_rate", raw.get("hr"))
    if raw_hr is None:
        errors.append("Field 'heart_rate' is required.")
        hr = None
    else:
        try:
            hr = float(raw_hr)
            if hr < HR_MIN_BPM or hr > HR_MAX_BPM:
                errors.append(
                    f"Heart rate {hr} BPM is outside physiologically viable range [{HR_MIN_BPM}, {HR_MAX_BPM}]."
                )
        except (ValueError, TypeError):
            errors.append(f"Invalid heart rate value: {raw_hr}")
            hr = None

    # 3. SpO2 (Blood Oxygenation)
    raw_spo2 = raw.get("spo2")
    if raw_spo2 is None:
        errors.append("Field 'spo2' is required.")
        spo2 = None
    else:
        try:
            spo2 = float(raw_spo2)
            if spo2 < SPO2_MIN_PCT or spo2 > SPO2_MAX_PCT:
                errors.append(
                    f"SpO2 {spo2}% is outside viable range [{SPO2_MIN_PCT}, {SPO2_MAX_PCT}]."
                )
        except (ValueError, TypeError):
            errors.append(f"Invalid spo2 value: {raw_spo2}")
            spo2 = None

    # 4. Tri-axial Accelerometer (MPU6050 IMU)
    ax, ay, az = None, None, None
    for axis, key in [("ax", "ax"), ("ay", "ay"), ("az", "az")]:
        val = raw.get(key, 0.0)
        try:
            f_val = float(val)
            if abs(f_val) > MAX_ACCEL_G:
                warnings.append(f"Accelerometer {axis}={f_val}g exceeds normal range (+/- {MAX_ACCEL_G}g); clamping.")
                f_val = max(-MAX_ACCEL_G, min(MAX_ACCEL_G, f_val))
            if axis == "ax": ax = f_val
            elif axis == "ay": ay = f_val
            elif axis == "az": az = f_val
        except (ValueError, TypeError):
            errors.append(f"Invalid accelerometer value for {key}: {val}")

    # 5. Battery
    raw_battery = raw.get("battery", 100)
    try:
        battery = int(raw_battery)
        if battery < BATTERY_MIN_PCT or battery > BATTERY_MAX_PCT:
            battery = max(BATTERY_MIN_PCT, min(BATTERY_MAX_PCT, battery))
            warnings.append(f"Battery percentage clamped to [{BATTERY_MIN_PCT}, {BATTERY_MAX_PCT}].")
    except (ValueError, TypeError):
        battery = 100
        warnings.append("Invalid battery value, defaulting to 100.")

    # 6. Timestamp / Sample Age
    now_utc = time.time()
    packet_timestamp = raw.get("timestamp")
    if packet_timestamp is not None:
        try:
            ts = float(packet_timestamp)
            if abs(now_utc - ts) > MAX_PACKET_AGE_SEC:
                warnings.append(f"Packet timestamp drift detected: sample age is {abs(now_utc - ts):.1f}s.")
        except (ValueError, TypeError):
            warnings.append("Malformed timestamp, defaulting to server arrival time.")
            ts = now_utc
    else:
        ts = now_utc

    if errors:
        return SensorPacketValidationResult(
            is_valid=False,
            errors=errors,
            warnings=warnings,
            sanitized_data=None
        )

    sanitized = {
        "device_id": device_id,
        "heart_rate": round(hr, 1) if hr is not None else 75.0,
        "spo2": round(spo2, 1) if spo2 is not None else 98.0,
        "ax": round(ax, 3) if ax is not None else 0.0,
        "ay": round(ay, 3) if ay is not None else 0.0,
        "az": round(az, 3) if az is not None else 0.0,
        "battery": battery,
        "packet": int(raw.get("packet", 0)),
        "timestamp": ts,
        "ingested_at": now_utc,
        "schema_version": SCHEMA_VERSION
    }

    return SensorPacketValidationResult(
        is_valid=True,
        errors=[],
        warnings=warnings,
        sanitized_data=sanitized
    )


# ==============================================================================
# 2. DIGITAL TWIN STATE CONTRACT
# ==============================================================================

@dataclass
class TwinStateModel:
    """
    Explicit, structured, time-aware Athlete Digital Twin state.
    """
    athlete_id: str
    updated_at: float
    schema_version: str = SCHEMA_VERSION
    model_version: str = "v2.4-rf-impulse"

    # Physiological & Bio-Demographic Baseline
    resting_hr_baseline: float = 54.0
    chronic_load_baseline: float = 42.0
    sleep_baseline_hours: float = 7.8
    personalization_tier: str = "CALIBRATED"  # COLD_START | CALIBRATING | CALIBRATED
    history_days_count: int = 180

    # Current Acute State
    readiness_score: float = 85.0
    fatigue_score: float = 38.0
    recovery_score: float = 78.0
    performance_score: float = 86.4
    training_load_au: float = 42.0
    acwr: float = 1.09

    # Biomechanical Movement State
    cadence_spm: int = 168
    impact_magnitude_g: float = 2.8
    bilateral_asymmetry_pct: float = 14.2
    activity_mode: str = "Running"

    # Overall State Classification
    state_key: str = "READY_FOR_TRAINING"
    state_label: str = "READY FOR TRAINING"
    state_color: str = "green"

    # Confidence & Evidence Quality
    data_quality_grade: str = "EXCELLENT"  # EXCELLENT | GOOD | DEGRADED | STALE
    confidence_score: float = 0.92
    uncertainty_band: float = 3.5  # +/- percentage points

    # Provenance
    data_provenance: str = "DEMO"  # LIVE | DEMO | EXPERIMENTAL

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ==============================================================================
# 3. PREDICTION & OUTCOME CONTRACT (FEEDBACK LOOP)
# ==============================================================================

@dataclass
class PredictionRecord:
    prediction_id: str
    created_at: float
    target_metric: str  # "fatigue" | "recovery" | "readiness"
    target_horizon_hours: int
    predicted_value: float
    uncertainty_lower: float
    uncertainty_upper: float
    model_version: str
    scenario_name: str
    status: str = "PENDING"  # PENDING | VERIFIED | EXPIRED
    observed_value: Optional[float] = None
    absolute_error: Optional[float] = None
    percentage_error: Optional[float] = None

    def record_outcome(self, actual: float):
        self.observed_value = round(float(actual), 1)
        self.absolute_error = round(abs(self.predicted_value - self.observed_value), 2)
        if self.observed_value > 0:
            self.percentage_error = round((self.absolute_error / self.observed_value) * 100.0, 1)
        else:
            self.percentage_error = 0.0
        self.status = "VERIFIED"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ==============================================================================
# 4. AUDIT EVENT LOG CONTRACT
# ==============================================================================

@dataclass
class AuditEvent:
    event_id: str
    timestamp: float
    event_type: str  # "INGESTION_ANOMALY" | "MODEL_PREDICTION" | "CALIBRATION_UPDATE" | "SECURITY_FLAG"
    severity: str    # "INFO" | "WARNING" | "CRITICAL"
    source: str
    details: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

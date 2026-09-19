import time
import math
from collections import deque
import numpy as np

import simulator


class TelemetryEngine:
    """
    Real-time sports-science and biomechanics analytics engine for ESP32 athlete wearable telemetry.
    Processes live raw sensor streams (HR, SpO2, 3-axis Accelerometer) and computes:
      - Physiological Heart Rate Zones & Cardiac Anomaly Detection
      - SpO2 Blood Oxygenation Health Assessment
      - Tri-axial Biomechanical Motion Magnitude & Activity Classification
      - Step & Cadence Detection (Steps Per Minute - SPM)
      - Metabolic Caloric Expenditure (Keytel Formula)
      - Continuous Active Session Accumulation & Digital Twin Fatigue/Recovery Dynamics
    """

    def __init__(self, athlete_age: int = 24, athlete_weight_kg: float = 72.0, resting_hr: float = 55.0):
        self.athlete_age = athlete_age
        self.athlete_weight_kg = athlete_weight_kg
        self.resting_hr = resting_hr
        self.max_hr = 220 - athlete_age  # E.g. 196 BPM for age 24

        # Sliding window buffers for rolling charts & cadence detection (capacity 60 data points)
        self.buffer_size = 60
        self.history_timestamps = deque(maxlen=self.buffer_size)
        self.history_hr = deque(maxlen=self.buffer_size)
        self.history_spo2 = deque(maxlen=self.buffer_size)
        self.history_ax = deque(maxlen=self.buffer_size)
        self.history_ay = deque(maxlen=self.buffer_size)
        self.history_az = deque(maxlen=self.buffer_size)
        self.history_mag = deque(maxlen=self.buffer_size)

        # Active Session Metrics
        self.session_active = True
        self.session_start_time = time.time()
        self.session_elapsed_sec = 0
        self.total_calories = 0.0
        self.all_hr_readings = []
        self.step_count = 0
        self.last_step_time = 0.0

        # Baseline Digital Twin State (Starts from current recovery/fatigue)
        self.current_fatigue = 20.0
        self.current_recovery = 82.0
        self.sleep_hours = 7.5

        # Device connection tracking
        self.last_packet_time = None
        self.packet_count = 0
        self.device_id = "ESP32-ATHLETE-01"
        self.battery_level = 100

    def reset_session(self):
        """Resets active workout session stats."""
        self.session_start_time = time.time()
        self.session_elapsed_sec = 0
        self.total_calories = 0.0
        self.all_hr_readings = []
        self.step_count = 0
        self.last_step_time = 0.0
        self.current_fatigue = 20.0
        self.current_recovery = 82.0

    def get_hr_zone(self, hr: float) -> dict:
        """
        Classifies Heart Rate into 5 sports-science cardiovascular training zones.
        """
        pct_max = (hr / self.max_hr) * 100.0

        if pct_max < 60.0:
            return {
                "zone": 1,
                "name": "Zone 1: Active Recovery",
                "label": "Recovery",
                "pct_max": round(pct_max, 1),
                "color": "#10b981",  # Green
                "target": "< 60% HRmax",
                "desc": "Promotes aerobic recovery & base endurance"
            }
        elif pct_max < 70.0:
            return {
                "zone": 2,
                "name": "Zone 2: Aerobic Base",
                "label": "Aerobic",
                "pct_max": round(pct_max, 1),
                "color": "#38bdf8",  # Cyan
                "target": "60% - 70% HRmax",
                "desc": "Builds cardiovascular base & fat oxidation"
            }
        elif pct_max < 80.0:
            return {
                "zone": 3,
                "name": "Zone 3: Tempo / Aerobic Power",
                "label": "Tempo",
                "pct_max": round(pct_max, 1),
                "color": "#f59e0b",  # Amber
                "target": "70% - 80% HRmax",
                "desc": "Improves aerobic efficiency & muscular endurance"
            }
        elif pct_max < 90.0:
            return {
                "zone": 4,
                "name": "Zone 4: Lactate Threshold",
                "label": "Threshold",
                "pct_max": round(pct_max, 1),
                "color": "#f97316",  # Orange
                "target": "80% - 90% HRmax",
                "desc": "Increases lactate tolerance & high-speed endurance"
            }
        else:
            return {
                "zone": 5,
                "name": "Zone 5: VO2 Max / Anaerobic",
                "label": "VO2 Max",
                "pct_max": round(pct_max, 1),
                "color": "#ef4444",  # Red
                "target": "> 90% HRmax",
                "desc": "Peak neuromuscular exertion & speed capacity"
            }

    def assess_spo2(self, spo2: float) -> dict:
        """Evaluates peripheral capillary oxygen saturation health level."""
        if spo2 >= 95.0:
            return {"status": "Normal", "color": "green", "alert": None}
        elif spo2 >= 90.0:
            return {"status": "Mild Hypoxia", "color": "yellow", "alert": "SpO2 slightly low - monitor breathing rate"}
        else:
            return {"status": "Critical Hypoxia", "color": "red", "alert": "ALERT: Severe SpO2 drop! Pause exertion immediately."}

    def classify_activity(self, mag: float, recent_variance: float) -> dict:
        """
        Classifies athlete movement based on tri-axial acceleration magnitude (G)
        and dynamic signal variance.
        """
        if mag < 1.15 and recent_variance < 0.08:
            return {"activity": "Resting", "status": "Stationary", "intensity_mode": "Low", "color": "green"}
        elif mag < 1.55:
            return {"activity": "Walking", "status": "Low Intensity", "intensity_mode": "Low", "color": "cyan"}
        elif mag < 2.60:
            return {"activity": "Running", "status": "Moderate Intensity", "intensity_mode": "Moderate", "color": "purple"}
        else:
            return {"activity": "Sprinting", "status": "High Intensity", "intensity_mode": "High", "color": "red"}

    def detect_step_and_cadence(self, current_time: float, mag: float) -> int:
        """
        Peak detector on acceleration magnitude to count running steps and calculate cadence (SPM).
        """
        # Peak threshold for step strike: mag > 1.45g and at least 0.25s since last step (max 240 SPM)
        if mag > 1.45 and (current_time - self.last_step_time) > 0.25:
            self.step_count += 1
            self.last_step_time = current_time

        # Calculate cadence from steps in rolling history
        if self.session_elapsed_sec > 2:
            cadence_spm = int(round((self.step_count / max(self.session_elapsed_sec, 1)) * 60))
            return min(cadence_spm, 220)
        return 0

    def calculate_calories_burned(self, hr: float, dt_seconds: float) -> float:
        """
        Calculates incremental energy expenditure in kilocalories using Keytel et al. formula:
        Calories/min = (-55.0969 + (0.6309 * HR) + (0.1988 * Weight) + (0.2017 * Age)) / 4.184
        """
        if hr < 65:
            # Baseline resting metabolic expenditure ~ 1.2 kcal/min for 72kg
            burn_rate_min = 1.2
        else:
            burn_rate_min = (-55.0969 + (0.6309 * hr) + (0.1988 * self.athlete_weight_kg) + (0.2017 * self.athlete_age)) / 4.184
            burn_rate_min = max(burn_rate_min, 1.2)

        incremental_kcal = burn_rate_min * (dt_seconds / 60.0)
        return incremental_kcal

    def process_telemetry(self, data: dict) -> dict:
        """
        Core ingestion pipeline: Takes raw sensor packet from ESP32,
        executes sports analytics, updates rolling history, and recalculates
        digital twin physiological state.
        """
        now = time.time()
        dt = (now - self.last_packet_time) if self.last_packet_time else 1.0
        dt = min(max(dt, 0.1), 5.0)  # Bound dt to realistic range
        self.last_packet_time = now
        self.packet_count += 1

        # Extract & sanitize raw sensor readings
        hr = float(data.get("heart_rate", data.get("hr", 80)))
        spo2 = float(data.get("spo2", 98.0))
        ax = float(data.get("ax", 0.0))
        ay = float(data.get("ay", 0.0))
        az = float(data.get("az", 0.0))
        battery = int(data.get("battery", 95))
        self.battery_level = battery
        if "device_id" in data:
            self.device_id = str(data["device_id"])

        # Tri-axial vector magnitude G
        mag = round(math.sqrt(ax**2 + ay**2 + az**2), 2)
        if mag == 0.0:  # In case sensor reported 0 or relative offsets
            mag = 1.0

        # Update rolling buffers
        self.history_timestamps.append(now)
        self.history_hr.append(hr)
        self.history_spo2.append(spo2)
        self.history_ax.append(ax)
        self.history_ay.append(ay)
        self.history_az.append(az)
        self.history_mag.append(mag)
        self.all_hr_readings.append(hr)

        # Recent variance of magnitude over the last 10 points
        if len(self.history_mag) >= 3:
            recent_variance = float(np.var(list(self.history_mag)[-10:]))
        else:
            recent_variance = 0.05

        # 1. Heart Rate Zone & Anomaly Evaluation
        hr_zone = self.get_hr_zone(hr)

        # 2. SpO2 Assessment
        spo2_assessment = self.assess_spo2(spo2)

        # 3. Biomechanical Motion & Activity Classification
        activity_info = self.classify_activity(mag, recent_variance)

        # 4. Step & Cadence Detection
        cadence_spm = self.detect_step_and_cadence(now, mag)

        # 5. Session Metrics & Caloric Burn
        self.session_elapsed_sec += int(round(dt))
        burned_kcal = self.calculate_calories_burned(hr, dt)
        self.total_calories += burned_kcal

        avg_hr = int(round(sum(self.all_hr_readings) / len(self.all_hr_readings)))
        max_hr_session = int(max(self.all_hr_readings))

        # Format session duration
        mins = self.session_elapsed_sec // 60
        secs = self.session_elapsed_sec % 60
        duration_formatted = f"{mins}m {secs:02d}s" if mins > 0 else f"{secs}s"

        # 6. Real-Time Digital Twin Forward Dynamics
        # Active workout intensity estimation:
        intensity_val = np.clip((hr - self.resting_hr) / (self.max_hr - self.resting_hr), 0.1, 1.0)
        workout_duration_min = max(self.session_elapsed_sec / 60.0, 1.0)

        # Step twin state forward using scikit-learn models in simulator.py
        twin_result = simulator.simulate_single_step(
            current_fatigue=self.current_fatigue,
            current_recovery=self.current_recovery,
            sleep_hours=self.sleep_hours,
            duration=int(workout_duration_min),
            intensity=float(round(intensity_val, 2))
        )

        pred_f = twin_result["predicted_fatigue"]
        pred_r = twin_result["predicted_recovery"]
        pred_p = twin_result["predicted_performance"]

        if pred_f < 30:
            fatigue_label = "Low"
        elif pred_f < 55:
            fatigue_label = "Moderate"
        else:
            fatigue_label = "High"

        if pred_p >= 80:
            performance_label = "High"
        elif pred_p >= 65:
            performance_label = "Moderate"
        else:
            performance_label = "Low"

        # Construct comprehensive live payload
        state = {
            "device": {
                "id": self.device_id,
                "status": "Online",
                "connected": True,
                "last_seen_sec": 0.0,
                "battery": self.battery_level,
                "packet_count": self.packet_count,
                "rate_hz": round(1.0 / dt, 1) if dt > 0 else 1.0
            },
            "vitals": {
                "heart_rate": {
                    "value": int(round(hr)),
                    "unit": "BPM",
                    "status": hr_zone["label"],
                    "color": hr_zone["color"],
                    "zone_info": hr_zone
                },
                "spo2": {
                    "value": int(round(spo2)),
                    "unit": "%",
                    "status": spo2_assessment["status"],
                    "color": spo2_assessment["color"],
                    "alert": spo2_assessment["alert"]
                },
                "activity": {
                    "value": activity_info["activity"],
                    "unit": "",
                    "status": activity_info["status"],
                    "color": activity_info["color"],
                    "intensity_mode": activity_info["intensity_mode"]
                },
                "acceleration": {
                    "value": mag,
                    "unit": "g",
                    "status": "Moderate" if mag < 2.5 else "High",
                    "color": "yellow" if mag < 2.5 else "red",
                    "axes": {"x": ax, "y": ay, "z": az}
                },
                "cadence": {
                    "value": cadence_spm,
                    "unit": "SPM",
                    "steps": self.step_count
                }
            },
            "recent_session": {
                "title": "Live ESP32 Session",
                "activity": activity_info["activity"],
                "duration": duration_formatted,
                "duration_seconds": self.session_elapsed_sec,
                "status": "Live Streaming",
                "avg_heart_rate": avg_hr,
                "max_heart_rate": max_hr_session,
                "calories": int(round(self.total_calories)),
                "burn_rate_kcal_min": round((burned_kcal / (dt / 60.0)), 1) if dt > 0 else 1.2,
                "cadence": cadence_spm,
                "steps": self.step_count,
                "datetime": time.strftime("%d %b %Y • %I:%M %p")
            },
            "twin_status": {
                "fatigue_label": fatigue_label,
                "fatigue_value": pred_f,
                "recovery_label": f"{int(round(pred_r))}%",
                "recovery_value": pred_r,
                "performance_label": performance_label,
                "performance_value": pred_p,
                "daily_load": twin_result["daily_load"],
                "resting_hr": twin_result["predicted_resting_hr"]
            },
            "charts": {
                "heart_rate": {
                    "points": list(self.history_hr),
                    "x_labels": ["-50s", "-40s", "-30s", "-20s", "-10s", "Now"]
                },
                "movement": {
                    "x": list(self.history_ax),
                    "y": list(self.history_ay),
                    "z": list(self.history_az),
                    "mag": list(self.history_mag),
                    "x_labels": ["-50s", "-40s", "-30s", "-20s", "-10s", "Now"]
                }
            },
            "timestamp": now
        }
        self._latest_state = state
        return state

    def get_latest_state(self) -> dict:
        """Returns the most recent state or a realistic fallback if no packet received yet."""
        now = time.time()
        last_seen = round(now - self.last_packet_time, 1) if self.last_packet_time else None
        connected = (last_seen is not None and last_seen < 4.0)

        if getattr(self, "_latest_state", None) is not None:
            state = dict(self._latest_state)
            state["device"] = dict(state.get("device", {}))
            state["device"]["connected"] = connected
            state["device"]["last_seen_sec"] = last_seen
            return state

        # Default athlete state matching reference design
        return {
            "device": {
                "device_id": self.device_id,
                "connected": False,
                "last_seen_sec": None,
                "packet_count": self.packet_count,
                "battery": self.battery_level,
                "rate_hz": 0.0,
                "mock_mode": False
            },
            "vitals": {
                "heart_rate": {
                    "value": 156,
                    "unit": "BPM",
                    "trend": "+8%",
                    "status": "High Intensity",
                    "color": "red",
                    "zone_info": {
                        "zone": 4,
                        "name": "Zone 4: Anaerobic Threshold",
                        "label": "High Intensity",
                        "color": "red"
                    }
                },
                "spo2": {
                    "value": 98,
                    "unit": "%",
                    "status": "Normal",
                    "color": "green"
                },
                "activity": {
                    "value": "Running",
                    "subtext": "Team Training",
                    "unit": "",
                    "status": "Running",
                    "color": "purple"
                },
                "acceleration": {
                    "value": 2.8,
                    "unit": "g",
                    "trend": "+22%",
                    "status": "High Load",
                    "color": "yellow",
                    "axes": {"x": 0.4, "y": 1.9, "z": -0.7}
                },
                "cadence": {
                    "value": 168,
                    "unit": "SPM",
                    "steps": 1240
                }
            },
            "recent_session": {
                "title": "Recent Training Sessions",
                "activity": "Running",
                "duration": "60 min",
                "duration_seconds": 3600,
                "status": "Completed",
                "avg_heart_rate": 152,
                "max_heart_rate": 182,
                "calories": 680,
                "datetime": time.strftime("%d %b %Y • %I:%M %p")
            },
            "twin_status": {
                "fatigue_label": "Moderate",
                "fatigue_value": 38.0,
                "recovery_label": "78%",
                "recovery_value": 78.0,
                "performance_label": "High",
                "performance_value": 85.0,
                "daily_load": 348.0,
                "resting_hr": 54.0
            },
            "charts": {
                "heart_rate": {
                    "points": [102, 120, 142, 150, 162, 168, 160, 164, 156, 158, 162, 166, 172, 170, 168, 174, 164, 162, 158, 154, 156, 160, 152, 148, 156, 146],
                    "x_labels": ["0", "10", "20", "30", "40", "50", "60"]
                },
                "movement": {
                    "x": [0.2, 0.4, 0.6, 0.8, 1.2, 1.5, 0.9, 0.4, 0.2, -0.2, -0.6, -0.9, -0.4, 0.3, 0.8, 1.2, 0.6, 0.1, -0.4, -0.8, -0.3, 0.2, 0.6, 0.9, 0.4],
                    "y": [1.2, 1.6, 2.1, 2.8, 3.2, 2.9, 2.1, 1.5, 1.2, 0.9, 1.1, 1.4, 1.8, 2.4, 3.0, 2.6, 1.8, 1.3, 1.0, 1.2, 1.5, 2.2, 2.9, 2.4, 1.6],
                    "z": [-0.3, -0.1, 0.2, 0.5, 0.8, 0.6, 0.2, -0.1, -0.4, -0.6, -0.3, 0.1, 0.4, 0.7, 0.5, 0.1, -0.2, -0.5, -0.6, -0.3, 0.1, 0.5, 0.7, 0.3, -0.1],
                    "x_labels": ["0", "10", "20", "30", "40", "50", "60"]
                }
            },
            "timestamp": now
        }


# Global engine singleton
engine = TelemetryEngine()

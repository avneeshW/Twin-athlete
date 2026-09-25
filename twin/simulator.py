import os
import json

try:
    import numpy as np
except Exception as e:
    np = None

try:
    import pandas as pd
except Exception as e:
    pd = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))

MODEL_FATIGUE_PATH = os.path.join(ROOT_DIR, "ml", "models", "twin_fatigue_model.pkl")
if not os.path.exists(MODEL_FATIGUE_PATH):
    MODEL_FATIGUE_PATH = os.path.join(ROOT_DIR, "twin_fatigue_model.pkl")

MODEL_RECOVERY_PATH = os.path.join(ROOT_DIR, "ml", "models", "twin_recovery_model.pkl")
if not os.path.exists(MODEL_RECOVERY_PATH):
    MODEL_RECOVERY_PATH = os.path.join(ROOT_DIR, "twin_recovery_model.pkl")

def _find_model_file(filename: str):
    candidates = [
        os.path.join(ROOT_DIR, "ml", "models", filename),
        os.path.join(ROOT_DIR, filename),
        os.path.join(BASE_DIR, filename),
        os.path.join("ml", "models", filename),
        filename,
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None

# 1. Load Trained Twin Models & Feature Definitions with Graceful Fallback
MODEL_FATIGUE = None
MODEL_RECOVERY = None
model_fatigue = None
model_recovery = None
_MODEL_LOAD_TRIED = False

def reload_models():
    """Safely loads or reloads ML models without crashing the process."""
    global MODEL_FATIGUE, MODEL_RECOVERY, model_fatigue, model_recovery, _MODEL_LOAD_TRIED
    _MODEL_LOAD_TRIED = True
    try:
        import joblib
        f_path = _find_model_file("twin_fatigue_model.pkl") or MODEL_FATIGUE_PATH
        r_path = _find_model_file("twin_recovery_model.pkl") or MODEL_RECOVERY_PATH
        if f_path and os.path.exists(f_path):
            MODEL_FATIGUE = joblib.load(f_path)
        if r_path and os.path.exists(r_path):
            MODEL_RECOVERY = joblib.load(r_path)
        model_fatigue = MODEL_FATIGUE
        model_recovery = MODEL_RECOVERY
    except Exception as e:
        MODEL_FATIGUE = None
        MODEL_RECOVERY = None
        model_fatigue = None
        model_recovery = None
        print(f"[Simulator] Notice: ML models not loaded ({e}). Using deterministic Banister kinetics.")

# Safe initial load attempt wrapped in try/except
try:
    reload_models()
except Exception as e:
    print(f"[Simulator] Initial load suppressed: {e}")

try:
    feat_file = _find_model_file("twin_features.json")
    if feat_file and os.path.exists(feat_file):
        with open(feat_file) as f:
            FEATURES = json.load(f).get("features", [])
    else:
        FEATURES = ["prev_fatigue", "prev_recovery", "sleep_hours", "workout_duration_min", "workout_intensity", "daily_load"]
except Exception:
    FEATURES = ["prev_fatigue", "prev_recovery", "sleep_hours", "workout_duration_min", "workout_intensity", "daily_load"]

# Standard preset workout profiles
WORKOUT_PRESETS = {
    "Rest Day": {"duration": 0, "intensity": 0.0},
    "Recovery Jog / Light": {"duration": 30, "intensity": 0.40},
    "Normal Training": {"duration": 45, "intensity": 0.65},
    "Hard Training": {"duration": 90, "intensity": 0.85},
    "Max Exertion / Race Pace": {"duration": 120, "intensity": 0.95},
}


def simulate_single_step(current_fatigue: float, current_recovery: float, sleep_hours: float, 
                         duration: int, intensity: float) -> dict:
    """
    Executes a 1-day forward step for the digital twin without scikit-learn feature name warnings.
    Returns the predicted next-day physiological state using trained Random Forest regressors if available,
    or deterministic Banister impulse-response kinetics as a robust mechanistic fallback.
    """
    daily_load = round(float(duration) * float(intensity), 1)

    pred_fatigue = None
    pred_recovery = None

    # Check both module-level references (in case caller sets model_fatigue or MODEL_FATIGUE)
    active_fatigue_model = MODEL_FATIGUE if MODEL_FATIGUE is not None else model_fatigue
    active_recovery_model = MODEL_RECOVERY if MODEL_RECOVERY is not None else model_recovery

    # 1. High-fidelity Machine Learning Inference
    if active_fatigue_model is not None and active_recovery_model is not None:
        try:
            input_df = pd.DataFrame([{
                "prev_fatigue": float(current_fatigue),
                "prev_recovery": float(current_recovery),
                "sleep_hours": float(sleep_hours),
                "workout_duration_min": int(duration),
                "workout_intensity": float(intensity),
                "daily_load": daily_load
            }])[FEATURES]

            pred_fatigue = float(active_fatigue_model.predict(input_df)[0])
            pred_recovery = float(active_recovery_model.predict(input_df)[0])
        except Exception:
            pred_fatigue = None
            pred_recovery = None

    # 2. Mechanistic Banister 2-Component Impulse-Response Fallback
    if pred_fatigue is None or pred_recovery is None:
        # Sleep restoration factor: 8 hours = 1.0; bounds [0.5, 1.5]
        sleep_factor = max(0.5, min(1.5, float(sleep_hours) / 8.0))

        # Banister fatigue kinetics:
        # Decayed previous fatigue + acute dose from daily training load
        decay_rate = 0.65 / sleep_factor
        acute_dose = daily_load * 0.60
        pred_fatigue = (float(current_fatigue) * decay_rate) + acute_dose

        # Recovery restoration kinetics:
        # Sleep provides base restorative boost; residual fatigue drains recovery
        base_recovery = (float(sleep_hours) / 8.0) * 85.0
        fatigue_drain = float(current_fatigue) * 0.25
        rebound_bonus = 6.0 if float(intensity) < 0.40 else 0.0
        pred_recovery = base_recovery - fatigue_drain + rebound_bonus

    # Ensure strictly bounded physiological ranges
    pred_fatigue = np.clip(float(pred_fatigue), 5.0, 98.0)
    pred_recovery = np.clip(float(pred_recovery), 10.0, 99.0)

    # Derived physiological indicators
    pred_resting_hr = round(52.0 + ((100.0 - pred_recovery) * 0.18), 1)
    pred_performance = round((pred_recovery * 0.6) + ((100.0 - pred_fatigue) * 0.4), 1)

    return {
        "daily_load": daily_load,
        "predicted_fatigue": round(float(pred_fatigue), 1),
        "predicted_recovery": round(float(pred_recovery), 1),
        "predicted_resting_hr": pred_resting_hr,
        "predicted_performance": pred_performance
    }


def simulate_scenario(current_resting_hr: float = 58.0, planned_sleep: float = 7.5, 
                      scenario_type: str = "Normal Training", 
                      current_fatigue: float = 25.0, current_recovery: float = 75.0) -> dict:
    """
    Simulates prospective outcomes based on what-if choices (backward-compatible API).
    """
    if scenario_type not in WORKOUT_PRESETS:
        raise ValueError(f"Unknown scenario type '{scenario_type}'. Valid options: {list(WORKOUT_PRESETS.keys())}")

    preset = WORKOUT_PRESETS[scenario_type]
    step_result = simulate_single_step(
        current_fatigue=current_fatigue,
        current_recovery=current_recovery,
        sleep_hours=planned_sleep,
        duration=preset["duration"],
        intensity=preset["intensity"]
    )

    return {
        "scenario": scenario_type,
        "predicted_performance": step_result["predicted_performance"],
        "predicted_fatigue": step_result["predicted_fatigue"],
        "predicted_recovery": step_result["predicted_recovery"],
        "predicted_resting_hr": step_result["predicted_resting_hr"]
    }


def assess_overtraining_risk(fatigue: float, recovery: float, consecutive_hard_days: int) -> tuple[str, str]:
    """
    Evaluates sports-science readiness & overtraining risk based on fatigue and recovery thresholds.
    """
    if fatigue >= 58.0 or recovery < 50.0 or consecutive_hard_days >= 3:
        return "HIGH RISK", "RED - High Overtraining / Injury Risk. Deload immediately."
    elif fatigue >= 35.0 or recovery < 70.0:
        return "OVERREACHING", "YELLOW - Functional Overreaching. Fatigue accumulating."
    else:
        return "OPTIMAL", "GREEN - Optimal Adaptation & Peak Readiness."


def simulate_schedule(initial_state: dict = None, schedule: list[dict] = None) -> pd.DataFrame:
    """
    Multi-Day Horizon & Periodization Planner.
    Simulates cumulative fatigue compounding, recovery rebounds, and flags overtraining risks.
    """
    if initial_state is None:
        initial_state = {"fatigue": 20.0, "recovery": 80.0, "resting_hr": 55.6}

    if schedule is None:
        # Default realistic 7-day microcycle showcasing compounding fatigue and rest deload
        schedule = [
            {"day": "Day 1 (Mon)", "activity": "Normal Training", "duration": 45, "intensity": 0.65, "sleep": 7.5},
            {"day": "Day 2 (Tue)", "activity": "Hard Training", "duration": 90, "intensity": 0.85, "sleep": 7.0},
            {"day": "Day 3 (Wed)", "activity": "Hard Training", "duration": 90, "intensity": 0.90, "sleep": 6.8},
            {"day": "Day 4 (Thu)", "activity": "Max Exertion", "duration": 120, "intensity": 0.95, "sleep": 6.2},
            {"day": "Day 5 (Fri)", "activity": "Rest Day", "duration": 0, "intensity": 0.00, "sleep": 8.5},
            {"day": "Day 6 (Sat)", "activity": "Normal Training", "duration": 60, "intensity": 0.70, "sleep": 8.0},
            {"day": "Day 7 (Sun)", "activity": "Rest Day", "duration": 0, "intensity": 0.00, "sleep": 8.5},
        ]

    curr_fatigue = initial_state["fatigue"]
    curr_recovery = initial_state["recovery"]
    consecutive_hard_days = 0
    records = []

    for entry in schedule:
        dur = entry.get("duration", 0)
        inten = entry.get("intensity", 0.0)
        sleep = entry.get("sleep", 7.5)
        activity = entry.get("activity", "Custom")

        if dur >= 60 and inten >= 0.75:
            consecutive_hard_days += 1
        elif dur == 0:
            consecutive_hard_days = 0

        # Step twin state forward
        res = simulate_single_step(
            current_fatigue=curr_fatigue,
            current_recovery=curr_recovery,
            sleep_hours=sleep,
            duration=dur,
            intensity=inten
        )

        risk_level, risk_desc = assess_overtraining_risk(res["predicted_fatigue"], res["predicted_recovery"], consecutive_hard_days)

        records.append({
            "Day": entry.get("day", f"Day {len(records) + 1}"),
            "Activity": activity,
            "Sleep (h)": sleep,
            "Duration (m)": dur,
            "Intensity": inten,
            "Daily Load": res["daily_load"],
            "Fatigue (%)": res["predicted_fatigue"],
            "Recovery (%)": res["predicted_recovery"],
            "Resting HR": res["predicted_resting_hr"],
            "Performance": res["predicted_performance"],
            "Status": risk_level
        })

        # Roll predicted state into tomorrow's baseline
        curr_fatigue = res["predicted_fatigue"]
        curr_recovery = res["predicted_recovery"]

    return pd.DataFrame(records)


def print_schedule_report(df_schedule: pd.DataFrame):
    """Prints a structured periodization analysis report to console."""
    print("\n" + "=" * 105)
    print("                      TWINATHLETE: MULTI-DAY HORIZON & PERIODIZATION REPORT")
    print("=" * 105)

    headers = ["Day", "Activity", "Sleep", "Duration", "Intensity", "Load", "Fatigue", "Recovery", "RHR", "Perf", "Status"]
    row_fmt = "{:13s} | {:16s} | {:5.1f}h | {:8d}m | {:9.2f} | {:5.1f} | {:7.1f}% | {:8.1f}% | {:4.1f} | {:5.1f} | {}"

    print(row_fmt.replace(".1f", "s").replace("d", "s").replace(".2f", "s").format(*headers))
    print("-" * 105)

    for _, row in df_schedule.iterrows():
        status_tag = f"[{row['Status']}]"
        print(row_fmt.format(
            row["Day"],
            row["Activity"],
            row["Sleep (h)"],
            row["Duration (m)"],
            row["Intensity"],
            row["Daily Load"],
            row["Fatigue (%)"],
            row["Recovery (%)"],
            row["Resting HR"],
            row["Performance"],
            status_tag
        ))

    print("=" * 105)
    print("PERIODIZATION METRICS & INSIGHTS:")
    print(f"  * Total Scheduled Workload : {df_schedule['Daily Load'].sum():.1f} load units")
    print(f"  * Peak Simulated Fatigue   : {df_schedule['Fatigue (%)'].max():.1f}%")
    print(f"  * Minimum Recovery State   : {df_schedule['Recovery (%)'].min():.1f}%")
    print(f"  * Average Readiness Score  : {df_schedule['Performance'].mean():.1f} / 100")
    
    high_risks = (df_schedule["Status"] == "HIGH RISK").sum()
    if high_risks > 0:
        print(f"  * [ALERT] {high_risks} session(s) flagged for HIGH OVERTRAINING RISK! Insert deload or prioritize sleep.")
    else:
        print("  * [OPTIMAL] Cycle balanced: No dangerous overtraining states detected.")
    print("=" * 105 + "\n")


if __name__ == "__main__":
    # 1. Single Scenario Quick Check
    print("\n--- Testing Single Scenario What-If Query ---")
    res = simulate_scenario(current_resting_hr=56.0, planned_sleep=8.0, scenario_type="Hard Training", current_fatigue=15.0, current_recovery=85.0)
    print(f"[{res['scenario']}] -> Perf: {res['predicted_performance']} | Fatigue: {res['predicted_fatigue']}% | Recovery: {res['predicted_recovery']}% | RHR: {res['predicted_resting_hr']} bpm")

    # 2. Multi-Day Horizon & Periodization Schedule Simulation
    schedule_df = simulate_schedule()
    print_schedule_report(schedule_df)
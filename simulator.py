"""
Root-level backward compatibility shim for simulator.
Safely re-exports from twin.simulator with lazy model resolution.
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_FATIGUE_PATH = os.path.join(BASE_DIR, "twin_fatigue_model.pkl")
if not os.path.exists(MODEL_FATIGUE_PATH):
    _alt_f = os.path.join(BASE_DIR, "ml", "models", "twin_fatigue_model.pkl")
    if os.path.exists(_alt_f):
        MODEL_FATIGUE_PATH = _alt_f

MODEL_RECOVERY_PATH = os.path.join(BASE_DIR, "twin_recovery_model.pkl")
if not os.path.exists(MODEL_RECOVERY_PATH):
    _alt_r = os.path.join(BASE_DIR, "ml", "models", "twin_recovery_model.pkl")
    if os.path.exists(_alt_r):
        MODEL_RECOVERY_PATH = _alt_r

try:
    from twin.simulator import *
    from twin.simulator import (
        MODEL_FATIGUE,
        MODEL_RECOVERY,
        model_fatigue,
        model_recovery,
        FEATURES,
        WORKOUT_PRESETS,
        simulate_single_step,
        simulate_scenario,
        simulate_schedule,
        assess_overtraining_risk,
        reload_models,
    )
except Exception as e:
    print(f"[simulator shim] Notice: twin.simulator import error: {e}")
    MODEL_FATIGUE = None
    MODEL_RECOVERY = None
    model_fatigue = None
    model_recovery = None
    FEATURES = ["prev_fatigue", "prev_recovery", "sleep_hours", "workout_duration_min", "workout_intensity", "daily_load"]
    WORKOUT_PRESETS = {}

    def simulate_single_step(*args, **kwargs):
        return {
            "daily_load": 0.0,
            "predicted_fatigue": 30.0,
            "predicted_recovery": 80.0,
            "predicted_resting_hr": 55.0,
            "predicted_performance": 75.0,
            "inference_mode": "fallback",
        }

    def reload_models():
        pass

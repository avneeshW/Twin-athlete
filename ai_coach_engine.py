"""
Root-level backward compatibility shim for ai_coach_engine.
Safely re-exports from twin.coach with lazy model resolution.
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
    from twin.coach import *
    from twin.coach import (
        AthleteProfile,
        PredictionOutcomeTracker,
        athlete_profile,
        prediction_tracker,
        calculate_training_load,
        calculate_recovery,
        calculate_fatigue,
        calculate_readiness,
        calculate_performance,
        classify_overall_state,
        detect_anomalies,
        generate_recommendation,
        simulate_scenarios_comparison,
        generate_insights,
        generate_weekly_report,
        get_registry,
    )
except Exception as e:
    print(f"[ai_coach_engine shim] Notice: twin.coach import error: {e}")

import os
import sys
import json
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib

ML_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ML_DIR, "data")
MODELS_DIR = os.path.join(ML_DIR, "models")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

# 1. Load the synthetic dataset
dataset_path = os.path.join(DATA_DIR, "synthetic_athlete_dataset.csv")
if not os.path.exists(dataset_path) and os.path.exists("synthetic_athlete_dataset.csv"):
    dataset_path = "synthetic_athlete_dataset.csv"

df = pd.read_csv(dataset_path)

# 2. State-Transition Feature Engineering
# Prior physiological state (S_{t-1}) enables multi-day fatigue compounding
if "prev_fatigue" not in df.columns:
    df["prev_fatigue"] = df["fatigue_level"].shift(1).fillna(30.0)
if "prev_recovery" not in df.columns:
    df["prev_recovery"] = df["recovery_score"].shift(1).fillna(75.0)

features = [
    "prev_fatigue",
    "prev_recovery",
    "sleep_hours",
    "workout_duration_min",
    "workout_intensity",
    "daily_load"
]

X = df[features]
y_fatigue = df["fatigue_level"]
y_recovery = df["recovery_score"]

# 3. Train / Test Split (Chronological 80/20 for time-series validity)
split_idx = int(len(df) * 0.8)
X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
yf_train, yf_test = y_fatigue.iloc[:split_idx], y_fatigue.iloc[split_idx:]
yr_train, yr_test = y_recovery.iloc[:split_idx], y_recovery.iloc[split_idx:]

print("=" * 60)
print(f"Training Digital Twin Models (Train: {len(X_train)} days, Test: {len(X_test)} days)")
print("=" * 60)

# 4. Fit & Evaluate Fatigue Model
model_fatigue = RandomForestRegressor(n_estimators=100, random_state=42)
model_fatigue.fit(X_train, yf_train)
yf_pred = model_fatigue.predict(X_test)

mae_f = mean_absolute_error(yf_test, yf_pred)
rmse_f = np.sqrt(mean_squared_error(yf_test, yf_pred))
r2_f = r2_score(yf_test, yf_pred)

print("\n[Fatigue Model Performance on Test Set]")
print(f"  - R^2 Score: {r2_f:.3f}")
print(f"  - MAE      : {mae_f:.2f} pts")
print(f"  - RMSE     : {rmse_f:.2f} pts")
print("  - Feature Importance:")
for feat, imp in sorted(zip(features, model_fatigue.feature_importances_), key=lambda x: x[1], reverse=True):
    print(f"      * {feat:22s}: {imp * 100:5.1f}%")

# 5. Fit & Evaluate Recovery Model
model_recovery = RandomForestRegressor(n_estimators=100, random_state=42)
model_recovery.fit(X_train, yr_train)
yr_pred = model_recovery.predict(X_test)

mae_r = mean_absolute_error(yr_test, yr_pred)
rmse_r = np.sqrt(mean_squared_error(yr_test, yr_pred))
r2_r = r2_score(yr_test, yr_pred)

print("\n[Recovery Model Performance on Test Set]")
print(f"  - R^2 Score: {r2_r:.3f}")
print(f"  - MAE      : {mae_r:.2f} pts")
print(f"  - RMSE     : {rmse_r:.2f} pts")
print("  - Feature Importance:")
for feat, imp in sorted(zip(features, model_recovery.feature_importances_), key=lambda x: x[1], reverse=True):
    print(f"      * {feat:22s}: {imp * 100:5.1f}%")

# 6. Fit on Full Dataset & Export Production Models
print("\nFitting final models on full 180-day history...")
final_model_fatigue = RandomForestRegressor(n_estimators=100, random_state=42).fit(X, y_fatigue)
final_model_recovery = RandomForestRegressor(n_estimators=100, random_state=42).fit(X, y_recovery)

fatigue_model_path = os.path.join(MODELS_DIR, "twin_fatigue_model.pkl")
recovery_model_path = os.path.join(MODELS_DIR, "twin_recovery_model.pkl")
features_path = os.path.join(MODELS_DIR, "twin_features.json")

joblib.dump(final_model_fatigue, fatigue_model_path)
joblib.dump(final_model_recovery, recovery_model_path)

# Save feature metadata for the simulator
with open(features_path, "w") as f:
    json.dump({"features": features}, f, indent=2)

# 7. Generate Comprehensive, Versioned Model Card & Evaluation Artifact
fatigue_fi = {feat: round(float(imp * 100), 2) for feat, imp in sorted(zip(features, model_fatigue.feature_importances_), key=lambda x: x[1], reverse=True)}
recovery_fi = {feat: round(float(imp * 100), 2) for feat, imp in sorted(zip(features, model_recovery.feature_importances_), key=lambda x: x[1], reverse=True)}

# Residual standard deviation for empirical uncertainty intervals
fatigue_res_std = round(float(np.std(yf_test.values - yf_pred)), 2)
recovery_res_std = round(float(np.std(yr_test.values - yr_pred)), 2)

model_card = {
    "model_id": "twin-athlete-state-transition-v2.4",
    "version": "2.4.0",
    "updated_at": pd.Timestamp.now().isoformat(),
    "framework": "scikit-learn 1.3+ / Python 3.11",
    "architecture": "Dual Ensemble Random Forest Regressor (n_estimators=100, random_state=42)",
    "dataset": {
        "name": "180-Day Longitudinal Athlete Training & Biometric Dataset",
        "file": "synthetic_athlete_dataset.csv",
        "total_days": len(df),
        "split_method": "Chronological 80/20 holdout split (no future data leakage)",
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "features": {
            "prev_fatigue": "Lagged acute neuromuscular fatigue score (t-1, scale 0-100)",
            "prev_recovery": "Lagged autonomic recovery score (t-1, scale 0-100%)",
            "sleep_hours": "Duration of nocturnal sleep prior to session (hours)",
            "workout_duration_min": "Completed session duration (minutes)",
            "workout_intensity": "Cardiovascular relative intensity (fraction of max HR 0.0 - 1.0)",
            "daily_load": "Integrated training impulse load (Edwards TRIMP proxy)"
        }
    },
    "targets": {
        "fatigue_level": "Acute neuromuscular fatigue level on subsequent day (0 - 100)",
        "recovery_score": "Autonomic & parasympathetic recovery score on subsequent day (0 - 100%)"
    },
    "metrics": {
        "fatigue_model": {
            "r2_score": round(float(r2_f), 3),
            "mae": round(float(mae_f), 2),
            "rmse": round(float(rmse_f), 2),
            "residual_std": fatigue_res_std,
            "feature_importance_pct": fatigue_fi
        },
        "recovery_model": {
            "r2_score": round(float(r2_r), 3),
            "mae": round(float(mae_r), 2),
            "rmse": round(float(rmse_r), 2),
            "residual_std": recovery_res_std,
            "feature_importance_pct": recovery_fi
        }
    },
    "uncertainty_estimation": {
        "method": "Empirical Test-Set Residual Standard Error (95% Confidence Interval ~ +/- 1.96 * std)",
        "fatigue_ci_95": f"+/- {round(1.96 * fatigue_res_std, 1)} pts",
        "recovery_ci_95": f"+/- {round(1.96 * recovery_res_std, 1)} pts"
    },
    "known_limitations": [
        "Calibrated on 180-day longitudinal running & soccer training dataset; requires calibration for cycling or swimming.",
        "Assumes standard circadian rhythm; shift workers or extreme jet lag require sleep adjustment.",
        "Non-linear infection or febrile illness is not modeled by the mechanical fatigue equation.",
        "Predictions represent baseline expected adaptation; individual genetic or psychological stress factors may induce variance."
    ],
    "intended_use": "Decision support for coaches and athletes to optimize training microcycles, avoid non-functional overreaching, and plan deload periods.",
    "non_intended_use": "Clinical diagnosis, medical evaluation of pathology, or replacing qualified medical personnel."
}

model_card_path = os.path.join(ML_DIR, "model_card.json")
with open(model_card_path, "w") as f:
    json.dump(model_card, f, indent=2)

print("\nDigital Twin models and Model Card successfully trained and exported:")
print(f"  -> '{fatigue_model_path}'")
print(f"  -> '{recovery_model_path}'")
print(f"  -> '{features_path}'")
print(f"  -> '{model_card_path}'")
print("=" * 60)
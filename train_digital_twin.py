import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib
import json

# 1. Load the synthetic dataset
df = pd.read_csv("synthetic_athlete_dataset.csv")

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

joblib.dump(final_model_fatigue, "twin_fatigue_model.pkl")
joblib.dump(final_model_recovery, "twin_recovery_model.pkl")

# Save feature metadata for the simulator
with open("twin_features.json", "w") as f:
    json.dump({"features": features}, f, indent=2)

print("\nDigital Twin models successfully trained and exported:")
print("  -> 'twin_fatigue_model.pkl'")
print("  -> 'twin_recovery_model.pkl'")
print("  -> 'twin_features.json'")
print("=" * 60)
import os
import sys
import argparse
import numpy as np
import pandas as pd

# ==============================================================================
# USER-DEFINED ATHLETE CONFIGURATION
# Adjust these values directly or pass via CLI: python generate_data.py --sleep 8.0
# ==============================================================================
DEFAULT_DAYS = 180
DEFAULT_USER_SLEEP_HOURS = 7.5      # Target baseline sleep in hours
DEFAULT_SLEEP_VARIABILITY = 0.9     # Realistic day-to-day fluctuation (+/- hours)
# ==============================================================================


def generate_athlete_dataset(
    days: int = DEFAULT_DAYS,
    sleep_hours: float | list | str | None = DEFAULT_USER_SLEEP_HOURS,
    sleep_variability: float = DEFAULT_SLEEP_VARIABILITY,
    output_csv: str = "synthetic_athlete_dataset.csv",
    seed: int = 42,
    **kwargs
) -> pd.DataFrame:
    """
    Generates synthetic athlete longitudinal data with user-defined sleeping hours.
    
    Args:
        days: Number of days to simulate (default: 180).
        sleep_hours:
            - float / int (e.g. 7.5, 8.0): Samples daily sleep around the target baseline.
            - numeric string (e.g. "7.5", "8"): Converted to float target baseline.
            - list / np.ndarray: Exact daily sleep hours.
            - str (file path): Path to external CSV containing 'sleep_hours' column.
        sleep_variability: Standard deviation for daily variation around target sleep.
        output_csv: Target output file path.
        seed: Random seed for reproducibility.
    """
    if days < 1:
        raise ValueError("Parameter 'days' must be at least 1.")

    # Accept user_sleep as alias for backward compatibility with backend
    if "user_sleep" in kwargs and kwargs["user_sleep"] is not None:
        sleep_hours = kwargs["user_sleep"]

    rng = np.random.default_rng(seed)
    date_range = pd.date_range(start="2026-01-01", periods=days, freq="D")

    # 1. Resolve User-Defined Sleeping Data
    # Check if a string is actually a numeric value (e.g. "8.0", "7.5")
    if isinstance(sleep_hours, str):
        try:
            sleep_hours = float(sleep_hours.strip())
        except ValueError:
            pass  # It's an external file path

    if isinstance(sleep_hours, str):
        # Load from an external CSV file (e.g., wearable export)
        if not os.path.exists(sleep_hours):
            raise FileNotFoundError(f"Sleep data file '{sleep_hours}' does not exist.")

        print(f"Loading sleep data from external file: '{sleep_hours}'...")
        user_df = pd.read_csv(sleep_hours)
        if "sleep_hours" not in user_df.columns:
            raise ValueError(f"File '{sleep_hours}' must contain a 'sleep_hours' column.")

        clean_series = pd.to_numeric(user_df["sleep_hours"], errors="coerce").dropna()
        if len(clean_series) == 0:
            daily_sleep = np.full(days, DEFAULT_USER_SLEEP_HOURS, dtype=float)
        else:
            daily_sleep = clean_series.values[:days]
            if len(daily_sleep) < days:
                pad_mean = float(np.mean(daily_sleep))
                pad_count = days - len(daily_sleep)
                daily_sleep = np.pad(daily_sleep, (0, pad_count), constant_values=pad_mean)
        daily_sleep = np.clip(np.array(daily_sleep, dtype=float), 3.0, 12.0)

    elif isinstance(sleep_hours, (list, np.ndarray)):
        # Exact daily list provided by the user
        sleep_array = np.array(sleep_hours, dtype=float)
        if len(sleep_array) == 0:
            daily_sleep = np.full(days, DEFAULT_USER_SLEEP_HOURS, dtype=float)
        elif len(sleep_array) < days:
            mean_val = float(np.mean(sleep_array))
            daily_sleep = np.pad(sleep_array, (0, days - len(sleep_array)), constant_values=mean_val)
        else:
            daily_sleep = sleep_array[:days]
        daily_sleep = np.clip(daily_sleep, 3.0, 12.0)

    else:
        # Scalar target baseline (e.g. 7.5 or 8.0)
        target_sleep = float(sleep_hours) if sleep_hours is not None else DEFAULT_USER_SLEEP_HOURS
        print(f"Generating dataset using user-defined baseline sleep: {target_sleep:.1f} hrs (+/- {sleep_variability:.1f}h variability)")
        daily_sleep = np.clip(
            rng.normal(loc=target_sleep, scale=sleep_variability, size=days), 
            4.0, 10.5
        )

    # 2. Workout Generation
    workout_duration_min = rng.choice([0, 30, 45, 60, 90, 120], size=days, p=[0.15, 0.15, 0.25, 0.25, 0.15, 0.05])
    workout_intensity = np.where(
        workout_duration_min == 0, 
        0.0, 
        np.clip(rng.normal(loc=0.65, scale=0.18, size=days), 0.3, 1.0)
    )
    workout_intensity = np.round(workout_intensity, 2)
    daily_load = np.round(workout_duration_min * workout_intensity, 1)

    # 3. Simulate Accumulative Fatigue & Recovery Dynamics
    fatigue = np.zeros(days)
    recovery = np.zeros(days)
    performance_score = np.zeros(days)
    avg_heart_rate = np.zeros(days, dtype=int)
    resting_hr = np.zeros(days)
    prev_fatigue = np.zeros(days)
    prev_recovery = np.zeros(days)

    max_hr = 190.0
    fatigue[0] = 30.0
    recovery[0] = 75.0
    resting_hr[0] = 58.0
    prev_fatigue[0] = 30.0
    prev_recovery[0] = 75.0

    # Day 0 initialization
    readiness_0 = (recovery[0] * 0.6) + ((100.0 - fatigue[0]) * 0.4)
    performance_score[0] = np.clip(readiness_0 + rng.normal(0, 2.0), 10.0, 98.0)
    if workout_duration_min[0] > 0:
        avg_heart_rate[0] = int(round(resting_hr[0] + workout_intensity[0] * (max_hr - resting_hr[0])))
    else:
        avg_heart_rate[0] = 0

    for t in range(1, days):
        prev_fatigue[t] = fatigue[t-1]
        prev_recovery[t] = recovery[t-1]

        # Fatigue accumulates from workout load and decays with sleep
        fatigue[t] = np.clip(
            0.75 * fatigue[t-1] + (daily_load[t] * 0.45) - (daily_sleep[t] * 2.2),
            5.0, 98.0
        )
        
        # Recovery improves with sleep and drops under prior fatigue
        recovery[t] = np.clip(
            (daily_sleep[t] * 11.5) - (fatigue[t-1] * 0.35) + rng.normal(0, 2.5),
            10.0, 99.0
        )
        
        # Readiness performance score
        readiness = (recovery[t] * 0.6) + ((100.0 - fatigue[t]) * 0.4)
        performance_score[t] = np.clip(readiness + rng.normal(0, 2.0), 10.0, 98.0)
        
        # Morning resting HR reflects recovery state
        rhr_raw = 52.0 + ((100.0 - recovery[t]) * 0.18) + rng.normal(0, 1.0)
        resting_hr[t] = round(float(np.clip(rhr_raw, 40.0, 95.0)), 1)
        
        # Training HR reflects workout intensity
        if workout_duration_min[t] > 0:
            avg_heart_rate[t] = int(round(resting_hr[t] + workout_intensity[t] * (max_hr - resting_hr[t])))
        else:
            avg_heart_rate[t] = 0

    # 4. Construct Structured DataFrame
    df = pd.DataFrame({
        "date": date_range.strftime("%Y-%m-%d"),
        "prev_fatigue": np.round(prev_fatigue, 1),
        "prev_recovery": np.round(prev_recovery, 1),
        "sleep_hours": np.round(daily_sleep, 1),
        "workout_duration_min": workout_duration_min,
        "workout_intensity": workout_intensity,
        "daily_load": daily_load,
        "resting_hr": np.round(resting_hr, 1),
        "avg_training_hr": avg_heart_rate,
        "fatigue_level": np.round(fatigue, 1),
        "recovery_score": np.round(recovery, 1),
        "performance_score": np.round(performance_score, 1)
    })

    # Ensure parent output directory exists
    out_dir = os.path.dirname(output_csv)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    df.to_csv(output_csv, index=False)
    print(f"Synthetic dataset successfully created: '{output_csv}'")
    print(df.head())
    return df


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic athlete training & physiological dataset.")
    parser.add_argument("--sleep", type=float, default=None, 
                        help=f"User-defined baseline sleep in hours (e.g. 8.0, default: {DEFAULT_USER_SLEEP_HOURS})")
    parser.add_argument("--sleep-file", type=str, default=None, 
                        help="Path to CSV containing user's recorded 'sleep_hours' column")
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS, 
                        help=f"Total days to generate (default: {DEFAULT_DAYS})")
    parser.add_argument("--variability", type=float, default=DEFAULT_SLEEP_VARIABILITY,
                        help=f"Sleep standard deviation (default: {DEFAULT_SLEEP_VARIABILITY})")
    parser.add_argument("--output", type=str, default="synthetic_athlete_dataset.csv",
                        help="Output CSV file path")

    args = parser.parse_args()

    # Determine sleep input source
    if args.sleep_file:
        sleep_source = args.sleep_file
    elif args.sleep is not None:
        sleep_source = args.sleep
    else:
        sleep_source = DEFAULT_USER_SLEEP_HOURS

    generate_athlete_dataset(
        days=args.days,
        sleep_hours=sleep_source,
        sleep_variability=args.variability,
        output_csv=args.output
    )
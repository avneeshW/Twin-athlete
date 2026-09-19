import os
import sys
import json
import time
import queue
import threading
import subprocess
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory, Response

import simulator
import generate_data
import ai_coach_engine
from telemetry_engine import engine

app = Flask(__name__, static_folder="static", static_url_path="")

# SSE Connected Client Queues & Mock Feeder Thread State
sse_clients = []
sse_clients_lock = threading.Lock()
mock_feed_running = False
mock_feed_thread = None
mock_feed_stop_event = threading.Event()


def broadcast_sse(payload: dict):
    """Pushes new telemetry packet to all connected SSE clients."""
    with sse_clients_lock:
        dead_clients = []
        for q in sse_clients:
            try:
                q.put_nowait(payload)
            except (queue.Full, Exception):
                dead_clients.append(q)
        for dead in dead_clients:
            if dead in sse_clients:
                sse_clients.remove(dead)


def run_mock_feed_worker():
    """Background simulator thread generating realistic ESP32 telemetry."""
    global mock_feed_running
    t = 0.0
    while not mock_feed_stop_event.is_set():
        t += 0.5
        # Simulate athlete HR climbing during run then stabilizing
        target_hr = 138.0 + 22.0 * np.sin(t * 0.08) + np.random.normal(0, 1.2)
        target_hr = float(np.clip(target_hr, 85.0, 185.0))

        # Tri-axial accelerometer showing running gait stride frequency (~2.8 Hz)
        stride = t * 2.8 * 2.0 * np.pi
        ax = float(np.sin(stride) * 0.8 + np.random.normal(0, 0.15))
        ay = float(np.cos(stride) * 1.6 + 1.1 + np.random.normal(0, 0.2))  # Vertical impact + gravity
        az = float(np.sin(stride * 0.5) * 0.5 + np.random.normal(0, 0.15))

        spo2 = float(np.clip(98.0 + np.random.normal(0, 0.5), 94.0, 99.0))

        packet = {
            "device_id": "ESP32-SIMULATED-RUNNER",
            "heart_rate": round(target_hr, 1),
            "spo2": round(spo2, 1),
            "ax": round(ax, 2),
            "ay": round(ay, 2),
            "az": round(az, 2),
            "battery": 94,
            "timestamp": time.time()
        }

        analyzed = engine.process_telemetry(packet)
        broadcast_sse(analyzed)
        mock_feed_stop_event.wait(0.5)


def start_mock_feed():
    global mock_feed_running, mock_feed_thread, mock_feed_stop_event
    if not mock_feed_running:
        mock_feed_stop_event.clear()
        mock_feed_running = True
        mock_feed_thread = threading.Thread(target=run_mock_feed_worker, daemon=True)
        mock_feed_thread.start()


def stop_mock_feed():
    global mock_feed_running, mock_feed_stop_event, mock_feed_thread
    if mock_feed_running:
        mock_feed_stop_event.set()
        mock_feed_running = False
        if mock_feed_thread and mock_feed_thread.is_alive():
            mock_feed_thread.join(timeout=1.0)


@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder or "static", "index.html")


@app.route("/api/dashboard-data", methods=["GET"])
def get_dashboard_data():
    """Returns telemetry data matching the athlete cockpit overview."""
    timeframe = request.args.get("timeframe", "1H").upper()
    if timeframe not in ["1M", "10M", "30M", "1H", "6H", "24H"]:
        timeframe = "1H"

    latest = engine.get_latest_state()
    is_live = (engine.last_packet_time is not None and (time.time() - engine.last_packet_time < 4.0)) or mock_feed_running

    if is_live and len(engine.history_hr) >= 10:
        hr_points = list(engine.history_hr)
        x_axis = list(engine.history_ax)
        y_axis = list(engine.history_ay)
        z_axis = list(engine.history_az)
        x_labels = ["0", "10", "20", "30", "40", "50", "60"]
        time_unit = "seconds" if timeframe == "1M" else "minutes"
    else:
        rng = np.random.default_rng(42 if timeframe == "1H" else (101 if timeframe == "1M" else (202 if timeframe == "10M" else 303)))
        if timeframe == "1M":
            x_labels = ["0", "10", "20", "30", "40", "50", "60"]
            time_unit = "seconds"
            time_pts = 40
            t_arr = np.linspace(0, 4 * np.pi, time_pts)
            hr_points = [round(float(v)) for v in 156 + np.sin(t_arr) * 3.5 + rng.normal(0, 0.8, time_pts)]
            x_axis = [round(float(v), 2) for v in np.sin(t_arr * 2.5) * 1.8 + rng.normal(0, 0.25, time_pts)]
            y_axis = [round(float(v), 2) for v in np.cos(t_arr * 2.5) * 2.2 + 0.8 + rng.normal(0, 0.3, time_pts)]
            z_axis = [round(float(v), 2) for v in np.sin(t_arr * 3.0) * 1.4 - 0.5 + rng.normal(0, 0.25, time_pts)]
        elif timeframe == "10M":
            x_labels = ["0", "2", "4", "6", "8", "10"]
            time_unit = "minutes"
            time_pts = 35
            t_arr = np.linspace(0, 5 * np.pi, time_pts)
            # Interval bursts between 135 and 175 BPM
            hr_points = [round(float(v)) for v in 155 + np.sin(t_arr * 1.8) * 18 + rng.normal(0, 1.2, time_pts)]
            x_axis = [round(float(v), 2) for v in np.sin(t_arr * 2.0) * 2.4 + rng.normal(0, 0.4, time_pts)]
            y_axis = [round(float(v), 2) for v in np.cos(t_arr * 1.6) * 2.8 + 0.5 + rng.normal(0, 0.4, time_pts)]
            z_axis = [round(float(v), 2) for v in np.sin(t_arr * 2.2) * 1.6 - 0.6 + rng.normal(0, 0.35, time_pts)]
        elif timeframe == "30M":
            x_labels = ["0", "5", "10", "15", "20", "25", "30"]
            time_unit = "minutes"
            time_pts = 32
            # Steady tempo run progression
            base_curve = np.linspace(125, 168, time_pts)
            hr_points = [round(float(v)) for v in base_curve + np.sin(np.linspace(0, 4*np.pi, time_pts)) * 4.5 + rng.normal(0, 1.0, time_pts)]
            t_arr = np.linspace(0, 6 * np.pi, time_pts)
            x_axis = [round(float(v), 2) for v in np.sin(t_arr * 1.4) * 1.5 + rng.normal(0, 0.3, time_pts)]
            y_axis = [round(float(v), 2) for v in np.cos(t_arr * 1.1) * 1.7 + 0.5 + rng.normal(0, 0.35, time_pts)]
            z_axis = [round(float(v), 2) for v in np.sin(t_arr * 1.8) * 1.1 - 0.4 + rng.normal(0, 0.3, time_pts)]
        else:  # 1H default (exact screenshot profile)
            x_labels = ["0", "10", "20", "30", "40", "50", "60"]
            time_unit = "minutes"
            hr_points = [102, 120, 142, 150, 162, 168, 160, 164, 156, 158, 162, 166, 172, 170, 168, 174, 164, 162, 158, 154, 156, 160, 152, 148, 156, 146]
            time_pts = 35
            t_arr = np.linspace(0, 6 * np.pi, time_pts)
            x_axis = [round(float(v), 2) for v in np.sin(t_arr * 1.5) * 1.6 + rng.normal(0, 0.45, time_pts)]
            y_axis = [round(float(v), 2) for v in np.cos(t_arr * 1.2) * 1.8 + 0.6 + rng.normal(0, 0.5, time_pts)]
            z_axis = [round(float(v), 2) for v in np.sin(t_arr * 2.0) * 1.2 - 0.4 + rng.normal(0, 0.4, time_pts)]

    vitals = latest["vitals"] if is_live else {
        "heart_rate": {"value": 156, "unit": "BPM", "trend": "+8%", "status": "High Intensity", "color": "red", "zone_info": {"zone": 4, "name": "Zone 4: Anaerobic Threshold", "label": "High Intensity"}},
        "spo2": {"value": 98, "unit": "%", "status": "Normal", "color": "green"},
        "activity": {"value": "Running", "unit": "", "subtext": "Team Training", "status": "Running", "color": "purple"},
        "acceleration": {"value": 2.8, "unit": "g", "trend": "+22%", "status": "High Load", "color": "yellow", "axes": {"x": 0.4, "y": 1.9, "z": -0.7}},
        "cadence": {"value": 168, "unit": "SPM", "steps": 1240}
    }

    now_str = time.strftime("%d %b %Y • %I:%M %p")
    if is_live:
        recent_session = latest["recent_session"].copy()
        recent_session.setdefault("datetime", now_str)
    else:
        recent_session = {
            "title": "Recent Training Sessions",
            "activity": "Running",
            "datetime": "7 Oct 2025 • 10:24 AM",
            "duration": "60 min",
            "status": "Completed",
            "avg_heart_rate": 152,
            "max_heart_rate": 182,
            "calories": 680
        }

    twin_status = latest["twin_status"].copy() if (is_live and "twin_status" in latest) else {
        "fatigue_label": "Moderate",
        "fatigue_value": 38.0,
        "recovery_label": "78%",
        "recovery_value": 78.0,
        "performance_label": "High",
        "performance_value": 85.0
    }

    readiness_val = ai_coach_engine.calculate_readiness(
        recovery=float(twin_status.get("recovery_value", 78.0)),
        fatigue=float(twin_status.get("fatigue_value", 38.0))
    )
    st_key, st_label, st_color = ai_coach_engine.classify_overall_state(
        readiness=readiness_val,
        fatigue=float(twin_status.get("fatigue_value", 38.0)),
        recovery=float(twin_status.get("recovery_value", 78.0))
    )
    twin_status["readiness_value"] = readiness_val
    twin_status["readiness_label"] = f"{int(round(readiness_val))}%"
    twin_status["overall_state_key"] = st_key
    twin_status["overall_state_label"] = st_label
    twin_status["overall_state_color"] = st_color

    return jsonify({
        "athlete": {
            "name": "Daniel Saji",
            "greeting": "Good Morning, Daniel!",
            "subtext": "Here's your current performance overview.",
            "date": time.strftime("%a, %d %b %Y"),
            "time": time.strftime("%I:%M %p")
        },
        "device": {
            "connected": is_live,
            "mock_mode": mock_feed_running,
            "device_id": engine.device_id,
            "battery": engine.battery_level,
            "packet_count": engine.packet_count
        },
        "vitals": vitals,
        "charts": {
            "heart_rate": {
                "x_labels": x_labels,
                "time_unit": time_unit,
                "y_labels": [20, 60, 100, 140, 180],
                "points": hr_points
            },
            "movement": {
                "x_labels": x_labels,
                "time_unit": time_unit,
                "y_labels": [-4, -2, 0, 2, 4],
                "x": x_axis,
                "y": y_axis,
                "z": z_axis
            }
        },
        "recent_session": recent_session,
        "twin_status": twin_status
    })


@app.route("/api/simulate-step", methods=["POST"])
def api_simulate_step():
    """Runs prospective simulation for What-If Simulator."""
    data = request.get_json(silent=True) or {}
    intensity_mode = data.get("intensity_mode", "Moderate")

    # Map intensity mode to preset physiological load
    if intensity_mode == "Low":
        default_dur, default_int, default_sleep = 30, 0.40, 8.2
    elif intensity_mode == "High":
        default_dur, default_int, default_sleep = 90, 0.90, 7.0
    else:  # Moderate
        default_dur, default_int, default_sleep = 45, 0.65, 7.5

    try:
        duration = int(data.get("duration", default_dur))
        intensity = float(data.get("intensity", default_int))
        sleep_hours = float(data.get("sleep_hours", default_sleep))
        current_fatigue = float(data.get("current_fatigue", 20.0))
        current_recovery = float(data.get("current_recovery", 82.0))
    except (ValueError, TypeError):
        duration, intensity, sleep_hours = default_dur, default_int, default_sleep
        current_fatigue, current_recovery = 20.0, 82.0

    result = simulator.simulate_single_step(
        current_fatigue=current_fatigue,
        current_recovery=current_recovery,
        sleep_hours=sleep_hours,
        duration=duration,
        intensity=intensity
    )

    pred_f = result["predicted_fatigue"]
    pred_r = result["predicted_recovery"]
    pred_p = result["predicted_performance"]

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

    return jsonify({
        "intensity_mode": intensity_mode,
        "daily_load": result["daily_load"],
        "fatigue_label": fatigue_label,
        "fatigue_value": pred_f,
        "recovery_label": f"{int(round(pred_r))}%",
        "recovery_value": pred_r,
        "performance_label": performance_label,
        "performance_value": pred_p,
        "resting_hr": result["predicted_resting_hr"],
        "simulated_workout": {
            "activity": "Running",
            "duration": f"{duration} min",
            "intensity": intensity,
            "sleep_hours": sleep_hours,
            "avg_hr": int(result["predicted_resting_hr"] + intensity * (190.0 - result["predicted_resting_hr"])),
            "calories": int(duration * intensity * 15.5 + 80)
        }
    })


@app.route("/api/simulate-schedule", methods=["POST"])
def api_simulate_schedule():
    """Multi-day periodization microcycle simulation."""
    data = request.get_json(silent=True) or {}
    default_initial = {"fatigue": 20.0, "recovery": 80.0, "resting_hr": 55.6}
    initial_state = data.get("initial_state", default_initial)

    if not isinstance(initial_state, dict):
        initial_state = default_initial
    else:
        for k, v in default_initial.items():
            if k not in initial_state:
                initial_state[k] = v
            else:
                try:
                    initial_state[k] = float(initial_state[k])
                except (ValueError, TypeError):
                    initial_state[k] = v

    schedule = data.get("schedule", None)

    try:
        results_df = simulator.simulate_schedule(initial_state=initial_state, schedule=schedule)
        days_list = results_df.to_dict(orient="records")

        summary = {
            "total_workload": round(float(results_df["Daily Load"].sum()), 1),
            "peak_fatigue": round(float(results_df["Fatigue (%)"].max()), 1),
            "min_recovery": round(float(results_df["Recovery (%)"].min()), 1),
            "avg_readiness": round(float(results_df["Performance"].mean()), 1),
            "high_risk_count": int((results_df["Status"] == "HIGH RISK").sum()),
            "overreaching_count": int((results_df["Status"] == "OVERREACHING").sum()),
            "optimal_count": int((results_df["Status"] == "OPTIMAL").sum()),
        }

        return jsonify({
            "days": days_list,
            "summary": summary
        })
    except Exception as e:
        return jsonify({"error": f"Simulation failed: {str(e)}"}), 500


# ==============================================================================
# AI DIGITAL TWIN COACH ENDPOINTS
# ==============================================================================

@app.route("/api/ai/coach-overview", methods=["GET"])
def get_ai_coach_overview():
    """
    Unified AI Coach & Digital Twin endpoint:
    Returns the persistent athlete profile, real-time digital twin state (Readiness,
    Recovery, Fatigue, Performance, Training Load, Overall State Badge), today's AI
    training recommendation with reason & diagnostic factor weights, active smart
    alerts, AI natural-language performance insights, and weekly report summary.
    """
    latest = engine.get_latest_state()
    is_live = (engine.last_packet_time is not None and (time.time() - engine.last_packet_time < 4.0)) or mock_feed_running

    history_df = None
    if os.path.exists("synthetic_athlete_dataset.csv"):
        try:
            history_df = pd.read_csv("synthetic_athlete_dataset.csv")
        except Exception:
            pass

    if is_live and "twin_status" in latest:
        fatigue = float(latest["twin_status"].get("fatigue_value", 38.0))
        recovery = float(latest["twin_status"].get("recovery_value", 78.0))
        load = float(latest.get("vitals", {}).get("acceleration", {}).get("value", 2.8) * 15.0)
    else:
        fatigue = 38.0
        recovery = 78.0
        load = 42.0

    sleep_hours = 7.8
    readiness = ai_coach_engine.calculate_readiness(recovery=recovery, fatigue=fatigue, sleep_hours=sleep_hours)
    performance = ai_coach_engine.calculate_performance(readiness=readiness, recovery=recovery)
    state_key, state_label, state_color = ai_coach_engine.classify_overall_state(readiness, fatigue, recovery)

    twin_state = {
        "readiness_score": readiness,
        "recovery_score": recovery,
        "fatigue_score": fatigue,
        "performance_score": performance,
        "training_load": load,
        "training_load_label": "Moderate" if load < 50 else ("High" if load >= 75 else "Optimal"),
        "sleep_hours": sleep_hours,
        "overall_state": {
            "key": state_key,
            "label": state_label,
            "color": state_color
        }
    }

    recommendation = ai_coach_engine.generate_recommendation(twin_state)
    alerts = ai_coach_engine.detect_anomalies({
        "daily_load": load,
        "fatigue": fatigue,
        "recovery": recovery,
        "asymmetry_pct": 14.2,
        "max_impact_g": 2.8
    }, history_df)
    insights = ai_coach_engine.generate_insights(history_df, twin_state)
    weekly_report = ai_coach_engine.generate_weekly_report(history_df)

    return jsonify({
        "athlete": ai_coach_engine.athlete_profile.to_dict(),
        "digital_twin": twin_state,
        "recommendation": recommendation,
        "smart_alerts": alerts,
        "insights": insights,
        "weekly_report": weekly_report
    })


@app.route("/api/ai/what-if-scenarios", methods=["POST"])
def api_what_if_scenarios():
    """
    Evaluates Scenario A (High), Scenario B (Moderate), Scenario C (Low),
    and user custom configuration with predicted transition and risk indicators.
    """
    data = request.get_json(silent=True) or {}
    custom_dur = int(data.get("duration", 60))
    custom_int = float(data.get("intensity", 0.65))

    latest = engine.get_latest_state()
    is_live = (engine.last_packet_time is not None and (time.time() - engine.last_packet_time < 4.0)) or mock_feed_running
    fatigue = float(latest["twin_status"]["fatigue_value"]) if (is_live and "twin_status" in latest) else 38.0
    recovery = float(latest["twin_status"]["recovery_value"]) if (is_live and "twin_status" in latest) else 78.0
    readiness = ai_coach_engine.calculate_readiness(recovery, fatigue)

    current_state = {
        "fatigue": fatigue,
        "recovery": recovery,
        "readiness": readiness,
        "sleep_hours": 7.8
    }

    results = ai_coach_engine.simulate_scenarios_comparison(
        current_state=current_state,
        custom_duration=custom_dur,
        custom_intensity=custom_int
    )
    return jsonify(results)


@app.route("/api/ai/why-recommendation", methods=["GET"])
def api_why_recommendation():
    """Returns exact diagnostic factor weights and thresholds behind the recommendation."""
    latest = engine.get_latest_state()
    is_live = (engine.last_packet_time is not None and (time.time() - engine.last_packet_time < 4.0)) or mock_feed_running
    fatigue = float(latest["twin_status"]["fatigue_value"]) if (is_live and "twin_status" in latest) else 38.0
    recovery = float(latest["twin_status"]["recovery_value"]) if (is_live and "twin_status" in latest) else 78.0
    readiness = ai_coach_engine.calculate_readiness(recovery, fatigue)
    rec = ai_coach_engine.generate_recommendation({
        "readiness": readiness,
        "fatigue": fatigue,
        "recovery": recovery,
        "sleep_hours": 7.8
    })
    return jsonify({
        "recommendation": rec,
        "weights": ai_coach_engine.READINESS_WEIGHTS,
        "factors": rec["why_factors"]
    })


@app.route("/api/ai/weekly-report", methods=["GET"])
def api_weekly_report():
    """Returns the full 7-day retrospective summary and AI natural language synthesis."""
    history_df = None
    if os.path.exists("synthetic_athlete_dataset.csv"):
        try:
            history_df = pd.read_csv("synthetic_athlete_dataset.csv")
        except Exception:
            pass
    report = ai_coach_engine.generate_weekly_report(history_df)
    return jsonify(report)


@app.route("/api/history", methods=["GET"])
def get_history():
    """Returns historical 180-day longitudinal data."""
    if not os.path.exists("synthetic_athlete_dataset.csv"):
        return jsonify({"error": "Dataset not found"}), 404

    try:
        df = pd.read_csv("synthetic_athlete_dataset.csv")
    except Exception as e:
        return jsonify({"error": f"Failed to read dataset: {str(e)}"}), 500

    # Replace any potential NaN with None for valid JSON
    clean_df = df.replace({np.nan: None})
    records = clean_df.to_dict(orient="records")

    summary = {
        "days": len(df),
        "mean_sleep": round(float(df["sleep_hours"].mean()), 2) if "sleep_hours" in df else 7.5,
        "mean_load": round(float(df["daily_load"].mean()), 1) if "daily_load" in df else 0.0,
        "mean_performance": round(float(df["performance_score"].mean()), 1) if "performance_score" in df else 75.0,
        "mean_resting_hr": round(float(df["resting_hr"].mean()), 1) if "resting_hr" in df else 55.0,
        "peak_fatigue": round(float(df["fatigue_level"].max()), 1) if "fatigue_level" in df else 0.0,
        "min_recovery": round(float(df["recovery_score"].min()), 1) if "recovery_score" in df else 100.0
    }

    return jsonify({
        "summary": summary,
        "history": records
    })


@app.route("/api/configure-sleep", methods=["POST"])
def configure_sleep():
    """Regenerates dataset using user-defined sleep and retrains digital twin models."""
    data = request.get_json(silent=True) or {}
    try:
        sleep_hours = float(data.get("sleep_hours", 7.5))
        variability = float(data.get("variability", 0.9))
        days = int(data.get("days", 180))
    except (ValueError, TypeError) as e:
        return jsonify({"success": False, "error": f"Invalid parameter: {e}"}), 400

    try:
        df = generate_data.generate_athlete_dataset(
            days=days,
            sleep_hours=sleep_hours,
            sleep_variability=variability,
            output_csv="synthetic_athlete_dataset.csv"
        )

        subprocess.run([sys.executable, "train_digital_twin.py"], check=True)

        import joblib
        simulator.model_fatigue = joblib.load("twin_fatigue_model.pkl")
        simulator.model_recovery = joblib.load("twin_recovery_model.pkl")

        return jsonify({
            "success": True,
            "message": f"Generated {days} days of data with {sleep_hours}h sleep and retrained twin models.",
            "total_days": len(df),
            "mean_sleep": round(float(df["sleep_hours"].mean()), 2)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/esp32/telemetry", methods=["POST"])
def ingest_esp32_telemetry():
    """
    Ingests live telemetry packet from ESP32 wearable via HTTP POST.
    Payload expected:
    {
        "device_id": "ESP32-ATHLETE-01",
        "heart_rate": 142,
        "spo2": 98,
        "ax": 0.42,
        "ay": 1.18,
        "az": 0.05,
        "battery": 88
    }
    """
    payload = request.get_json(force=True, silent=True)
    if not payload or not isinstance(payload, dict):
        return jsonify({"error": "Invalid or missing JSON object payload"}), 400

    analyzed_state = engine.process_telemetry(payload)
    broadcast_sse(analyzed_state)
    return jsonify({
        "status": "success",
        "packet_count": engine.packet_count,
        "device_id": engine.device_id,
        "processed_hr": analyzed_state["vitals"]["heart_rate"]["value"],
        "hr_zone": analyzed_state["vitals"]["heart_rate"]["status"],
        "activity": analyzed_state["vitals"]["activity"]["value"]
    }), 200


@app.route("/api/stream", methods=["GET"])
def sse_stream():
    """
    Server-Sent Events (SSE) live telemetry stream.
    Pushes low-latency biometric packets directly to the connected browser cockpit.
    """
    def event_generator():
        q = queue.Queue(maxsize=40)
        with sse_clients_lock:
            sse_clients.append(q)
        try:
            # Emit immediate initial state
            initial_packet = engine.get_latest_state()
            yield f"data: {json.dumps(initial_packet)}\n\n"

            while True:
                try:
                    msg = q.get(timeout=1.0)
                    yield f"data: {json.dumps(msg)}\n\n"
                except queue.Empty:
                    # Periodic heartbeat / status check if no packet arrived in 1s
                    heartbeat_state = engine.get_latest_state()
                    yield f"data: {json.dumps(heartbeat_state)}\n\n"
        finally:
            with sse_clients_lock:
                if q in sse_clients:
                    sse_clients.remove(q)

    return Response(
        event_generator(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive"
        }
    )


@app.route("/api/esp32/status", methods=["GET"])
def get_esp32_status():
    """Returns hardware connection diagnostics and streaming mode."""
    now = time.time()
    last_seen = round(now - engine.last_packet_time, 1) if engine.last_packet_time else None
    connected = (last_seen is not None and last_seen < 4.0)

    return jsonify({
        "device_id": engine.device_id,
        "connected": connected,
        "status": "Streaming (Live ESP32)" if connected else ("Simulated Feed (Active)" if mock_feed_running else "Waiting for ESP32"),
        "last_seen_sec": last_seen,
        "packet_count": engine.packet_count,
        "battery": engine.battery_level,
        "mock_mode": mock_feed_running
    })


@app.route("/api/esp32/mock-feed", methods=["POST", "GET"])
def handle_mock_feed():
    """Controls the built-in background ESP32 simulator feed for bench testing."""
    global mock_feed_running
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        action = data.get("action", "toggle")

        if action == "start":
            start_mock_feed()
        elif action == "stop":
            stop_mock_feed()
        else:  # toggle
            if mock_feed_running:
                stop_mock_feed()
            else:
                start_mock_feed()

    return jsonify({
        "mock_running": mock_feed_running,
        "packet_count": engine.packet_count
    })


@app.route("/api/session/reset", methods=["POST"])
def reset_session():
    """Resets the active workout metrics and step counter."""
    engine.reset_session()
    return jsonify({
        "success": True,
        "message": "Workout session has been reset."
    })


@app.route("/api/status", methods=["GET"])
def get_status():
    models_ready = os.path.exists("twin_fatigue_model.pkl") and os.path.exists("twin_recovery_model.pkl")
    dataset_exists = os.path.exists("synthetic_athlete_dataset.csv")
    return jsonify({
        "status": "online",
        "models_ready": models_ready,
        "dataset_ready": dataset_exists,
        "athlete": "Daniel Saji",
        "esp32_connected": (engine.last_packet_time is not None and (time.time() - engine.last_packet_time < 4.0)),
        "mock_feed_running": mock_feed_running
    })


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print(" Digital Twin Athlete Cockpit Online: http://127.0.0.1:5000")
    print("=" * 60 + "\n")
    app.run(host="0.0.0.0", port=5000, debug=False)

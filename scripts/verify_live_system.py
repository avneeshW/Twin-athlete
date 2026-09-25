import urllib.request
import json
import time

BASE_URL = "http://127.0.0.1:5000"

print("=" * 60)
print(" VERIFYING TWINATHLETE LIVE SERVER & ESP32 PIPELINE")
print("=" * 60)

# 1. Test Index
req = urllib.request.Request(f"{BASE_URL}/")
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode("utf-8")
    assert "Digital Twin Athlete" in html
    assert "esp32StatusPill" in html
    print("[PASS] Web app served successfully (HTML with ESP32 status pill & controls)")

# 2. Test Status Endpoint
req = urllib.request.Request(f"{BASE_URL}/api/status")
with urllib.request.urlopen(req) as resp:
    status_data = json.loads(resp.read().decode("utf-8"))
    assert status_data["status"] == "online"
    assert status_data["models_ready"] is True
    print(f"[PASS] Backend Status: Online | Models Ready: {status_data['models_ready']}")

# 3. Test Ingesting an ESP32 packet
esp32_packet = {
    "device_id": "ESP32-ATHLETE-LIVE-CHECK",
    "heart_rate": 146.5,
    "spo2": 98.0,
    "ax": 0.42,
    "ay": 1.75,
    "az": 0.15,
    "battery": 93
}
req = urllib.request.Request(
    f"{BASE_URL}/api/esp32/telemetry",
    data=json.dumps(esp32_packet).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)
with urllib.request.urlopen(req) as resp:
    telemetry_resp = json.loads(resp.read().decode("utf-8"))
    assert telemetry_resp["status"] == "success"
    print(f"[PASS] Ingested ESP32 Telemetry -> HR: {telemetry_resp['processed_hr']} BPM | Zone: {telemetry_resp['hr_zone']} | Activity: {telemetry_resp['activity']}")

# 4. Test ESP32 Diagnostic Status
req = urllib.request.Request(f"{BASE_URL}/api/esp32/status")
with urllib.request.urlopen(req) as resp:
    esp_status = json.loads(resp.read().decode("utf-8"))
    assert esp_status["connected"] is True
    assert esp_status["packet_count"] >= 1
    print(f"[PASS] Hardware Status: {esp_status['status']} | Last Seen: {esp_status['last_seen_sec']}s ago | Packets: {esp_status['packet_count']}")

# 5. Test Live Dashboard Data
req = urllib.request.Request(f"{BASE_URL}/api/dashboard-data?timeframe=1H")
with urllib.request.urlopen(req) as resp:
    dash_data = json.loads(resp.read().decode("utf-8"))
    assert dash_data["device"]["connected"] is True
    assert dash_data["vitals"]["heart_rate"]["value"] == 146 or dash_data["vitals"]["heart_rate"]["value"] == 147
    print(f"[PASS] Dashboard Data Live Sync -> Vitals HR: {dash_data['vitals']['heart_rate']['value']} BPM ({dash_data['vitals']['heart_rate']['status']})")

# 6. Test What-If Simulation
sim_payload = {"intensity_mode": "High", "current_fatigue": 20.0, "current_recovery": 82.0}
req = urllib.request.Request(
    f"{BASE_URL}/api/simulate-step",
    data=json.dumps(sim_payload).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)
with urllib.request.urlopen(req) as resp:
    sim_data = json.loads(resp.read().decode("utf-8"))
    print(f"[PASS] What-If Simulator -> Predicted Fatigue: {sim_data['fatigue_value']}% ({sim_data['fatigue_label']}) | Recovery: {sim_data['recovery_label']} | Performance: {sim_data['performance_label']}")

print("\n" + "=" * 60)
print(" ALL REAL-TIME ESP32 PIPELINE VERIFICATIONS PASSED!")
print("=" * 60 + "\n")

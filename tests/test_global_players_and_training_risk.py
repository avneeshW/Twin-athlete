import os
import json
import pytest
from app import app
from twin.registry import AthleteRegistry
from twin.storage import StorageVault

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def test_training_risk_html_requirements():
    """Verify Requirements 2 & 3 in both static/index.html and public/index.html."""
    for path in ["static/index.html", "public/index.html"]:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()

        # 1. Column headers must NOT be present in Training Risk panel
        assert "WHAT THE SYSTEM SEES" not in content, f"Column label 'WHAT THE SYSTEM SEES' found in {path}"
        assert '<div class="risk-col-label">STATUS</div>' not in content, f"Column header label 'STATUS' found in {path}"
        assert '<span class="risk-col-label">STATUS</span>' not in content, f"Column header label 'STATUS' found in {path}"

        # 2. Training Risk title and shield icon preserved
        assert "Training Risk" in content
        assert "btnInjuryInfo" in content

        # 3. All 4 rows preserved
        assert "Training Load" in content
        assert "Running Impact" in content
        assert "Movement Balance" in content
        assert "Recovery" in content

        # 4. Exact text for all 4 metrics in information popup
        assert "Training Load: Shows how much effort you put into training." in content or (
            "Training Load:" in content and "Shows how much effort you put into training." in content
        )
        assert "Shows how much effort you put into training." in content
        assert "Shows the impact on your body while running." in content
        assert "Shows how steady and consistent your movements are." in content
        assert "Shows how well your body is recovering and if you need more rest." in content

        # 5. Accessibility attributes on info button
        assert 'aria-controls="trainingRiskInfoPopup"' in content
        assert 'aria-expanded="false"' in content

def test_global_player_data_across_devices(client, tmp_path):
    """Verify Requirement 1: Player added, updated, switched, and deleted across simulated devices."""
    test_db = str(tmp_path / "sync_global_test.db")
    vault = StorageVault(db_path=test_db)
    reg1 = AthleteRegistry(storage_vault=vault)
    reg2 = AthleteRegistry(storage_vault=vault)

    # Device 1: Add a player
    new_player_data = {
        "name": "Carlos Tevez",
        "position": "Center Forward",
        "squad_number": "32",
        "age": 28,
        "height_cm": 173.0,
        "weight_kg": 77.0,
        "resting_hr_baseline": 50.0,
        "max_hr": 192.0,
        "typical_sleep_baseline": 8.0,
        "recovery": 88.0,
        "fatigue": 22.0,
        "acwr": 1.12,
        "device_id": "ESP32-DEV-99"
    }
    reg1.register_athlete(new_player_data)

    # Device 2: Fetch squad overview - must immediately contain the newly added player
    squad_dev2 = reg2.get_squad_summary()
    carlos_dev2 = next((a for a in squad_dev2["roster"] if a["name"] == "Carlos Tevez"), None)
    assert carlos_dev2 is not None, "Newly added player not visible to Device 2"
    assert carlos_dev2["position"] == "Center Forward"
    assert carlos_dev2["squad_number"] == "32"
    assert carlos_dev2["device_id"] == "ESP32-DEV-99"

    # Device 2: Update the player's position and squad number
    carlos_id = carlos_dev2["athlete_id"]
    reg2.update_athlete(carlos_id, {"position": "Striker", "squad_number": "10"})

    # Device 1: Fetch squad overview - must see updated position and squad number
    squad_dev1 = reg1.get_squad_summary()
    carlos_dev1 = next((a for a in squad_dev1["roster"] if a["athlete_id"] == carlos_id), None)
    assert carlos_dev1 is not None
    assert carlos_dev1["position"] == "Striker"
    assert carlos_dev1["squad_number"] == "10"

    # Device 2: Remove the player
    reg2.remove_athlete(carlos_id)

    # Device 1: Player must be gone
    squad_dev1_after = reg1.get_squad_summary()
    assert not any(a["athlete_id"] == carlos_id for a in squad_dev1_after["roster"])

def test_api_endpoints_global_player_flow(client):
    """Test full HTTP API flow for global player synchronization across devices."""
    # 1. Device A: Register new athlete
    reg_res = client.post("/api/athlete/register", json={
        "name": "Global Test Player",
        "position": "Left Wing",
        "squad_number": "11",
        "age": 22,
        "height_cm": 178.0,
        "weight_kg": 72.0,
        "resting_hr_baseline": 53.0
    })
    assert reg_res.status_code == 201
    data = json.loads(reg_res.data)
    ath_id = data["athlete"]["id"] or data["athlete"]["athlete_id"]
    assert ath_id is not None

    # 2. Device B: List athletes via team-overview
    overview_res = client.get("/api/coach/team-overview")
    assert overview_res.status_code == 200
    overview_data = json.loads(overview_res.data)
    match = next((a for a in overview_data["roster"] if a.get("id") == ath_id or a.get("athlete_id") == ath_id), None)
    assert match is not None
    assert match["name"] == "Global Test Player"

    # 3. Device B: Update athlete
    upd_res = client.post("/api/athlete/update", json={
        "athlete_id": ath_id,
        "name": "Global Test Player Updated",
        "position": "Attacking Midfielder"
    })
    assert upd_res.status_code == 200

    # 4. Device A: Query /api/athletes - must reflect updated name and position
    athletes_res = client.get("/api/athletes")
    assert athletes_res.status_code == 200
    athletes_data = json.loads(athletes_res.data)
    updated_match = next((a for a in athletes_data["athletes"] if a.get("id") == ath_id or a.get("athlete_id") == ath_id), None)
    assert updated_match is not None
    assert updated_match["name"] == "Global Test Player Updated"
    assert updated_match["position"] == "Attacking Midfielder"

    # 5. Clean up: Delete athlete
    del_res = client.delete(f"/api/athlete/{ath_id}")
    assert del_res.status_code == 200

    # Verify athlete no longer exists
    after_res = client.get("/api/athletes")
    after_data = json.loads(after_res.data)
    assert not any((a.get("id") == ath_id or a.get("athlete_id") == ath_id) for a in after_data["athletes"])

"""
DIGITAL TWIN ATHLETE — MULTI-ATHLETE REGISTRY ENGINE
Phase 3 Implementation:
- Manages squad rosters and independent stateful DigitalTwin instances.
- Maps wearable hardware device IDs (e.g. ESP32-ATHLETE-01) to specific athlete twins.
- Calculates squad-level ACWR distribution, injury risk flags, and deload advisories for Coach Matrix.
- Fully backwards-compatible with single-athlete cockpit mode (default athlete: ATH-0824 Daniel Saji).
"""

import time
import math
from typing import Dict, Any, List, Optional, Tuple
import numpy as np

import ai_coach_engine
from storage import vault


class DigitalTwin:
    """Stateful, independent digital twin representation of an individual athlete."""

    def __init__(self, profile: "ai_coach_engine.AthleteProfile", storage_vault=None):
        self.profile = profile
        self.athlete_id = profile.athlete_id
        self.vault = storage_vault or vault
        self.tracker = ai_coach_engine.PredictionOutcomeTracker(athlete_id=self.athlete_id)

        # Dynamic physiological and acute workload metrics
        self.current_fatigue = 38.0 if self.athlete_id == "ATH-0824" else 30.0
        self.current_recovery = 78.0 if self.athlete_id == "ATH-0824" else 80.0
        self.chronic_load = profile.chronic_load_baseline
        self.acute_load = profile.chronic_load_baseline * 1.05
        self.acwr = round(float(self.acute_load / max(1.0, self.chronic_load)), 2)

        # Connection & device tracking
        self.device_id = None
        self.last_packet_time = None
        self.wearable_connected = False
        self.active_squad = True

    @property
    def readiness_score(self) -> float:
        return ai_coach_engine.calculate_readiness(
            recovery=self.current_recovery,
            fatigue=self.current_fatigue,
            sleep_hours=self.profile.typical_sleep_baseline
        )

    @property
    def status_classification(self) -> Tuple[str, str, str]:
        """Returns (status_label, status_color, coaching_action)."""
        if self.acwr >= 1.40 or self.current_fatigue >= 60.0:
            return "High Fatigue", "red", "Complete deload; pool session & mobility"
        elif self.acwr >= 1.30 or self.current_fatigue >= 45.0:
            return "High Workload Spike", "amber", "Cap session at 45 min; tempo only"
        elif self.acwr < 0.80:
            return "Under-trained", "cyan", "Gradual volume ramp recommended"
        else:
            return "Optimal", "green", "Optimal readiness for high-intensity tactical drills"

    def record_session_load(self, training_load: float):
        """Updates rolling acute workload and ACWR kinetics."""
        alpha_acute = 2.0 / (7.0 + 1.0)
        self.acute_load = round((alpha_acute * training_load) + ((1.0 - alpha_acute) * self.acute_load), 1)
        self.acwr = round(float(self.acute_load / max(1.0, self.chronic_load)), 2)

    def update_vitals(self, hr: float, spo2: float, timestamp: float = None):
        """Updates live vital state and connection heartbeat."""
        self.last_packet_time = timestamp or time.time()
        self.wearable_connected = True

    def get_summary(self) -> Dict[str, Any]:
        """Produces squad matrix representation for Coach View."""
        status_label, status_color, recommendation = self.status_classification
        is_conn = (self.last_packet_time is not None and (time.time() - self.last_packet_time < 5.0))
        return {
            "id": self.athlete_id,
            "name": self.profile.name,
            "sport": self.profile.sport,
            "position": getattr(self.profile, "position", "Midfield Runner"),
            "readiness": self.readiness_score,
            "fatigue": self.current_fatigue,
            "recovery": self.current_recovery,
            "acwr": self.acwr,
            "status": status_label,
            "status_color": status_color,
            "recommendation": recommendation,
            "wearable_connected": is_conn,
            "device_id": self.device_id,
            "active_squad": self.active_squad,
            "personalization_tier": self.profile.personalization_tier
        }


class AthleteRegistry:
    """
    Squad-Level Multi-Athlete Digital Twin Registry.
    Maintains independent DigitalTwin instances, handles hardware device routing,
    and exposes squad analytics.
    """

    def __init__(self, storage_vault=None):
        self.vault = storage_vault or vault
        self._twins: Dict[str, DigitalTwin] = {}
        self.active_athlete_id: str = "ATH-0824"
        self._init_squad()

    def _init_squad(self):
        """Initializes default team squad profiles and device mappings."""
        default_squad = [
            {
                "athlete_id": "ATH-0824",
                "name": "Daniel Saji",
                "sport": "Football",
                "position": "Midfield / Box-to-Box",
                "age": 24,
                "height_cm": 182.0,
                "weight_kg": 75.5,
                "resting_hr_baseline": 54.0,
                "max_hr": 195.0,
                "vo2_max": 58.5,
                "chronic_load_baseline": 42.0,
                "typical_sleep_baseline": 7.8,
                "history_days": 180,
                "dominant_leg": "Right",
                "fatigue": 38.0,
                "recovery": 78.0,
                "acwr": 1.09
            },
            {
                "athlete_id": "ATH-0102",
                "name": "Marcus Vance",
                "sport": "Football",
                "position": "Center Forward",
                "age": 22,
                "height_cm": 186.0,
                "weight_kg": 81.0,
                "resting_hr_baseline": 58.0,
                "max_hr": 198.0,
                "vo2_max": 56.0,
                "chronic_load_baseline": 50.0,
                "typical_sleep_baseline": 7.2,
                "history_days": 90,
                "dominant_leg": "Right",
                "fatigue": 54.0,
                "recovery": 66.0,
                "acwr": 1.38
            },
            {
                "athlete_id": "ATH-0315",
                "name": "Leo Sterling",
                "sport": "Football",
                "position": "Fullback",
                "age": 26,
                "height_cm": 178.0,
                "weight_kg": 73.0,
                "resting_hr_baseline": 56.0,
                "max_hr": 192.0,
                "vo2_max": 57.0,
                "chronic_load_baseline": 46.0,
                "typical_sleep_baseline": 6.8,
                "history_days": 120,
                "dominant_leg": "Left",
                "fatigue": 64.0,
                "recovery": 55.0,
                "acwr": 1.45
            },
            {
                "athlete_id": "ATH-0544",
                "name": "Kai Tanaka",
                "sport": "Football",
                "position": "Central Defender",
                "age": 28,
                "height_cm": 189.0,
                "weight_kg": 84.0,
                "resting_hr_baseline": 50.0,
                "max_hr": 188.0,
                "vo2_max": 54.5,
                "chronic_load_baseline": 44.0,
                "typical_sleep_baseline": 8.0,
                "history_days": 210,
                "dominant_leg": "Right",
                "fatigue": 28.0,
                "recovery": 86.0,
                "acwr": 1.02
            },
            {
                "athlete_id": "ATH-0791",
                "name": "Mateo Silva",
                "sport": "Football",
                "position": "Goalkeeper",
                "age": 25,
                "height_cm": 191.0,
                "weight_kg": 86.0,
                "resting_hr_baseline": 52.0,
                "max_hr": 190.0,
                "vo2_max": 52.0,
                "chronic_load_baseline": 36.0,
                "typical_sleep_baseline": 8.2,
                "history_days": 150,
                "dominant_leg": "Right",
                "fatigue": 20.0,
                "recovery": 90.0,
                "acwr": 0.95
            }
        ]

        # 1. Load profiles from storage or seed defaults
        for athlete_data in default_squad:
            aid = athlete_data["athlete_id"]
            prof_data = self.vault.get_athlete_profile(aid) if self.vault else None
            if not prof_data:
                prof = ai_coach_engine.AthleteProfile(athlete_id=aid)
                prof.name = athlete_data["name"]
                prof.sport = athlete_data["sport"]
                prof.position = athlete_data["position"]
                prof.age = athlete_data["age"]
                prof.height_cm = athlete_data["height_cm"]
                prof.weight_kg = athlete_data["weight_kg"]
                prof.resting_hr_baseline = athlete_data["resting_hr_baseline"]
                prof.max_hr = athlete_data["max_hr"]
                prof.vo2_max = athlete_data["vo2_max"]
                prof.chronic_load_baseline = athlete_data["chronic_load_baseline"]
                prof.typical_sleep_baseline = athlete_data["typical_sleep_baseline"]
                prof.history_days = athlete_data["history_days"]
                prof.dominant_leg = athlete_data["dominant_leg"]
                if self.vault:
                    self.vault.save_athlete_profile(prof.to_dict())
            else:
                prof = ai_coach_engine.AthleteProfile(athlete_id=aid)
                prof.position = prof_data.get("position", athlete_data["position"])

            twin = DigitalTwin(prof, storage_vault=self.vault)
            twin.current_fatigue = athlete_data.get("fatigue", 30.0)
            twin.current_recovery = athlete_data.get("recovery", 80.0)
            twin.acwr = athlete_data.get("acwr", 1.0)
            self._twins[aid] = twin

        # 2. Seed default device mappings
        default_device_maps = {
            "ESP32-ATHLETE-01": "ATH-0824",
            "ESP32-ATHLETE-02": "ATH-0102"
        }
        for dev, aid in default_device_maps.items():
            if self.vault:
                existing = self.vault.get_athlete_for_device(dev)
                if not existing:
                    self.vault.save_device_mapping(dev, aid)
            if aid in self._twins:
                self._twins[aid].device_id = dev

    # Athlete selection & retrieval
    def get_active_athlete_id(self) -> str:
        return self.active_athlete_id

    def set_active_athlete(self, athlete_id: str) -> bool:
        if athlete_id in self._twins:
            self.active_athlete_id = athlete_id
            # Synchronize module-level singletons in ai_coach_engine
            ai_coach_engine.athlete_profile = self.get_active_profile()
            ai_coach_engine.prediction_tracker = self.get_active_tracker()
            return True
        return False

    def get_active_twin(self) -> DigitalTwin:
        return self._twins.get(self.active_athlete_id, self._twins["ATH-0824"])

    def get_active_profile(self) -> "ai_coach_engine.AthleteProfile":
        return self.get_active_twin().profile

    def get_active_tracker(self) -> "ai_coach_engine.PredictionOutcomeTracker":
        return self.get_active_twin().tracker

    def get_twin(self, athlete_id: str) -> Optional[DigitalTwin]:
        return self._twins.get(athlete_id)

    def list_athletes(self) -> List[Dict[str, Any]]:
        return [twin.get_summary() for twin in self._twins.values()]

    def register_athlete(self, profile_data: Dict[str, Any]) -> DigitalTwin:
        aid = profile_data.get("athlete_id") or f"ATH-{int(time.time() % 10000):04d}"
        profile_data["athlete_id"] = aid
        prof = ai_coach_engine.AthleteProfile(athlete_id=aid)
        for k, v in profile_data.items():
            if hasattr(prof, k):
                setattr(prof, k, v)
        if self.vault:
            self.vault.save_athlete_profile(prof.to_dict())
        twin = DigitalTwin(prof, storage_vault=self.vault)
        self._twins[aid] = twin
        return twin

    # Hardware device mapping
    def map_device(self, device_id: str, athlete_id: str) -> bool:
        if athlete_id in self._twins:
            if self.vault:
                self.vault.save_device_mapping(device_id, athlete_id)
            self._twins[athlete_id].device_id = device_id
            return True
        return False

    def get_athlete_for_device(self, device_id: str) -> str:
        if self.vault:
            aid = self.vault.get_athlete_for_device(device_id)
            if aid and aid in self._twins:
                return aid
        # Fallback to active athlete if unmapped
        return self.active_athlete_id

    # Squad Analytics for Coach Matrix
    def get_squad_summary(self) -> Dict[str, Any]:
        roster = self.list_athletes()
        optimal_count = sum(1 for a in roster if a["status_color"] == "green")
        caution_count = sum(1 for a in roster if a["status_color"] == "amber")
        high_risk_count = sum(1 for a in roster if a["status_color"] == "red")
        avg_readiness = round(float(np.mean([a["readiness"] for a in roster])), 1) if roster else 80.0
        avg_acwr = round(float(np.mean([a["acwr"] for a in roster])), 2) if roster else 1.0

        return {
            "squad_size": len(roster),
            "optimal_count": optimal_count,
            "caution_count": caution_count,
            "high_risk_count": high_risk_count,
            "average_readiness": avg_readiness,
            "average_acwr": avg_acwr,
            "active_athlete_id": self.active_athlete_id,
            "roster": roster
        }


# Centralized registry singleton
registry = AthleteRegistry()

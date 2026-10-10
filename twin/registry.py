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

try:
    from . import coach as ai_coach_engine
    from .storage import vault
except Exception:
    from twin import coach as ai_coach_engine
    from twin.storage import vault


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
            "athlete_id": self.athlete_id,
            "name": self.profile.name,
            "sport": self.profile.sport,
            "position": getattr(self.profile, "position", "Midfield Runner"),
            "squad_number": getattr(self.profile, "squad_number", "8"),
            "age": getattr(self.profile, "age", 24),
            "height_cm": getattr(self.profile, "height_cm", 182.0),
            "weight_kg": getattr(self.profile, "weight_kg", 75.5),
            "resting_hr_baseline": getattr(self.profile, "resting_hr_baseline", 54.0),
            "max_hr": getattr(self.profile, "max_hr", 195.0),
            "readiness": self.readiness_score,
            "readiness_score": self.readiness_score,
            "fatigue": self.current_fatigue,
            "fatigue_level": self.current_fatigue,
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
        if self.vault is None:
            try:
                from twin.storage import StorageVault
                self.vault = StorageVault()
            except Exception as e:
                print(f"[AthleteRegistry] Vault init fallback: {e}")
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
            prof_data = None
            if self.vault:
                try:
                    prof_data = self.vault.get_athlete_profile(aid)
                except Exception as e:
                    print(f"[AthleteRegistry] Warning reading profile {aid}: {e}")
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
                    try:
                        self.vault.save_athlete_profile(prof.to_dict())
                    except Exception as e:
                        print(f"[AthleteRegistry] Warning saving profile {aid}: {e}")
            else:
                prof = ai_coach_engine.AthleteProfile(athlete_id=aid)
                prof.position = prof_data.get("position", athlete_data["position"])

            twin = DigitalTwin(prof, storage_vault=self.vault)
            twin.current_fatigue = athlete_data.get("fatigue", 30.0)
            twin.current_recovery = athlete_data.get("recovery", 80.0)
            twin.acwr = athlete_data.get("acwr", 1.0)
            self._twins[aid] = twin

        # 2. Restore custom registered athletes from SQLite
        if self.vault:
            try:
                all_saved = self.vault.get_all_athlete_profiles()
                for row in all_saved:
                    aid = row.get("athlete_id")
                    if aid and aid not in self._twins and row.get("active_squad", 1):
                        custom_prof = ai_coach_engine.AthleteProfile(athlete_id=aid)
                        for k, v in row.items():
                            if hasattr(custom_prof, k) and v is not None:
                                try:
                                    curr = getattr(custom_prof, k)
                                    if isinstance(curr, float):
                                        setattr(custom_prof, k, float(v))
                                    elif isinstance(curr, int):
                                        setattr(custom_prof, k, int(v))
                                    else:
                                        setattr(custom_prof, k, v)
                                except (ValueError, TypeError):
                                    setattr(custom_prof, k, v)
                        custom_twin = DigitalTwin(custom_prof, storage_vault=self.vault)
                        self._twins[aid] = custom_twin
            except Exception as e:
                print(f"[AthleteRegistry] Notice restoring athletes from vault: {e}")

        # 3. Seed default device mappings & restore saved mappings
        default_device_maps = {
            "ESP32-ATHLETE-01": "ATH-0824",
            "ESP32-ATHLETE-02": "ATH-0102"
        }
        for dev, aid in default_device_maps.items():
            if self.vault:
                try:
                    existing = self.vault.get_athlete_for_device(dev)
                    if not existing:
                        self.vault.save_device_mapping(dev, aid)
                except Exception as e:
                    print(f"[AthleteRegistry] Warning mapping device {dev}: {e}")
            if aid in self._twins:
                self._twins[aid].device_id = dev

        if self.vault:
            try:
                saved_mappings = self.vault.get_all_device_mappings()
                for dev, aid in saved_mappings.items():
                    if aid in self._twins:
                        self._twins[aid].device_id = dev
            except Exception as e:
                print(f"[AthleteRegistry] Notice restoring device mappings: {e}")

    # Athlete selection & retrieval
    # Athlete synchronization with database
    def sync_from_vault(self):
        """Synchronizes in-memory twin registry with persistent SQLite vault across devices."""
        if not self.vault:
            return
        try:
            saved_rows = self.vault.get_all_athlete_profiles()
            saved_ids = {r.get("athlete_id") for r in saved_rows if r.get("athlete_id") and r.get("active_squad", 1)}

            # Prune twins that were removed from storage by another process or device
            for aid in list(self._twins.keys()):
                if aid not in saved_ids:
                    del self._twins[aid]
                    if self.active_athlete_id == aid:
                        self.active_athlete_id = next(iter(saved_ids)) if saved_ids else ""

            for row in saved_rows:
                aid = row.get("athlete_id")
                if not aid:
                    continue
                if not row.get("active_squad", 1):
                    if aid in self._twins:
                        del self._twins[aid]
                    continue
                if aid in self._twins:
                    twin = self._twins[aid]
                    prof = twin.profile
                    for k, v in row.items():
                        if hasattr(prof, k) and v is not None:
                            try:
                                curr = getattr(prof, k)
                                if isinstance(curr, float):
                                    setattr(prof, k, float(v))
                                elif isinstance(curr, int):
                                    setattr(prof, k, int(v))
                                else:
                                    setattr(prof, k, v)
                            except (ValueError, TypeError):
                                setattr(prof, k, v)
                    if row.get("device_id") is not None:
                        twin.device_id = row.get("device_id") or None
                    if row.get("recovery") is not None:
                        twin.current_recovery = float(row.get("recovery"))
                    if row.get("fatigue") is not None:
                        twin.current_fatigue = float(row.get("fatigue"))
                    if row.get("acwr") is not None:
                        twin.acwr = float(row.get("acwr"))
                else:
                    prof = ai_coach_engine.AthleteProfile(athlete_id=aid)
                    for k, v in row.items():
                        if hasattr(prof, k) and v is not None:
                            try:
                                curr = getattr(prof, k)
                                if isinstance(curr, float):
                                    setattr(prof, k, float(v))
                                elif isinstance(curr, int):
                                    setattr(prof, k, int(v))
                                else:
                                    setattr(prof, k, v)
                            except (ValueError, TypeError):
                                setattr(prof, k, v)
                    twin = DigitalTwin(prof, storage_vault=self.vault)
                    if row.get("device_id"):
                        twin.device_id = row.get("device_id")
                    if row.get("recovery") is not None:
                        twin.current_recovery = float(row.get("recovery"))
                    if row.get("fatigue") is not None:
                        twin.current_fatigue = float(row.get("fatigue"))
                    if row.get("acwr") is not None:
                        twin.acwr = float(row.get("acwr"))
                    self._twins[aid] = twin
        except Exception as e:
            print(f"[AthleteRegistry] Vault sync notice: {e}")

    # Athlete selection & retrieval
    def get_active_athlete_id(self) -> str:
        if self.vault:
            try:
                saved_id = self.vault.get_setting("active_athlete_id")
                if saved_id and (saved_id in self._twins or self.vault.get_athlete_profile(saved_id)):
                    self.active_athlete_id = saved_id
            except Exception:
                pass
        return self.active_athlete_id

    def set_active_athlete(self, athlete_id: str) -> bool:
        self.sync_from_vault()
        if athlete_id in self._twins:
            self.active_athlete_id = athlete_id
            if self.vault:
                try:
                    self.vault.set_setting("active_athlete_id", athlete_id)
                except Exception:
                    pass
            active_prof = self.get_active_profile()
            active_track = self.get_active_tracker()
            if active_prof:
                ai_coach_engine.athlete_profile = active_prof
            if active_track:
                ai_coach_engine.prediction_tracker = active_track
            return True
        return False

    def get_active_twin(self) -> DigitalTwin:
        self.sync_from_vault()
        if self.active_athlete_id and self.active_athlete_id in self._twins:
            return self._twins[self.active_athlete_id]
        if self._twins:
            first_id = next(iter(self._twins.keys()))
            self.active_athlete_id = first_id
            return self._twins[first_id]
        # Standby fallback twin for completely empty squad
        standby_prof = ai_coach_engine.AthleteProfile(athlete_id="ATH-STANDBY")
        standby_prof.name = "Squad Athlete"
        standby_prof.position = "Player"
        return DigitalTwin(standby_prof, storage_vault=self.vault)

    def get_active_profile(self) -> "ai_coach_engine.AthleteProfile":
        twin = self.get_active_twin()
        return twin.profile

    def get_active_tracker(self) -> "ai_coach_engine.PredictionOutcomeTracker":
        twin = self.get_active_twin()
        return twin.tracker

    def get_twin(self, athlete_id: str) -> Optional[DigitalTwin]:
        if athlete_id not in self._twins:
            self.sync_from_vault()
        return self._twins.get(athlete_id)

    def list_athletes(self) -> List[Dict[str, Any]]:
        self.sync_from_vault()
        return [twin.get_summary() for twin in self._twins.values() if twin.active_squad]

    def register_athlete(self, profile_data: Dict[str, Any]) -> DigitalTwin:
        aid = profile_data.get("athlete_id") or profile_data.get("id")
        if not aid:
            highest = 0
            all_known_ids = set(self._twins.keys())
            if self.vault:
                try:
                    all_known_ids.update([p.get("athlete_id") for p in self.vault.get_all_athlete_profiles() if p.get("athlete_id")])
                except Exception:
                    pass
            for existing_id in all_known_ids:
                if str(existing_id).startswith("ATH-"):
                    try:
                        num = int(str(existing_id)[4:])
                        if num > highest:
                            highest = num
                    except ValueError:
                        pass
            aid = f"ATH-{highest + 1:04d}" if highest > 0 else f"ATH-{int(time.time() % 10000):04d}"

        profile_data["athlete_id"] = aid
        prof = ai_coach_engine.AthleteProfile(athlete_id=aid)
        for k, v in profile_data.items():
            if hasattr(prof, k) and v is not None:
                try:
                    curr_val = getattr(prof, k)
                    if isinstance(curr_val, float):
                        setattr(prof, k, float(v))
                    elif isinstance(curr_val, int):
                        setattr(prof, k, int(v))
                    else:
                        setattr(prof, k, v)
                except (ValueError, TypeError):
                    setattr(prof, k, v)

        twin = DigitalTwin(prof, storage_vault=self.vault)
        if "fatigue" in profile_data and profile_data["fatigue"] is not None:
            try:
                twin.current_fatigue = float(profile_data["fatigue"])
            except (ValueError, TypeError):
                pass
        if "recovery" in profile_data and profile_data["recovery"] is not None:
            try:
                twin.current_recovery = float(profile_data["recovery"])
            except (ValueError, TypeError):
                pass
        if "acwr" in profile_data and profile_data["acwr"] is not None:
            try:
                twin.acwr = float(profile_data["acwr"])
            except (ValueError, TypeError):
                pass
        if "device_id" in profile_data and profile_data["device_id"]:
            twin.device_id = str(profile_data["device_id"]).strip()

        if self.vault:
            try:
                save_payload = prof.to_dict()
                save_payload["squad_number"] = getattr(prof, "squad_number", profile_data.get("squad_number", "8"))
                save_payload["recovery"] = twin.current_recovery
                save_payload["fatigue"] = twin.current_fatigue
                save_payload["acwr"] = twin.acwr
                save_payload["device_id"] = twin.device_id
                save_payload["status"] = profile_data.get("status", "Optimal")
                save_payload["status_color"] = profile_data.get("status_color", "green")
                save_payload["recommendation"] = profile_data.get("recommendation", "Maintain prescribed periodization")
                self.vault.save_athlete_profile(save_payload)
            except Exception as e:
                print(f"[AthleteRegistry] Warning saving athlete to vault: {e}")

        self._twins[aid] = twin
        if not self.active_athlete_id or self.active_athlete_id not in self._twins:
            self.set_active_athlete(aid)
        return twin

    def update_athlete(self, athlete_id: str, update_data: Dict[str, Any]) -> Optional[DigitalTwin]:
        """Updates an existing athlete profile and synchronizes changes to vault."""
        self.sync_from_vault()
        if athlete_id not in self._twins:
            if self.vault and self.vault.get_athlete_profile(athlete_id):
                self.sync_from_vault()
        if athlete_id not in self._twins:
            return None

        twin = self._twins[athlete_id]
        prof = twin.profile

        for k, v in update_data.items():
            if hasattr(prof, k) and v is not None:
                try:
                    curr_val = getattr(prof, k)
                    if isinstance(curr_val, float):
                        setattr(prof, k, float(v))
                    elif isinstance(curr_val, int):
                        setattr(prof, k, int(v))
                    else:
                        setattr(prof, k, v)
                except (ValueError, TypeError):
                    setattr(prof, k, v)

        if "fatigue" in update_data and update_data["fatigue"] is not None:
            try:
                twin.current_fatigue = float(update_data["fatigue"])
            except (ValueError, TypeError):
                pass
        if "recovery" in update_data and update_data["recovery"] is not None:
            try:
                twin.current_recovery = float(update_data["recovery"])
            except (ValueError, TypeError):
                pass
        if "acwr" in update_data and update_data["acwr"] is not None:
            try:
                twin.acwr = float(update_data["acwr"])
            except (ValueError, TypeError):
                pass
        if "device_id" in update_data:
            dev = update_data["device_id"]
            if dev and str(dev).strip():
                self.map_device(str(dev).strip(), athlete_id)
            elif dev == "" or dev is None:
                twin.device_id = None

        if self.vault:
            try:
                save_payload = prof.to_dict()
                save_payload["squad_number"] = getattr(prof, "squad_number", update_data.get("squad_number", "8"))
                save_payload["recovery"] = twin.current_recovery
                save_payload["fatigue"] = twin.current_fatigue
                save_payload["acwr"] = twin.acwr
                save_payload["device_id"] = twin.device_id
                if "status" in update_data:
                    save_payload["status"] = update_data["status"]
                if "status_color" in update_data:
                    save_payload["status_color"] = update_data["status_color"]
                if "recommendation" in update_data:
                    save_payload["recommendation"] = update_data["recommendation"]
                self.vault.save_athlete_profile(save_payload)
            except Exception as e:
                print(f"[AthleteRegistry] Warning updating vault: {e}")

        if self.active_athlete_id == athlete_id:
            ai_coach_engine.athlete_profile = prof

        return twin

    def remove_athlete(self, athlete_id: str) -> bool:
        """Removes an athlete twin from active squad and SQLite database."""
        existed_in_memory = athlete_id in self._twins
        existed_in_db = False
        if self.vault:
            try:
                existed_in_db = bool(self.vault.get_athlete_profile(athlete_id))
            except Exception:
                pass

        if not existed_in_memory and not existed_in_db:
            return False

        if existed_in_memory:
            del self._twins[athlete_id]
        if self.vault:
            try:
                self.vault.delete_athlete_profile(athlete_id)
            except Exception as e:
                print(f"[AthleteRegistry] delete_athlete_profile notice: {e}")
        if self.active_athlete_id == athlete_id or self.active_athlete_id not in self._twins:
            if self._twins:
                next_id = next(iter(self._twins.keys()))
                self.set_active_athlete(next_id)
            else:
                self.active_athlete_id = ""
        return True

    # Hardware device mapping
    def map_device(self, device_id: str, athlete_id: str) -> bool:
        if athlete_id in self._twins:
            # Unmap device from any other athlete twin in memory
            for aid, tw in self._twins.items():
                if aid != athlete_id and tw.device_id == device_id:
                    tw.device_id = None
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
try:
    registry = AthleteRegistry()
except Exception as e:
    print(f"[twin.registry] Warning: AthleteRegistry init error: {e}. Falling back to in-memory registry.")
    try:
        from twin.storage import StorageVault
        registry = AthleteRegistry(storage_vault=StorageVault(db_path=":memory:"))
    except Exception:
        registry = None


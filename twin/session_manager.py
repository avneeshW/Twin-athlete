"""
DIGITAL TWIN ATHLETE - SQUAD & WEARABLE SESSION MANAGER
Automates session lifecycles per hardware device:
- Auto-creates a session per device on its first packet
- Auto-closes idle sessions after N seconds of silence (default 60s, configurable via TWIN_SESSION_IDLE_TIMEOUT)
- In-memory state tracking to ensure ZERO database calls on the hot ingest path
- Dedicated idle reaper background thread detecting dormant devices
- Graceful flush of session summaries on explicit reset (/api/session/reset) or shutdown
"""

import os
import time
import json
import atexit
import signal
import threading
from typing import Dict, Any, List, Optional

DEFAULT_IDLE_TIMEOUT_SEC = 60.0


class SessionManager:
    """Manages active wearable workout sessions with idle detection and zero-DB hot path lookups."""

    def __init__(self, storage_vault: Any = None, writer: Any = None, idle_timeout: Optional[float] = None):
        self.vault = storage_vault
        self.writer = writer
        raw_timeout = os.environ.get("TWIN_SESSION_IDLE_TIMEOUT")
        if idle_timeout is not None:
            self.idle_timeout = float(idle_timeout)
        elif raw_timeout:
            try:
                self.idle_timeout = float(raw_timeout)
            except ValueError:
                self.idle_timeout = DEFAULT_IDLE_TIMEOUT_SEC
        else:
            self.idle_timeout = DEFAULT_IDLE_TIMEOUT_SEC

        self._active_sessions: Dict[str, Dict[str, Any]] = {}  # {device_id: session_dict}
        self._lock = threading.Lock()
        self._stop_event = threading.Event()

        self._start_reaper()
        self._register_shutdown_handlers()

    def get_active_session(self, device_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._active_sessions.get(device_id)

    def get_or_create_session(self, device_id: str, athlete_id: str, now: float = None, is_mock: bool = False) -> str:
        """
        Retrieves current active session ID for device, or auto-creates a new session.
        If previous session timed out after idle_timeout, it is auto-closed and persisted.
        Executes entirely in memory with no blocking DB calls on the critical path.
        """
        current_time = now or time.time()

        with self._lock:
            existing = self._active_sessions.get(device_id)
            if existing:
                time_since_last = current_time - existing["last_packet_time"]
                if time_since_last <= self.idle_timeout:
                    existing["last_packet_time"] = current_time
                    existing["packet_count"] += 1
                    return existing["session_id"]
                else:
                    # Auto-close expired session
                    self._close_session_unlocked(existing, end_time=existing["last_packet_time"])

            # Create new session
            clean_dev = device_id.replace(" ", "_")
            new_sid = f"SES-{clean_dev}-{int(current_time)}"
            new_session = {
                "session_id": new_sid,
                "id": new_sid,
                "device_id": device_id,
                "athlete_id": athlete_id,
                "is_mock": 1 if is_mock else 0,
                "start_time": current_time,
                "last_packet_time": current_time,
                "packet_count": 1,
                "hr_readings": [],
                "spo2_readings": [],
                "steps": 0,
                "activity": "Running",
                "notes": "Auto-created wearable telemetry session",
                "rpe_post": None
            }
            self._active_sessions[device_id] = new_session

            # Non-blocking persist via writer queue (Zero DB calls in request thread)
            init_session_data = {
                "session_id": new_sid,
                "id": new_sid,
                "athlete_id": athlete_id,
                "device_id": device_id,
                "is_mock": 1 if is_mock else 0,
                "start_time": current_time,
                "end_time": current_time,
                "duration_sec": 0.0,
                "avg_hr": 0.0,
                "peak_hr": 0.0,
                "avg_spo2": 98.0,
                "calories": 0.0,
                "steps": 0,
                "training_load": 0.0,
                "activity": "Running",
                "notes": "Auto-created wearable telemetry session"
            }
            if self.writer:
                self.writer.enqueue_session(init_session_data)
            elif self.vault:
                try:
                    self.vault.save_session(init_session_data)
                except Exception as e:
                    print(f"[SessionManager] Notice registering initial session: {e}")

            return new_sid

    def record_vitals(self, device_id: str, hr: Optional[float], spo2: Optional[float], steps: int = 0):
        """Updates in-memory vitals accumulator for the active session without DB calls."""
        with self._lock:
            sess = self._active_sessions.get(device_id)
            if not sess:
                return
            if hr is not None and hr > 0:
                sess["hr_readings"].append(hr)
            if spo2 is not None and spo2 > 0:
                sess["spo2_readings"].append(spo2)
            if steps > sess["steps"]:
                sess["steps"] = steps

    def close_session(self, device_id: Optional[str] = None, athlete_id: Optional[str] = None,
                      rpe_post: Optional[float] = None, notes: Optional[str] = None) -> List[str]:
        """Explicitly closes session(s) and flushes summary aggregates."""
        closed_ids = []
        with self._lock:
            targets = []
            if device_id:
                if device_id in self._active_sessions:
                    targets.append(self._active_sessions[device_id])
            elif athlete_id:
                targets = [s for s in self._active_sessions.values() if s.get("athlete_id") == athlete_id]
            else:
                targets = list(self._active_sessions.values())

            for s in targets:
                sid = self._close_session_unlocked(s, rpe_post=rpe_post, notes=notes)
                closed_ids.append(sid)

        return closed_ids

    def _close_session_unlocked(self, sess: Dict[str, Any], end_time: Optional[float] = None,
                                rpe_post: Optional[float] = None, notes: Optional[str] = None) -> str:
        """Helper closing session and persisting final summary (must be called with self._lock)."""
        sid = sess["session_id"]
        dev = sess["device_id"]
        close_ts = end_time or time.time()
        dur = max(0.0, close_ts - sess["start_time"])

        hr_list = sess.get("hr_readings", [])
        spo2_list = sess.get("spo2_readings", [])

        avg_hr = round(float(sum(hr_list) / len(hr_list)), 1) if hr_list else 142.0
        peak_hr = round(float(max(hr_list)), 1) if hr_list else avg_hr
        avg_spo2 = round(float(sum(spo2_list) / len(spo2_list)), 1) if spo2_list else 98.0
        steps = sess.get("steps", 0)

        # Estimate load as duration * (avg_hr / 190.0)
        t_load = round((dur / 60.0) * (avg_hr / 190.0) * 1.2, 1)
        calories = round((dur / 60.0) * 11.5, 1)

        summary = {
            "session_id": sid,
            "id": sid,
            "athlete_id": sess.get("athlete_id", "ATH-0824"),
            "device_id": dev,
            "is_mock": sess.get("is_mock", 0),
            "start_time": sess["start_time"],
            "end_time": close_ts,
            "duration_sec": dur,
            "avg_hr": avg_hr,
            "peak_hr": peak_hr,
            "avg_spo2": avg_spo2,
            "calories": calories,
            "steps": steps,
            "training_load": t_load,
            "activity": sess.get("activity", "Running"),
            "rpe_post": rpe_post if rpe_post is not None else sess.get("rpe_post"),
            "notes": notes if notes is not None else sess.get("notes")
        }

        if self.writer:
            self.writer.enqueue_session(summary)
        elif self.vault:
            try:
                self.vault.save_session(summary)
            except Exception as e:
                print(f"[SessionManager] Error saving closed session {sid}: {e}")

        self._active_sessions.pop(dev, None)
        return sid

    def _start_reaper(self):
        """Starts background idle reaper daemon thread."""
        self._reaper_thread = threading.Thread(
            target=self._reaper_loop,
            daemon=True,
            name="SessionManagerReaper"
        )
        self._reaper_thread.start()

    def _reaper_loop(self):
        """Periodically inspects active sessions and auto-closes dormant ones."""
        while not self._stop_event.is_set():
            time.sleep(min(2.0, self.idle_timeout / 4.0 if self.idle_timeout > 0 else 2.0))
            now = time.time()
            to_close = []
            with self._lock:
                for dev, sess in list(self._active_sessions.items()):
                    if now - sess["last_packet_time"] > self.idle_timeout:
                        to_close.append(sess)

                for s in to_close:
                    self._close_session_unlocked(s, end_time=s["last_packet_time"])

    def shutdown(self):
        """Stops reaper thread and cleanly flushes any remaining active sessions."""
        self._stop_event.set()
        self.close_session()

    def _register_shutdown_handlers(self):
        atexit.register(self.shutdown)
        try:
            if hasattr(signal, "SIGTERM"):
                signal.signal(signal.SIGTERM, lambda signum, frame: self.shutdown())
        except (ValueError, AttributeError):
            pass


# Module singleton
_session_manager_singleton: Optional[SessionManager] = None
_sm_lock = threading.Lock()


def get_session_manager(storage_vault: Any = None, writer: Any = None, idle_timeout: Optional[float] = None) -> SessionManager:
    global _session_manager_singleton
    with _sm_lock:
        if _session_manager_singleton is None:
            if storage_vault is None:
                try:
                    from twin.storage import vault
                    storage_vault = vault
                except Exception:
                    storage_vault = None
            if writer is None:
                try:
                    from app import telemetry_writer
                    writer = telemetry_writer
                except Exception:
                    try:
                        from twin.writer import TelemetryWriter
                        writer = None
                    except Exception:
                        writer = None
            _session_manager_singleton = SessionManager(
                storage_vault=storage_vault,
                writer=writer,
                idle_timeout=idle_timeout
            )
        return _session_manager_singleton

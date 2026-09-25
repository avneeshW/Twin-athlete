"""
DIGITAL TWIN ATHLETE — ZERO-DEPENDENCY STORAGE VAULT (SQLite + WAL)
Provides persistent storage for:
1. Athlete baseline physiological parameters & calibration tier.
2. Prospective predictions and observed outcomes (Closed-loop feedback ledger).
3. Workout session telemetry summaries & history.
4. Security and calibration audit event logs.

Architecture:
- Embedded Python sqlite3 engine (zero external dependencies).
- WAL (Write-Ahead Logging) journal mode for concurrent high-speed reads and thread-safe writes.
- Automatic schema migration and lazy database creation.
"""

import os
import time
import json
import sqlite3
import threading
from typing import Dict, Any, List, Optional

DEFAULT_DB_FILE = "twin_athlete.db"


class StorageVault:
    """Thread-safe SQLite storage vault with WAL mode."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or os.environ.get("TWIN_DB_FILE", DEFAULT_DB_FILE)
        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        # Enable WAL mode and normal synchronous settings for speed + durability
        # (Note: In-memory :memory: databases do not support WAL mode)
        if self.db_path != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init_db(self):
        """Initializes tables and indices if they do not exist."""
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    # 1. Athlete Baseline Profile Table
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS athlete_baselines (
                            athlete_id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            sport TEXT,
                            position TEXT DEFAULT 'Midfield Runner',
                            age INTEGER,
                            height_cm REAL,
                            weight_kg REAL,
                            resting_hr_baseline REAL,
                            max_hr REAL,
                            vo2_max REAL,
                            chronic_load_baseline REAL,
                            typical_sleep_baseline REAL,
                            history_days INTEGER,
                            dominant_leg TEXT,
                            active_squad INTEGER DEFAULT 1,
                            updated_at REAL
                        );
                    """)

                    # Safe migration for existing databases missing position or active_squad
                    for col_def in ["position TEXT DEFAULT 'Midfield Runner'", "active_squad INTEGER DEFAULT 1"]:
                        try:
                            conn.execute(f"ALTER TABLE athlete_baselines ADD COLUMN {col_def};")
                        except sqlite3.OperationalError:
                            pass

                    # 2. Prediction vs Actual Feedback Ledger Table
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS feedback_ledger (
                            id TEXT PRIMARY KEY,
                            athlete_id TEXT DEFAULT 'ATH-0824',
                            date TEXT NOT NULL,
                            metric TEXT NOT NULL,
                            scenario TEXT NOT NULL,
                            model_version TEXT NOT NULL,
                            predicted REAL NOT NULL,
                            observed REAL,
                            error REAL,
                            percentage_error REAL,
                            status TEXT NOT NULL,
                            status_color TEXT NOT NULL,
                            created_at REAL NOT NULL,
                            verified_at REAL
                        );
                    """)

                    # Safe migration for existing databases missing athlete_id
                    try:
                        conn.execute("ALTER TABLE feedback_ledger ADD COLUMN athlete_id TEXT DEFAULT 'ATH-0824';")
                    except sqlite3.OperationalError:
                        pass

                    # 3. Device to Athlete Hardware Mappings Table
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS device_mappings (
                            device_id TEXT PRIMARY KEY,
                            athlete_id TEXT NOT NULL,
                            updated_at REAL NOT NULL
                        );
                    """)

                    # 4. Workout Session History Table
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS session_history (
                            session_id TEXT PRIMARY KEY,
                            athlete_id TEXT NOT NULL,
                            start_time REAL NOT NULL,
                            end_time REAL NOT NULL,
                            duration_sec REAL NOT NULL,
                            avg_hr REAL NOT NULL,
                            peak_hr REAL NOT NULL,
                            avg_spo2 REAL NOT NULL,
                            calories REAL NOT NULL,
                            steps INTEGER NOT NULL,
                            training_load REAL NOT NULL,
                            activity TEXT NOT NULL,
                            hr_zone_distribution TEXT,
                            created_at REAL NOT NULL
                        );
                    """)

                    # 5. Audit Log Table
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS audit_events (
                            event_id TEXT PRIMARY KEY,
                            timestamp TEXT NOT NULL,
                            event_type TEXT NOT NULL,
                            severity TEXT NOT NULL,
                            source TEXT NOT NULL,
                            details TEXT NOT NULL,
                            created_at REAL NOT NULL
                        );
                    """)

                    # Indices for rapid querying
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback_ledger(status);")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_feedback_athlete ON feedback_ledger(athlete_id);")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_session_athlete ON session_history(athlete_id, start_time);")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_device_athlete ON device_mappings(athlete_id);")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_events(created_at);")
            finally:
                conn.close()

    # =========================================================================
    # ATHLETE BASELINE METHODS
    # =========================================================================
    def get_athlete_profile(self, athlete_id: str = "ATH-0824") -> Optional[Dict[str, Any]]:
        conn = self._get_connection()
        try:
            cursor = conn.execute("SELECT * FROM athlete_baselines WHERE athlete_id = ?", (athlete_id,))
            row = cursor.fetchone()
            if row:
                return dict(row)
            return None
        finally:
            conn.close()

    def get_all_athlete_profiles(self) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        try:
            cursor = conn.execute("SELECT * FROM athlete_baselines ORDER BY name ASC")
            return [dict(row) for row in cursor.fetchall()]
        finally:
            conn.close()

    def delete_athlete_profile(self, athlete_id: str) -> bool:
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    cursor = conn.execute("DELETE FROM athlete_baselines WHERE athlete_id = ?", (athlete_id,))
                    return cursor.rowcount > 0
            finally:
                conn.close()

    def save_athlete_profile(self, profile: Dict[str, Any]):
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    conn.execute("""
                        INSERT INTO athlete_baselines (
                            athlete_id, name, sport, position, age, height_cm, weight_kg,
                            resting_hr_baseline, max_hr, vo2_max, chronic_load_baseline,
                            typical_sleep_baseline, history_days, dominant_leg, active_squad, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(athlete_id) DO UPDATE SET
                            name = excluded.name,
                            sport = excluded.sport,
                            position = excluded.position,
                            age = excluded.age,
                            height_cm = excluded.height_cm,
                            weight_kg = excluded.weight_kg,
                            resting_hr_baseline = excluded.resting_hr_baseline,
                            max_hr = excluded.max_hr,
                            vo2_max = excluded.vo2_max,
                            chronic_load_baseline = excluded.chronic_load_baseline,
                            typical_sleep_baseline = excluded.typical_sleep_baseline,
                            history_days = excluded.history_days,
                            dominant_leg = excluded.dominant_leg,
                            active_squad = excluded.active_squad,
                            updated_at = excluded.updated_at;
                    """, (
                        profile.get("athlete_id", "ATH-0824"),
                        profile.get("name", "Daniel Saji"),
                        profile.get("sport", "Football / Midfield Runner"),
                        profile.get("position", "Midfield Runner"),
                        profile.get("age", 24),
                        profile.get("height_cm", 182.0),
                        profile.get("weight_kg", 75.5),
                        profile.get("resting_hr_baseline", 54.0),
                        profile.get("max_hr", 195.0),
                        profile.get("vo2_max", 58.5),
                        profile.get("chronic_load_baseline", 42.0),
                        profile.get("typical_sleep_baseline", 7.8),
                        profile.get("history_days", 180),
                        profile.get("dominant_leg", "Right"),
                        1 if profile.get("active_squad", True) else 0,
                        time.time()
                    ))
            finally:
                conn.close()

    # =========================================================================
    # DEVICE MAPPING METHODS
    # =========================================================================
    def save_device_mapping(self, device_id: str, athlete_id: str):
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    conn.execute("""
                        INSERT INTO device_mappings (device_id, athlete_id, updated_at)
                        VALUES (?, ?, ?)
                        ON CONFLICT(device_id) DO UPDATE SET
                            athlete_id = excluded.athlete_id,
                            updated_at = excluded.updated_at;
                    """, (device_id, athlete_id, time.time()))
            finally:
                conn.close()

    def get_athlete_for_device(self, device_id: str) -> Optional[str]:
        conn = self._get_connection()
        try:
            cursor = conn.execute("SELECT athlete_id FROM device_mappings WHERE device_id = ?", (device_id,))
            row = cursor.fetchone()
            if row:
                return row[0]
            return None
        finally:
            conn.close()

    def get_all_device_mappings(self) -> Dict[str, str]:
        conn = self._get_connection()
        try:
            cursor = conn.execute("SELECT device_id, athlete_id FROM device_mappings")
            return {row[0]: row[1] for row in cursor.fetchall()}
        finally:
            conn.close()

    # =========================================================================
    # FEEDBACK LEDGER METHODS
    # =========================================================================
    def get_all_feedback_records(self, athlete_id: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        try:
            if athlete_id:
                cursor = conn.execute("SELECT * FROM feedback_ledger WHERE athlete_id = ? ORDER BY created_at ASC", (athlete_id,))
            else:
                cursor = conn.execute("SELECT * FROM feedback_ledger ORDER BY created_at ASC")
            return [dict(row) for row in cursor.fetchall()]
        finally:
            conn.close()

    def count_feedback_records(self, athlete_id: Optional[str] = None) -> int:
        conn = self._get_connection()
        try:
            if athlete_id:
                cursor = conn.execute("SELECT COUNT(*) FROM feedback_ledger WHERE athlete_id = ?", (athlete_id,))
            else:
                cursor = conn.execute("SELECT COUNT(*) FROM feedback_ledger")
            return cursor.fetchone()[0]
        finally:
            conn.close()

    def save_feedback_record(self, record: Dict[str, Any]):
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    conn.execute("""
                        INSERT INTO feedback_ledger (
                            id, athlete_id, date, metric, scenario, model_version, predicted,
                            observed, error, percentage_error, status, status_color, created_at, verified_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            athlete_id = excluded.athlete_id,
                            observed = excluded.observed,
                            error = excluded.error,
                            percentage_error = excluded.percentage_error,
                            status = excluded.status,
                            status_color = excluded.status_color,
                            verified_at = excluded.verified_at;
                    """, (
                        record["id"],
                        record.get("athlete_id", "ATH-0824"),
                        record["date"],
                        record["metric"],
                        record["scenario"],
                        record.get("model_version", "v2.4-rf-impulse"),
                        record["predicted"],
                        record.get("observed"),
                        record.get("error"),
                        record.get("percentage_error"),
                        record["status"],
                        record["status_color"],
                        record.get("created_at", time.time()),
                        record.get("verified_at")
                    ))
            finally:
                conn.close()

    def update_feedback_outcome(self, pred_id: str, observed: float, error: float, pct_error: float, status_color: str, verified_at: float) -> bool:
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    cursor = conn.execute("""
                        UPDATE feedback_ledger
                        SET observed = ?, error = ?, percentage_error = ?, status = 'VERIFIED', status_color = ?, verified_at = ?
                        WHERE id = ? AND status = 'PENDING_VERIFICATION';
                    """, (observed, error, pct_error, status_color, verified_at, pred_id))
                    return cursor.rowcount > 0
            finally:
                conn.close()

    # =========================================================================
    # WORKOUT SESSION HISTORY METHODS
    # =========================================================================
    def save_session(self, session: Dict[str, Any]):
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    conn.execute("""
                        INSERT INTO session_history (
                            session_id, athlete_id, start_time, end_time, duration_sec,
                            avg_hr, peak_hr, avg_spo2, calories, steps, training_load,
                            activity, hr_zone_distribution, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(session_id) DO UPDATE SET
                            end_time = excluded.end_time,
                            duration_sec = excluded.duration_sec,
                            avg_hr = excluded.avg_hr,
                            peak_hr = excluded.peak_hr,
                            avg_spo2 = excluded.avg_spo2,
                            calories = excluded.calories,
                            steps = excluded.steps,
                            training_load = excluded.training_load,
                            activity = excluded.activity,
                            hr_zone_distribution = excluded.hr_zone_distribution;
                    """, (
                        session.get("session_id", f"SES-{int(time.time())}"),
                        session.get("athlete_id", "ATH-0824"),
                        session.get("start_time", time.time()),
                        session.get("end_time", time.time()),
                        session.get("duration_sec", 0.0),
                        session.get("avg_hr", 0.0),
                        session.get("peak_hr", 0.0),
                        session.get("avg_spo2", 98.0),
                        session.get("calories", 0.0),
                        session.get("steps", 0),
                        session.get("training_load", 0.0),
                        session.get("activity", "Running"),
                        json.dumps(session.get("hr_zone_distribution", {})),
                        time.time()
                    ))
            finally:
                conn.close()

    def get_recent_sessions(self, athlete_id: str = "ATH-0824", limit: int = 10) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        try:
            cursor = conn.execute("""
                SELECT * FROM session_history
                WHERE athlete_id = ?
                ORDER BY start_time DESC
                LIMIT ?
            """, (athlete_id, limit))
            results = []
            for row in cursor.fetchall():
                d = dict(row)
                if d.get("hr_zone_distribution"):
                    try:
                        d["hr_zone_distribution"] = json.loads(d["hr_zone_distribution"])
                    except Exception:
                        pass
                results.append(d)
            return results
        finally:
            conn.close()

    # =========================================================================
    # AUDIT LOG METHODS
    # =========================================================================
    def save_audit_event(self, event_id: str, event_type: str, severity: str, source: str, details: Dict[str, Any], timestamp_str: str = None):
        with self._lock:
            conn = self._get_connection()
            try:
                now = time.time()
                ts = timestamp_str or time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now))
                with conn:
                    conn.execute("""
                        INSERT OR IGNORE INTO audit_events (
                            event_id, timestamp, event_type, severity, source, details, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?);
                    """, (
                        event_id,
                        ts,
                        event_type,
                        severity,
                        source,
                        json.dumps(details),
                        now
                    ))
            finally:
                conn.close()

    def get_audit_events(self, limit: int = 20) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        try:
            cursor = conn.execute("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?", (limit,))
            events = []
            for row in cursor.fetchall():
                d = dict(row)
                try:
                    d["details"] = json.loads(d["details"])
                except Exception:
                    pass
                events.append(d)
            return events
        finally:
            conn.close()


# Centralized storage singleton
vault = StorageVault()

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
import shutil

try:
    from .config import get_runtime_db_path, SEED_DB_FILE, DEFAULT_RUNTIME_DB
except Exception:
    try:
        from twin.config import get_runtime_db_path, SEED_DB_FILE, DEFAULT_RUNTIME_DB
    except Exception:
        BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        SEED_DB_FILE = os.path.join(BASE_DIR, "twin_athlete.db")
        DEFAULT_RUNTIME_DB = os.path.join(BASE_DIR, "data", "twin_runtime.db")
        def get_runtime_db_path():
            return os.environ.get("TWIN_DB_PATH") or os.environ.get("TWIN_DB_FILE") or DEFAULT_RUNTIME_DB

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_FILE = os.path.join(BASE_DIR, "twin_athlete.db")


class StorageVault:
    """Thread-safe SQLite storage vault with WAL mode, seed replication, and resilient fallback."""

    def __init__(self, db_path: Optional[str] = None):
        raw_path = db_path or os.environ.get("TWIN_DB_PATH") or os.environ.get("TWIN_DB_FILE") or get_runtime_db_path()
        is_serverless = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))

        if raw_path == ":memory:" or str(raw_path).startswith("file:"):
            self.db_path = raw_path
            self.storage_mode = "memory"
            self.persistent = False
        elif is_serverless:
            import tempfile
            tmp_db = os.path.join(tempfile.gettempdir(), "twin_athlete.db")
            seed_source = raw_path if (os.path.exists(raw_path) and os.path.isabs(raw_path)) else SEED_DB_FILE
            if not os.path.exists(tmp_db) and os.path.exists(seed_source):
                try:
                    shutil.copy2(seed_source, tmp_db)
                except Exception as e:
                    print(f"[StorageVault] Warning: Failed to copy seed DB to {tmp_db}: {e}")
            self.db_path = tmp_db
            self.storage_mode = "tmp"
            self.persistent = False
        else:
            if not os.path.isabs(raw_path):
                self.db_path = os.path.abspath(os.path.join(BASE_DIR, raw_path))
            else:
                self.db_path = raw_path
            self.storage_mode = "file"
            self.persistent = True

            # Copy seed DB to runtime location on initial creation if using default runtime DB
            target_is_runtime = (db_path is None) or (os.path.abspath(self.db_path) == os.path.abspath(DEFAULT_RUNTIME_DB))
            if target_is_runtime and not os.path.exists(self.db_path):
                try:
                    os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
                    if os.path.exists(SEED_DB_FILE) and os.path.abspath(SEED_DB_FILE) != os.path.abspath(self.db_path):
                        shutil.copy2(SEED_DB_FILE, self.db_path)
                except Exception as e:
                    print(f"[StorageVault] Notice: Seed copy to runtime DB: {e}")

        self._lock = threading.Lock()
        if self.db_path != ":memory:" and not str(self.db_path).startswith("file:"):
            try:
                os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            except Exception:
                pass
        self._init_db()

    @property
    def is_serverless(self) -> bool:
        return bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))

    def _get_connection(self) -> sqlite3.Connection:
        is_memory = (self.db_path == ":memory:" or str(self.db_path).startswith("file:"))
        retries = 3
        backoff = 0.05
        last_error = None

        for attempt in range(retries):
            try:
                if str(self.db_path).startswith("file:"):
                    conn = sqlite3.connect(self.db_path, uri=True, timeout=5.0, check_same_thread=False)
                else:
                    conn = sqlite3.connect(self.db_path, timeout=5.0, check_same_thread=False)
                conn.row_factory = sqlite3.Row
                try:
                    conn.execute("PRAGMA busy_timeout=5000;")
                except Exception:
                    pass
                try:
                    conn.execute("PRAGMA foreign_keys=ON;")
                except Exception:
                    pass
                if not is_memory:
                    try:
                        conn.execute("PRAGMA journal_mode=WAL;")
                    except sqlite3.OperationalError:
                        try:
                            conn.execute("PRAGMA journal_mode=DELETE;")
                        except Exception:
                            pass
                try:
                    conn.execute("PRAGMA synchronous=NORMAL;")
                except Exception:
                    pass
                return conn
            except sqlite3.OperationalError as e:
                last_error = e
                time.sleep(backoff)
                backoff *= 2

        # Retries exhausted
        if not self.is_serverless:
            print(f"[StorageVault] ERROR: Local database operational error on '{self.db_path}': {last_error}")
            raise last_error

        # Serverless fallback only
        print(f"[StorageVault] Warning: Serverless fallback triggered on '{self.db_path}': {last_error}")
        self.storage_mode = "tmp"
        self.persistent = False
        import tempfile
        temp_db = os.path.join(tempfile.gettempdir(), "twin_athlete.db")
        if self.db_path != temp_db:
            try:
                conn = sqlite3.connect(temp_db, timeout=5.0, check_same_thread=False)
                conn.row_factory = sqlite3.Row
                try:
                    conn.execute("PRAGMA busy_timeout=5000;")
                    conn.execute("PRAGMA journal_mode=WAL;")
                    conn.execute("PRAGMA synchronous=NORMAL;")
                except Exception:
                    pass
                self.db_path = temp_db
                return conn
            except Exception:
                pass

        # Final in-memory fallback for serverless
        self.storage_mode = "memory"
        self.persistent = False
        self.db_path = "file:twin_athlete_mem?mode=memory&cache=shared"
        conn = sqlite3.connect(self.db_path, uri=True, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _run_schema_migrations(self, conn: sqlite3.Connection):
        """Executes table and index creations with safe migrations."""
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

            # Safe migration for existing databases missing position or active_squad or extended fields
            for col_def in [
                "position TEXT DEFAULT 'Midfield Runner'",
                "active_squad INTEGER DEFAULT 1",
                "squad_number TEXT DEFAULT '8'",
                "recovery REAL DEFAULT 80.0",
                "fatigue REAL DEFAULT 35.0",
                "acwr REAL DEFAULT 1.05",
                "device_id TEXT",
                "status TEXT DEFAULT 'Optimal'",
                "status_color TEXT DEFAULT 'green'",
                "recommendation TEXT DEFAULT 'Maintain prescribed periodization'"
            ]:
                try:
                    conn.execute(f"ALTER TABLE athlete_baselines ADD COLUMN {col_def};")
                except sqlite3.OperationalError:
                    pass

            # Seed default baseline profile for ATH-0824 if not present
            try:
                conn.execute("""
                    INSERT OR IGNORE INTO athlete_baselines (
                        athlete_id, name, sport, position, squad_number, age, height_cm, weight_kg,
                        resting_hr_baseline, max_hr, vo2_max, chronic_load_baseline,
                        typical_sleep_baseline, history_days, dominant_leg, recovery, fatigue, acwr, updated_at
                    ) VALUES (
                        'ATH-0824', 'Daniel Saji', 'Football', 'Midfield / Box-to-Box', '8', 24, 182.0, 75.5,
                        54.0, 195.0, 58.5, 42.0, 7.8, 180, 'Right', 78.0, 38.0, 1.08, ?
                    );
                """, (time.time(),))
            except Exception:
                pass

            # Global Application Settings Key-Value Store (shared across devices)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at REAL NOT NULL
                );
            """)

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

            # Safe migrations for session_history extended columns
            for col_def in [
                "id TEXT",
                "device_id TEXT",
                "is_mock INTEGER DEFAULT 0",
                "rpe_post REAL",
                "notes TEXT"
            ]:
                try:
                    conn.execute(f"ALTER TABLE session_history ADD COLUMN {col_def};")
                except sqlite3.OperationalError:
                    pass

            try:
                conn.execute("UPDATE session_history SET id = session_id WHERE id IS NULL;")
            except Exception:
                pass

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

            # 6. Raw Per-Sample Wearable Sensor Readings Table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS samples (
                    id INTEGER PRIMARY KEY,
                    session_id TEXT,
                    device_id TEXT NOT NULL,
                    seq INTEGER,
                    device_ms INTEGER,
                    server_ts REAL NOT NULL,
                    hr REAL,
                    spo2 REAL,
                    ax REAL,
                    ay REAL,
                    az REAL,
                    gx REAL,
                    gy REAL,
                    gz REAL,
                    cadence INTEGER,
                    flags TEXT,
                    is_mock INTEGER DEFAULT 0,
                    FOREIGN KEY(session_id) REFERENCES session_history(session_id)
                );
            """)

            # Indices for rapid querying
            conn.execute("CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback_ledger(status);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_feedback_athlete ON feedback_ledger(athlete_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_session_athlete ON session_history(athlete_id, start_time);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_session_history_id ON session_history(id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_device_athlete ON device_mappings(athlete_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_events(created_at);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_samples_session_id ON samples(session_id, id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_samples_device_ts ON samples(device_id, server_ts);")

    def _init_db(self):
        """Initializes tables and indices if they do not exist."""
        with self._lock:
            conn = self._get_connection()
            try:
                self._run_schema_migrations(conn)
            except sqlite3.OperationalError as oe:
                try:
                    conn.close()
                except Exception:
                    pass
                if not self.is_serverless:
                    print(f"[StorageVault] ERROR: Schema initialization failed on local database '{self.db_path}': {oe}")
                    raise oe

                print(f"[StorageVault] Schema migration error on '{self.db_path}': {oe}. Switching to serverless fallback...")
                self.storage_mode = "tmp"
                self.persistent = False
                import tempfile, shutil
                temp_db = os.path.join(tempfile.gettempdir(), "twin_athlete.db")
                if self.db_path != temp_db:
                    if os.path.exists(self.db_path) and not os.path.exists(temp_db):
                        try:
                            shutil.copy2(self.db_path, temp_db)
                        except Exception:
                            pass
                    self.db_path = temp_db
                    try:
                        conn = self._get_connection()
                        self._run_schema_migrations(conn)
                        return
                    except Exception:
                        try:
                            conn.close()
                        except Exception:
                            pass
                self.storage_mode = "memory"
                self.persistent = False
                self.db_path = "file:twin_athlete_mem?mode=memory&cache=shared"
                conn = self._get_connection()
                try:
                    self._run_schema_migrations(conn)
                finally:
                    conn.close()
            else:
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
                    conn.execute("DELETE FROM device_mappings WHERE athlete_id = ?", (athlete_id,))
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
                            typical_sleep_baseline, history_days, dominant_leg, active_squad,
                            squad_number, recovery, fatigue, acwr, device_id, status, status_color, recommendation, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                            squad_number = excluded.squad_number,
                            recovery = excluded.recovery,
                            fatigue = excluded.fatigue,
                            acwr = excluded.acwr,
                            device_id = excluded.device_id,
                            status = excluded.status,
                            status_color = excluded.status_color,
                            recommendation = excluded.recommendation,
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
                        str(profile.get("squad_number", "8")),
                        float(profile.get("recovery", 80.0)),
                        float(profile.get("fatigue", 35.0)),
                        float(profile.get("acwr", 1.05)),
                        profile.get("device_id"),
                        profile.get("status", "Optimal"),
                        profile.get("status_color", "green"),
                        profile.get("recommendation", "Maintain prescribed periodization"),
                        time.time()
                    ))
            finally:
                conn.close()

    def get_setting(self, key: str, default: Optional[str] = None) -> Optional[str]:
        conn = self._get_connection()
        try:
            cursor = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,))
            row = cursor.fetchone()
            if row:
                return row["value"]
            return default
        finally:
            conn.close()

    def set_setting(self, key: str, value: str) -> bool:
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    conn.execute("""
                        INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
                        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
                    """, (key, str(value), time.time()))
                    return True
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
                sid = session.get("session_id") or session.get("id") or f"SES-{int(time.time())}"
                with conn:
                    conn.execute("""
                        INSERT INTO session_history (
                            session_id, id, athlete_id, device_id, is_mock, start_time, end_time, duration_sec,
                            avg_hr, peak_hr, avg_spo2, calories, steps, training_load,
                            activity, hr_zone_distribution, rpe_post, notes, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(session_id) DO UPDATE SET
                            id = coalesce(excluded.id, session_history.id),
                            athlete_id = excluded.athlete_id,
                            device_id = coalesce(excluded.device_id, session_history.device_id),
                            is_mock = excluded.is_mock,
                            end_time = excluded.end_time,
                            duration_sec = excluded.duration_sec,
                            avg_hr = excluded.avg_hr,
                            peak_hr = excluded.peak_hr,
                            avg_spo2 = excluded.avg_spo2,
                            calories = excluded.calories,
                            steps = excluded.steps,
                            training_load = excluded.training_load,
                            activity = excluded.activity,
                            hr_zone_distribution = excluded.hr_zone_distribution,
                            rpe_post = coalesce(excluded.rpe_post, session_history.rpe_post),
                            notes = coalesce(excluded.notes, session_history.notes);
                    """, (
                        sid,
                        session.get("id") or sid,
                        session.get("athlete_id", "ATH-0824"),
                        session.get("device_id"),
                        1 if session.get("is_mock") else 0,
                        float(session.get("start_time", time.time())),
                        float(session.get("end_time", time.time())),
                        float(session.get("duration_sec", 0.0)),
                        float(session.get("avg_hr", 0.0)),
                        float(session.get("peak_hr", 0.0)),
                        float(session.get("avg_spo2", 98.0)),
                        float(session.get("calories", 0.0)),
                        int(session.get("steps", 0)),
                        float(session.get("training_load", 0.0)),
                        str(session.get("activity", "Running")),
                        json.dumps(session.get("hr_zone_distribution", {})),
                        session.get("rpe_post"),
                        session.get("notes"),
                        time.time()
                    ))
            finally:
                conn.close()

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        conn = self._get_connection()
        try:
            cursor = conn.execute("SELECT * FROM session_history WHERE session_id = ? OR id = ?", (session_id, session_id))
            row = cursor.fetchone()
            if row:
                d = dict(row)
                if d.get("hr_zone_distribution"):
                    try:
                        d["hr_zone_distribution"] = json.loads(d["hr_zone_distribution"])
                    except Exception:
                        pass
                return d
            return None
        finally:
            conn.close()

    def list_sessions(self, limit: int = 50, include_mock: bool = False, athlete_id: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        try:
            query = "SELECT * FROM session_history WHERE 1=1"
            params = []
            if not include_mock:
                query += " AND (is_mock = 0 OR is_mock IS NULL)"
            if athlete_id:
                query += " AND athlete_id = ?"
                params.append(athlete_id)
            query += " ORDER BY start_time DESC LIMIT ?"
            params.append(limit)
            cursor = conn.execute(query, tuple(params))
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

    def update_session_end(self, session_id: str, end_time: float, rpe_post: Optional[float] = None, notes: Optional[str] = None) -> bool:
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    cursor = conn.execute("""
                        UPDATE session_history
                        SET end_time = ?,
                            duration_sec = max(0.0, ? - start_time),
                            rpe_post = coalesce(?, rpe_post),
                            notes = coalesce(?, notes)
                        WHERE session_id = ? OR id = ?;
                    """, (end_time, end_time, rpe_post, notes, session_id, session_id))
                    return cursor.rowcount > 0
            finally:
                conn.close()

    # =========================================================================
    # RAW PER-SAMPLE SENSOR TELEMETRY METHODS
    # =========================================================================
    def insert_samples_batch(self, samples_list: List[Dict[str, Any]]):
        """Batch inserts raw sensor readings in a single transaction."""
        if not samples_list:
            return
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    conn.executemany("""
                        INSERT OR REPLACE INTO samples (
                            id, session_id, device_id, seq, device_ms, server_ts,
                            hr, spo2, ax, ay, az, gx, gy, gz, cadence, flags, is_mock
                        ) VALUES (
                            :id, :session_id, :device_id, :seq, :device_ms, :server_ts,
                            :hr, :spo2, :ax, :ay, :az, :gx, :gy, :gz, :cadence, :flags, :is_mock
                        );
                    """, samples_list)
            finally:
                conn.close()

    def get_max_sample_id(self) -> int:
        """Retrieves maximum sample ID in database for seeding monotonic SSE IDs."""
        conn = self._get_connection()
        try:
            cursor = conn.execute("SELECT MAX(id) FROM samples")
            row = cursor.fetchone()
            if row and row[0] is not None:
                return int(row[0])
            return 0
        finally:
            conn.close()

    def get_samples_for_session(self, session_id: str, limit: int = 1000, offset: int = 0) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        try:
            cursor = conn.execute("""
                SELECT * FROM samples
                WHERE session_id = ?
                ORDER BY id ASC
                LIMIT ? OFFSET ?;
            """, (session_id, limit, offset))
            return [dict(r) for r in cursor.fetchall()]
        finally:
            conn.close()

    def stream_samples_for_session(self, session_id: str, chunk_size: int = 1000, include_mock: bool = False):
        """Generator streaming samples in chunks for CSV export without loading all into memory."""
        offset = 0
        while True:
            conn = self._get_connection()
            try:
                query = "SELECT * FROM samples WHERE session_id = ?"
                params = [session_id]
                if not include_mock:
                    query += " AND (is_mock = 0 OR is_mock IS NULL)"
                query += " ORDER BY id ASC LIMIT ? OFFSET ?"
                params.extend([chunk_size, offset])
                cursor = conn.execute(query, tuple(params))
                rows = cursor.fetchall()
                if not rows:
                    break
                yield [dict(r) for r in rows]
                offset += len(rows)
            finally:
                conn.close()

    def get_samples_after_id(
        self,
        after_id: int,
        athlete_id: Optional[str] = None,
        device_id: Optional[str] = None,
        max_events: int = 5000,
        max_age_sec: float = 300.0
    ) -> List[Dict[str, Any]]:
        """
        Retrieves samples stored with id > after_id for SSE Last-Event-ID replay.
        Capped at max_events (default 5000) or max_age_sec (default 5 min).
        """
        conn = self._get_connection()
        try:
            min_server_ts = time.time() - max_age_sec
            if device_id:
                query = """
                    SELECT * FROM samples
                    WHERE id > ? AND server_ts >= ? AND device_id = ?
                    ORDER BY id ASC LIMIT ?
                """
                params = [after_id, min_server_ts, device_id, max_events]
            elif athlete_id:
                query = """
                    SELECT s.* FROM samples s
                    JOIN session_history sh ON s.session_id = sh.id
                    WHERE s.id > ? AND s.server_ts >= ? AND sh.athlete_id = ?
                    ORDER BY s.id ASC LIMIT ?
                """
                params = [after_id, min_server_ts, athlete_id, max_events]
            else:
                query = """
                    SELECT * FROM samples
                    WHERE id > ? AND server_ts >= ?
                    ORDER BY id ASC LIMIT ?
                """
                params = [after_id, min_server_ts, max_events]

            cursor = conn.execute(query, tuple(params))
            return [dict(r) for r in cursor.fetchall()]
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
try:
    vault = StorageVault()
except Exception as e:
    is_serverless_env = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
    if not is_serverless_env:
        print(f"[twin.storage] FATAL: StorageVault initialization failed on local environment: {e}")
        raise e
    print(f"[twin.storage] Warning: StorageVault init error: {e}. Falling back to in-memory vault for serverless.")
    vault = StorageVault(db_path=":memory:")



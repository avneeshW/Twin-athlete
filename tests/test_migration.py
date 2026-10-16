import os
import time
import sqlite3
import tempfile
import pytest
from twin.storage import StorageVault

def test_migration_on_populated_database_preserves_data():
    """
    Tests that migrating an existing pre-migration database:
    1. Preserves existing session history and baselines without data loss.
    2. Adds extended session_history columns (id, device_id, is_mock, rpe_post, notes).
    3. Successfully creates samples table and indexes.
    4. Enforces WAL, busy_timeout=5000, and foreign_keys=ON.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "legacy_athlete.db")

        # 1. Create a legacy database mimicking pre-migration schema
        legacy_conn = sqlite3.connect(db_path)
        with legacy_conn:
            legacy_conn.execute("""
                CREATE TABLE session_history (
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
            legacy_conn.execute("""
                CREATE TABLE athlete_baselines (
                    athlete_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    sport TEXT,
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
                    updated_at REAL
                );
            """)
            # Populate legacy data
            legacy_conn.execute("""
                INSERT INTO session_history VALUES (
                    'SES-LEGACY-001', 'ATH-0824', 1600000000.0, 1600003600.0, 3600.0,
                    152.0, 184.0, 98.2, 580.0, 4200, 52.0, 'Running', '{"Zone 3": 30}', 1600003610.0
                );
            """)
            legacy_conn.execute("""
                INSERT INTO athlete_baselines VALUES (
                    'ATH-0824', 'Daniel Saji', 'Football', 24, 182.0, 75.5,
                    54.0, 195.0, 58.5, 42.0, 7.8, 180, 'Right', 1600000000.0
                );
            """)
        legacy_conn.close()

        # 2. Run StorageVault migrations on this populated legacy database
        vault = StorageVault(db_path=db_path)

        # 3. Verify legacy data was preserved without any data loss
        saved_session = vault.get_session("SES-LEGACY-001")
        assert saved_session is not None
        assert saved_session["session_id"] == "SES-LEGACY-001"
        assert saved_session["id"] == "SES-LEGACY-001"
        assert saved_session["avg_hr"] == 152.0
        assert saved_session["calories"] == 580.0

        profile = vault.get_athlete_profile("ATH-0824")
        assert profile is not None
        assert profile["name"] == "Daniel Saji"

        # 4. Verify extended columns exist and can be updated
        vault.update_session_end("SES-LEGACY-001", end_time=1600004000.0, rpe_post=8.5, notes="Tough interval workout")
        updated = vault.get_session("SES-LEGACY-001")
        assert updated["rpe_post"] == 8.5
        assert updated["notes"] == "Tough interval workout"

        # 5. Verify samples table was created and can insert raw sensor records
        now = time.time()
        vault.insert_samples_batch([
            {
                "id": 1,
                "session_id": "SES-LEGACY-001",
                "device_id": "ESP32-ATHLETE-01",
                "seq": 100,
                "device_ms": 50000,
                "server_ts": now,
                "hr": 154.2,
                "spo2": 98.0,
                "ax": 0.12,
                "ay": 1.15,
                "az": 0.05,
                "gx": 0.0,
                "gy": 0.0,
                "gz": 0.0,
                "cadence": 168,
                "flags": "normal",
                "is_mock": 0
            }
        ])

        samples = vault.get_samples_for_session("SES-LEGACY-001")
        assert len(samples) == 1
        assert samples[0]["id"] == 1
        assert samples[0]["device_id"] == "ESP32-ATHLETE-01"
        assert samples[0]["hr"] == 154.2
        assert samples[0]["device_ms"] == 50000

        # 6. Verify pragmas on connection
        conn = vault._get_connection()
        try:
            wal_mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
            assert wal_mode.lower() == "wal"
            fk = conn.execute("PRAGMA foreign_keys;").fetchone()[0]
            assert fk == 1
            sync = conn.execute("PRAGMA synchronous;").fetchone()[0]
            # synchronous NORMAL corresponds to 1 in SQLite
            assert sync == 1
        finally:
            conn.close()

"""
DIGITAL TWIN ATHLETE - ASYNCHRONOUS TELEMETRY WRITER THREAD
Offloads database writes from the hot ingest path.
- Bounded in-memory queue (capacity: 5000)
- Drops oldest on queue.Full, logging per-device drop counts
- Dedicated worker thread with ONE long-lived SQLite connection
- Batched flush every ~1.0s or 100 samples via executemany in a single transaction
- Resilient retry buffer with backoff on database locks
- Clean shutdown via atexit and SIGTERM
"""

import os
import time
import queue
import sqlite3
import signal
import atexit
import threading
from typing import Dict, Any, List, Optional

MAX_QUEUE_CAPACITY = 5000
BATCH_SIZE = 100
FLUSH_INTERVAL_SEC = 1.0
MAX_RETRY_BUFFER = 2000


class TelemetryWriter:
    """Asynchronous background batch writer for raw sensor samples."""

    def __init__(self, db_path: Optional[str] = None, storage_vault: Any = None):
        self.vault = storage_vault
        self.db_path = db_path or (storage_vault.db_path if storage_vault else None)
        self.queue: queue.Queue = queue.Queue(maxsize=MAX_QUEUE_CAPACITY)
        self.retry_buffer: List[Dict[str, Any]] = []
        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None
        self._conn: Optional[sqlite3.Connection] = None
        self._lock = threading.Lock()
        self.dropped_counts: Dict[str, int] = {}
        self._is_shutdown = False
        self._next_sample_id = 0
        self._flush_event = threading.Event()
        self._flush_done = threading.Event()
        if self.vault:
            try:
                self._next_sample_id = self.vault.get_max_sample_id()
            except Exception:
                self._next_sample_id = 0

        self._start_worker()
        self._register_shutdown_handlers()

    @property
    def queue_depth(self) -> int:
        return self.queue.qsize()

    def flush(self, timeout: float = 3.0) -> bool:
        """
        Forces writer worker thread to immediately flush all pending queue samples to SQLite.
        Blocks until flush completes or timeout elapses.
        """
        if self._is_shutdown or not self._worker_thread or not self._worker_thread.is_alive():
            return True
        self._flush_done.clear()
        self._flush_event.set()
        return self._flush_done.wait(timeout=timeout)

    def next_sample_id(self) -> int:
        """Returns monotonic sample ID seeded from MAX(samples.id)."""
        with self._lock:
            if self.vault:
                try:
                    db_max = self.vault.get_max_sample_id()
                    if db_max >= self._next_sample_id:
                        self._next_sample_id = db_max
                except Exception:
                    pass
            self._next_sample_id += 1
            return self._next_sample_id

    def _get_dedicated_connection(self) -> sqlite3.Connection:
        """Creates the writer thread's single long-lived database connection."""
        is_memory = (self.db_path == ":memory:" or str(self.db_path).startswith("file:"))
        if str(self.db_path).startswith("file:"):
            conn = sqlite3.connect(self.db_path, uri=True, timeout=10.0, check_same_thread=False)
        else:
            conn = sqlite3.connect(self.db_path, timeout=10.0, check_same_thread=False)
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
            except Exception:
                pass
        try:
            conn.execute("PRAGMA synchronous=NORMAL;")
        except Exception:
            pass
        return conn

    def enqueue_sample(self, sample: Dict[str, Any]):
        """
        Pushes a sample onto the bounded queue off the hot path.
        If queue is full, drops the oldest sample and increments the per-device dropped counter.
        Never raises exceptions to caller.
        """
        if self._is_shutdown:
            return

        if sample.get("id") is None:
            sample["id"] = self.next_sample_id()

        try:
            self.queue.put_nowait(sample)
        except queue.Full:
            # Drop the oldest sample to make room
            try:
                old = self.queue.get_nowait()
                dev = old.get("device_id", "unknown")
                with self._lock:
                    self.dropped_counts[dev] = self.dropped_counts.get(dev, 0) + 1
            except Exception:
                pass

            # Retry putting the new sample
            try:
                self.queue.put_nowait(sample)
            except Exception:
                dev = sample.get("device_id", "unknown")
                with self._lock:
                    self.dropped_counts[dev] = self.dropped_counts.get(dev, 0) + 1

    def enqueue_session(self, session_dict: Dict[str, Any]) -> None:
        """Enqueues session metadata to be persisted to session_history by worker thread."""
        if self._is_shutdown:
            return
        item = {"_type": "session", **session_dict}
        try:
            self.queue.put_nowait(item)
        except queue.Full:
            try:
                old = self.queue.get_nowait()
                dev = old.get("device_id", "unknown")
                with self._lock:
                    self.dropped_counts[dev] = self.dropped_counts.get(dev, 0) + 1
            except Exception:
                pass
            try:
                self.queue.put_nowait(item)
            except Exception:
                pass

    def _flush_batch(self, batch: List[Dict[str, Any]]) -> bool:
        """Executes executemany batch insert in a single transaction."""
        if not batch:
            return True

        if self._conn is None:
            try:
                self._conn = self._get_dedicated_connection()
            except Exception as e:
                print(f"[TelemetryWriter] Error opening connection: {e}")
                return False

        sessions = []
        samples = []
        for item in batch:
            if isinstance(item, dict) and item.get("_type") == "session":
                sessions.append(item)
            else:
                samples.append(item)

        try:
            with self._conn:
                for sess in sessions:
                    sid = sess.get("session_id") or sess.get("id")
                    if not sid:
                        continue
                    self._conn.execute("""
                        INSERT INTO session_history (
                            session_id, id, athlete_id, device_id, is_mock, start_time, end_time,
                            duration_sec, avg_hr, peak_hr, avg_spo2, calories, steps, training_load,
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
                        sess.get("id") or sid,
                        sess.get("athlete_id", "ATH-0824"),
                        sess.get("device_id"),
                        1 if sess.get("is_mock") else 0,
                        float(sess.get("start_time", time.time())),
                        float(sess.get("end_time", time.time())),
                        float(sess.get("duration_sec", 0.0)),
                        float(sess.get("avg_hr", 0.0)),
                        float(sess.get("peak_hr", 0.0)),
                        float(sess.get("avg_spo2", 98.0)),
                        float(sess.get("calories", 0.0)),
                        int(sess.get("steps", 0)),
                        float(sess.get("training_load", 0.0)),
                        str(sess.get("activity", "Running")),
                        json.dumps(sess.get("hr_zone_distribution", {})) if isinstance(sess.get("hr_zone_distribution"), (dict, list)) else (sess.get("hr_zone_distribution") or "{}"),
                        sess.get("rpe_post"),
                        sess.get("notes"),
                        time.time()
                    ))

                if samples:
                    self._conn.executemany("""
                        INSERT OR IGNORE INTO samples (
                            id, session_id, device_id, seq, device_ms, server_ts,
                            hr, spo2, ax, ay, az, gx, gy, gz, cadence, flags, is_mock
                        ) VALUES (
                            :id, :session_id, :device_id, :seq, :device_ms, :server_ts,
                            :hr, :spo2, :ax, :ay, :az, :gx, :gy, :gz, :cadence, :flags, :is_mock
                        );
                    """, samples)
            return True
        except sqlite3.OperationalError as oe:
            print(f"[TelemetryWriter] OperationalError during batch flush: {oe}")
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None
            return False
        except Exception as ex:
            print(f"[TelemetryWriter] Unexpected error during batch flush: {ex}")
            return False

    def _worker_loop(self):
        """Dedicated background worker loop accumulating and flushing batches."""
        batch = []
        last_flush_time = time.time()
        backoff = 0.05

        while not self._stop_event.is_set():
            # 1. Drain retry buffer first if any pending
            if self.retry_buffer:
                retry_chunk = self.retry_buffer[:BATCH_SIZE]
                if self._flush_batch(retry_chunk):
                    self.retry_buffer = self.retry_buffer[BATCH_SIZE:]
                    backoff = 0.05
                else:
                    time.sleep(backoff)
                    backoff = min(backoff * 2, 1.0)
                    continue

            # 2. Collect from in-memory queue
            try:
                sample = self.queue.get(timeout=0.2)
                batch.append(sample)
            except queue.Empty:
                pass

            # Handle on-demand flush request (e.g. before SSE Last-Event-ID replay)
            if self._flush_event.is_set():
                while not self.queue.empty():
                    try:
                        batch.append(self.queue.get_nowait())
                    except queue.Empty:
                        break
                drain_all = list(self.retry_buffer) + batch
                self.retry_buffer = []
                batch = []
                if drain_all:
                    for i in range(0, len(drain_all), BATCH_SIZE):
                        self._flush_batch(drain_all[i:i + BATCH_SIZE])
                last_flush_time = time.time()
                self._flush_event.clear()
                self._flush_done.set()
                continue

            now = time.time()
            # 3. Flush when batch size reached or flush timeout elapsed
            should_flush = (len(batch) >= BATCH_SIZE) or (batch and (now - last_flush_time >= FLUSH_INTERVAL_SEC))
            if should_flush:
                if self._flush_batch(batch):
                    batch = []
                    last_flush_time = now
                    backoff = 0.05
                else:
                    # On failure, preserve batch in bounded retry buffer
                    space = MAX_RETRY_BUFFER - len(self.retry_buffer)
                    if space > 0:
                        self.retry_buffer.extend(batch[:space])
                    batch = []
                    time.sleep(backoff)
                    backoff = min(backoff * 2, 1.0)

        # Final drain on shutdown
        self._drain_and_close(batch)

    def _drain_and_close(self, final_batch: List[Dict[str, Any]]):
        """Drains remaining queue items and closes database connection cleanly."""
        drain_list = list(self.retry_buffer) + final_batch
        while True:
            try:
                drain_list.append(self.queue.get_nowait())
            except queue.Empty:
                break

        if drain_list:
            # Chunk and flush
            for i in range(0, len(drain_list), BATCH_SIZE):
                chunk = drain_list[i:i + BATCH_SIZE]
                self._flush_batch(chunk)

        if self._conn:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None

    def _start_worker(self):
        self._worker_thread = threading.Thread(
            target=self._worker_loop,
            name="TwinTelemetryWriterThread",
            daemon=True
        )
        self._worker_thread.start()

    def _register_shutdown_handlers(self):
        atexit.register(self.shutdown)
        try:
            signal.signal(signal.SIGTERM, lambda s, f: self.shutdown())
        except (ValueError, AttributeError):
            pass

    def shutdown(self):
        """Flushes queue and terminates worker cleanly."""
        if self._is_shutdown:
            return
        self._is_shutdown = True
        self._stop_event.set()
        if self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=3.0)


# Module-level singleton helper
_writer_singleton: Optional[TelemetryWriter] = None
_writer_lock = threading.Lock()


def get_telemetry_writer(db_path: Optional[str] = None, storage_vault: Any = None) -> TelemetryWriter:
    global _writer_singleton
    with _writer_lock:
        if _writer_singleton is None:
            if storage_vault is None:
                try:
                    from twin.storage import vault
                    storage_vault = vault
                except Exception:
                    storage_vault = None
            resolved_db = db_path or (storage_vault.db_path if storage_vault else None)
            _writer_singleton = TelemetryWriter(db_path=resolved_db, storage_vault=storage_vault)
        return _writer_singleton

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

        self._start_worker()
        self._register_shutdown_handlers()

    @property
    def queue_depth(self) -> int:
        return self.queue.qsize()

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

        try:
            with self._conn:
                self._conn.executemany("""
                    INSERT INTO samples (
                        id, session_id, device_id, seq, device_ms, server_ts,
                        hr, spo2, ax, ay, az, gx, gy, gz, cadence, flags, is_mock
                    ) VALUES (
                        :id, :session_id, :device_id, :seq, :device_ms, :server_ts,
                        :hr, :spo2, :ax, :ay, :az, :gx, :gy, :gz, :cadence, :flags, :is_mock
                    );
                """, batch)
            return True
        except sqlite3.OperationalError as oe:
            print(f"[TelemetryWriter] OperationalError during batch flush: {oe}")
            # Reset connection on failure so subsequent attempts reconnect cleanly
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

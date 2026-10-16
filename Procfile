# Single-process deployment (workers=1, worker-class=gthread): SSE broadcast queues, writer thread, and in-memory sample queue are in-process singletons.
web: gunicorn --bind 0.0.0.0:$PORT --workers 1 --worker-class gthread --threads 8 --timeout 0 app:app

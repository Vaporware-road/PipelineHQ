#!/usr/bin/env bash
# Run all local processes for PipelineHQ (macOS / Linux).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

source .venv/bin/activate

echo "Starting Django on :8000"
(cd backend && python manage.py runserver 8000) &
DJANGO_PID=$!

echo "Starting Celery worker"
(cd backend && celery -A config worker -l info) &
WORKER_PID=$!

echo "Starting Celery beat"
(cd backend && celery -A config beat -l info) &
BEAT_PID=$!

echo "Starting Next.js on :3000"
(cd frontend && npm run dev -- -p 3000) &
FE_PID=$!

cleanup() {
  kill $DJANGO_PID $WORKER_PID $BEAT_PID $FE_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "PipelineHQ up:"
echo "  UI  http://127.0.0.1:3000"
echo "  API http://127.0.0.1:8000/api/"
echo "Demo users: sdr / ae / manager  password: demo1234"
wait

#!/bin/sh
# Starts Finance Tracker in Docker, waits until it answers, and prints the address to use.
# Usage: scripts/start.sh
set -eu
cd "$(dirname "$0")/.."

mkdir -p backups

echo "Starting Finance Tracker (the first start builds the image and takes a few minutes)..."
if ! docker compose up -d --build; then
  echo
  echo "Docker could not start the app. Is Docker Desktop running?"
  exit 1
fi

echo "Waiting for the app to answer..."
tries=0
until curl -fsS -m 3 http://localhost:8080/api/health >/dev/null 2>&1; do
  tries=$((tries + 1))
  if [ "$tries" -ge 60 ]; then
    echo
    echo "The app did not answer within 2 minutes. Its log follows:"
    docker compose logs --tail 50 app
    exit 1
  fi
  sleep 2
done

ip=""
if command -v ipconfig >/dev/null 2>&1; then
  ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
fi
if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
  ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
fi

echo
echo "Finance Tracker is running."
echo "  On this computer:                http://localhost:8080"
if [ -n "$ip" ]; then
  echo "  From a phone or another computer: http://$ip:8080"
fi
echo "  Or, on most home networks:       http://$(hostname -s 2>/dev/null || hostname).local:8080"
echo
echo "Stop it with scripts/stop.sh. Backups are saved in the backups folder."

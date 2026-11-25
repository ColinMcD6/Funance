#!/bin/sh
# Stops Finance Tracker. The data stays in the finance_data Docker volume.
# Usage: scripts/stop.sh
set -eu
cd "$(dirname "$0")/.."
docker compose down
echo "Finance Tracker is stopped. Start it again with scripts/start.sh."

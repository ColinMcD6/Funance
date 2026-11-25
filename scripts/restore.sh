#!/bin/sh
# Replaces the app's database with a backup file, then starts the app again.
# The database being replaced is saved as a new backup first, so a restore can be undone.
# Usage: scripts/restore.sh backups/finance-20261120-120000.sqlite
set -eu
if [ "$#" -ne 1 ]; then
  echo "Usage: scripts/restore.sh backups/finance-YYYYMMDD-HHMMSS.sqlite"
  exit 2
fi
if [ ! -f "$1" ]; then
  echo "No such file: $1"
  exit 2
fi
# Resolve the file before changing folder, so a path relative to where you are works.
backup_folder=$(cd "$(dirname "$1")" && pwd)
backup_name=$(basename "$1")
script_dir=$(cd "$(dirname "$0")" && pwd)
cd "$script_dir/.."

echo "Stopping the app..."
docker compose stop app

echo "Restoring $backup_name..."
if ! docker compose run --rm --no-deps -v "$backup_folder:/restore:ro" app \
  node apps/server/dist/restore.js "/restore/$backup_name"; then
  echo
  echo "The restore failed and the database was not changed. Starting the app again."
  "$script_dir/start.sh"
  exit 1
fi

exec "$script_dir/start.sh"

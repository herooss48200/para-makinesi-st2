#!/usr/bin/env bash
set -euo pipefail
DATA_DIR="${AGROS_DATA_DIR:-$HOME/apps/para-makinesi-st2/data}"; OUT="${AGROS_ST2_BACKUP_DIR:-$HOME/agros-st2-data-backups}"; mkdir -p "$OUT"; tar -C "$(dirname "$DATA_DIR")" -czf "$OUT/data-$(date +%Y%m%d-%H%M%S).tar.gz" "$(basename "$DATA_DIR")"; echo "✅ $OUT"

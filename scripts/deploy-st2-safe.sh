#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${AGROS_ST2_APP_DIR:-$HOME/apps/para-makinesi-st2}"
PACKAGE="${1:?Kullanım: bash scripts/deploy-st2-safe.sh /path/to/ST2-v5.6.3.zip}"
DATA_DIR="${AGROS_DATA_DIR:-$APP_DIR/data}"
BACKUP_ROOT="${AGROS_ST2_BACKUP_DIR:-$HOME/agros-st2-data-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_ROOT"
[ -d "$DATA_DIR" ] && tar -C "$(dirname "$DATA_DIR")" -czf "$BACKUP_ROOT/data-$STAMP.tar.gz" "$(basename "$DATA_DIR")"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
unzip -q "$PACKAGE" -d "$TMP"
SRC="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)"
[ -n "$SRC" ] || SRC="$TMP"
if find "$SRC" -path '*/data/*' -type f | grep -q .; then echo '❌ Paket data dosyası içeriyor; deploy durduruldu.'; exit 1; fi
mkdir -p "$APP_DIR"
rsync -a --delete --exclude data/ --exclude .env --exclude node_modules/ "$SRC/" "$APP_DIR/"
cd "$APP_DIR"
npm install --omit=dev
npm run verify:v563
pm2 restart "${AGROS_PM2_NAME:-agros-st2}" --update-env
pm2 save
echo "✅ Güvenli deploy tamamlandı | Data korunuyor: $DATA_DIR | Yedek: $BACKUP_ROOT/data-$STAMP.tar.gz"

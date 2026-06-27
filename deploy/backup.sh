#!/usr/bin/env bash
# AEN ERP — Daily backup script
# Backs up: PostgreSQL database + uploaded files
# Schedule via cron: 0 3 * * * bash /var/www/aen-erp/deploy/backup.sh >> /var/log/aen-erp/backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/aen-erp}"
UPLOAD_DIR="${UPLOAD_DIR:-/var/data/aen-erp/uploads}"
DB_NAME="${DB_NAME:-procurement_erp}"
DB_USER="${DB_USER:-erp}"
KEEP_DAYS="${KEEP_DAYS:-14}"

DATE=$(date +%Y-%m-%d_%H-%M)
DEST="${BACKUP_DIR}/${DATE}"

echo "[${DATE}] Starting AEN ERP backup..."

mkdir -p "$DEST"

# ── PostgreSQL dump ────────────────────────────────────────────────────────────
echo "  Dumping database ${DB_NAME}..."
sudo -u postgres pg_dump \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  "${DB_NAME}" \
  > "${DEST}/db.dump"
echo "  DB dump: $(du -sh "${DEST}/db.dump" | cut -f1)"

# ── Uploaded files ────────────────────────────────────────────────────────────
if [ -d "$UPLOAD_DIR" ]; then
  echo "  Archiving uploads..."
  tar -czf "${DEST}/uploads.tar.gz" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
  echo "  Uploads archive: $(du -sh "${DEST}/uploads.tar.gz" | cut -f1)"
else
  echo "  Upload directory not found — skipping file backup."
fi

# ── Checksum ──────────────────────────────────────────────────────────────────
sha256sum "${DEST}"/* > "${DEST}/SHA256SUMS"
echo "  Checksums written."

# ── Prune old backups ─────────────────────────────────────────────────────────
echo "  Removing backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -maxdepth 1 -type d -mtime "+${KEEP_DAYS}" -exec rm -rf {} + 2>/dev/null || true

USED=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "[${DATE}] Backup complete. Total size: ${USED}. Stored in: ${DEST}"

# ── Optional: remote copy (uncomment + configure) ─────────────────────────────
# Requires: ssh key auth to backup host configured in ~/.ssh/config
# rsync -avz --delete "${BACKUP_DIR}/" backup-host:/remote/backups/aen-erp/

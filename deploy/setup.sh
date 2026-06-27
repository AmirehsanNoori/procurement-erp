#!/usr/bin/env bash
# AEN ERP — Ubuntu VPS first-time setup
# Tested on Ubuntu 22.04 LTS
# Run as root or with sudo: bash deploy/setup.sh
set -euo pipefail

APP_DIR="/var/www/aen-erp"
LOG_DIR="/var/log/aen-erp"
UPLOAD_DIR="/var/data/aen-erp/uploads"
DOMAIN="${1:-yourdomain.com}"

echo "==> [1/9] System update"
apt-get update -y && apt-get upgrade -y

echo "==> [2/9] Install Node.js 20 LTS (via NodeSource)"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "==> [3/9] Install PostgreSQL 16"
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

echo "==> [4/9] Install Nginx + Certbot"
apt-get install -y nginx certbot python3-certbot-nginx
systemctl enable nginx

echo "==> [5/9] Install PM2"
npm install -g pm2

echo "==> [6/9] Create application directories"
mkdir -p "$APP_DIR" "$LOG_DIR" "$UPLOAD_DIR"
chown -R www-data:www-data "$UPLOAD_DIR"
chmod 750 "$UPLOAD_DIR"
mkdir -p "$APP_DIR/server" "$APP_DIR/web"

echo "==> [7/9] PostgreSQL — create database and user"
# Edit the password before running!
DB_PASS="${DB_PASSWORD:-change_me_in_production}"
sudo -u postgres psql <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'erp') THEN
    CREATE ROLE erp LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE procurement_erp OWNER erp'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'procurement_erp')
\gexec
SQL
echo "    Database ready: postgresql://erp:***@localhost:5432/procurement_erp"

echo "==> [8/9] Nginx site config"
cp "$(dirname "$0")/nginx.conf" /etc/nginx/sites-available/aen-erp
sed -i "s/yourdomain.com/${DOMAIN}/g" /etc/nginx/sites-available/aen-erp
ln -sf /etc/nginx/sites-available/aen-erp /etc/nginx/sites-enabled/aen-erp
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "==> Setup complete! Next steps:"
echo ""
echo "  1. Copy project files to ${APP_DIR}"
echo "     scp -r server web root@<vps-ip>:${APP_DIR}/"
echo ""
echo "  2. Configure server/.env:"
echo "     DATABASE_URL=postgresql://erp:${DB_PASS}@localhost:5432/procurement_erp"
echo "     JWT_SECRET=<random 64-char string>"
echo "     REFRESH_SECRET=<random 64-char string>"
echo "     UPLOAD_DIR=${UPLOAD_DIR}"
echo "     NODE_ENV=production"
echo ""
echo "  3. Build and migrate:"
echo "     cd ${APP_DIR}/server && npm ci && npm run build"
echo "     npx prisma migrate deploy"
echo "     npx prisma db seed"
echo ""
echo "  4. Build frontend:"
echo "     cd ${APP_DIR}/web && npm ci && npm run build"
echo ""
echo "  5. Start API with PM2:"
echo "     pm2 start ${APP_DIR}/deploy/pm2.config.js --env production"
echo "     pm2 save && pm2 startup"
echo ""
echo "  6. SSL with Certbot:"
echo "     certbot --nginx -d ${DOMAIN}"
echo ""
echo "  7. Configure daily backup:"
echo "     crontab -e"
echo "     # Add: 0 3 * * * bash ${APP_DIR}/deploy/backup.sh >> ${LOG_DIR}/backup.log 2>&1"

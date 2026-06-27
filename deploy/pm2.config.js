// PM2 process configuration for AEN ERP
// Usage:
//   pm2 start deploy/pm2.config.js
//   pm2 save
//   pm2 startup    ← follow the printed command to auto-start on reboot

module.exports = {
  apps: [
    {
      name: 'aen-erp-api',
      cwd: '/var/www/aen-erp/server',
      script: 'dist/index.js',
      interpreter: 'node',

      // Cluster mode for multi-core CPUs (or "fork" for single-core VPS)
      instances: 1,
      exec_mode: 'fork',

      // Auto-restart on crash
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',

      // Environment — override with actual secrets via /var/www/aen-erp/server/.env
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },

      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: '/var/log/aen-erp/api-out.log',
      error_file: '/var/log/aen-erp/api-error.log',
      merge_logs: true,

      // Graceful shutdown
      kill_timeout: 5000,
      shutdown_with_message: true,

      // Restart delay on crash
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};

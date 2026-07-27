const path = require('path');

const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'agros-st2',
      script: './bot.js',
      cwd: ROOT,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '750M',
      out_file: path.join(ROOT, 'logs-st2', 'agros-st2-out.log'),
      error_file: path.join(ROOT, 'logs-st2', 'agros-st2-error.log'),
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        TZ: 'Europe/Istanbul',
        AGROS_INSTANCE_ID: 'ST2',
        AGROS_APP_NAME: 'AGROS ST2',
        AGROS_REPO_SLUG: 'para-makinesi-st2',
        AGROS_PM2_NAME: 'agros-st2',
        AGROS_DATA_DIR: 'data',
        AGROS_LOG_DIR: 'logs-st2',
        AGROS_TELEGRAM_PREFIX: 'AGROS ST2'
      }
    }
  ]
};

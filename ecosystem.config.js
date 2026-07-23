module.exports = {
  apps: [
    {
      name: 'para-makinesi-st2',
      script: './bot.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        TZ: 'Europe/Istanbul'
      }
    }
  ]
};

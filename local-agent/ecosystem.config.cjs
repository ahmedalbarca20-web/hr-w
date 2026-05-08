module.exports = {
  apps: [
    {
      name: 'zk-agent',
      script: './agent.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      min_uptime: '10s',
      max_restarts: 50,
      restart_delay: 4000,
      exp_backoff_restart_delay: 2000,
      max_memory_restart: '250M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

module.exports = {
  apps: [
    {
      name: 'zk-agent',
      script: './agent.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '250M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

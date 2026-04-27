const path = require('path');
const root  = __dirname;

module.exports = {
  apps: [
    {
      name        : 'hr-backend',
      script      : path.join(root, 'backend', 'server.js'),
      cwd         : path.join(root, 'backend'),
      watch       : false,
      instances   : 1,
      exec_mode   : 'fork',
      env: {
        NODE_ENV : 'production',
      },
      error_file  : path.join(root, 'backend', 'logs', 'pm2-backend-error.log'),
      out_file    : path.join(root, 'backend', 'logs', 'pm2-backend-out.log'),
      merge_logs  : true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name        : 'hr-frontend',
      // Use vite.js directly via Node (Windows-compatible, avoids .cmd/.sh issues)
      script      : path.join(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'),
      args        : '--host 0.0.0.0 --port 3000',
      cwd         : path.join(root, 'frontend'),
      watch       : false,
      instances   : 1,
      exec_mode   : 'fork',
      error_file  : path.join(root, 'backend', 'logs', 'pm2-frontend-error.log'),
      out_file    : path.join(root, 'backend', 'logs', 'pm2-frontend-out.log'),
      merge_logs  : true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};

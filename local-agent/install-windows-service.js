'use strict';

/**
 * Install the polling agent as a Windows Service (run from elevated PowerShell once).
 * Requires: npm install node-windows (optional dependency).
 *
 *   cd local-agent
 *   npm install node-windows
 *   node install-windows-service.js
 */

const path = require('path');

let Service;
try {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  Service = require('node-windows').Service;
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('Missing dependency: run  npm install node-windows  in the local-agent folder.');
  process.exit(1);
}

const scriptPath = path.join(__dirname, 'polling-agent.js');

const svc = new Service({
  name: 'AttendanceAgent',
  description: 'HR ZK outbound polling agent — pulls jobs from cloud API and talks to devices on LAN.',
  script: scriptPath,
  nodeOptions: ['--max-old-space-size=512'],
  workingDirectory: __dirname,
});

svc.on('install', () => {
  // eslint-disable-next-line no-console
  console.log('AttendanceAgent service installed; starting...');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  // eslint-disable-next-line no-console
  console.log('Service already installed.');
});

svc.on('start', () => {
  // eslint-disable-next-line no-console
  console.log('AttendanceAgent started.');
});

svc.install();

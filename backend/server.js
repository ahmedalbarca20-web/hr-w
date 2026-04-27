'use strict';

/**
 * HTTP server entry point.
 *
 * Start order:
 *   1. Load environment variables (.env)
 *   2. Connect to database
 *   3. Start HTTP server
 */

require('dotenv').config();

const app           = require('./src/app');
const { connectDB } = require('./src/config/db');

const PORT = parseInt(process.env.PORT || '5000', 10);

const start = async () => {
  try {
    await connectDB();

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(
        `[SERVER] HR API running on port ${PORT} (${process.env.NODE_ENV || 'development'})`
      );
      console.log(`[SERVER] Local:   http://localhost:${PORT}/api/health`);
    });

    // Graceful shutdown
    const shutdown = (signal) => {
      console.log(`[SERVER] ${signal} received — shutting down gracefully...`);
      server.close(() => {
        console.log('[SERVER] HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (err) {
    console.error('[SERVER] Failed to start:', err);
    process.exit(1);
  }
};

start();


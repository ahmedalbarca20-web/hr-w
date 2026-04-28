'use strict';

const app = require('../src/app');
const { connectDB } = require('../src/config/db');

let dbReadyPromise = null;

module.exports = async (req, res) => {
  try {
    if (!dbReadyPromise) {
      dbReadyPromise = connectDB();
    }
    await dbReadyPromise;
    return app(req, res);
  } catch (error) {
    // Allow retry on next invocation if initial DB bootstrap failed.
    dbReadyPromise = null;
    console.error('[VERCEL_API] bootstrap failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Backend bootstrap failed',
    });
  }
};

'use strict';

const app = require('../backend/src/app');
const { connectDB } = require('../backend/src/config/db');

let dbReadyPromise = null;

module.exports = async (req, res) => {
  try {
    if (!dbReadyPromise) {
      dbReadyPromise = connectDB();
    }
    await dbReadyPromise;
    return app(req, res);
  } catch (error) {
    dbReadyPromise = null;
    console.error('[ROOT_VERCEL_API] bootstrap failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Backend bootstrap failed',
    });
  }
};

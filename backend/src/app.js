'use strict';

/**
 * Express application setup.
 *
 * Exports the configured `app` without starting the server,
 * making it importable in tests without binding a port.
 */

require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');

const router                         = require('./routes/index');
const { sendError, ERROR_CODES }     = require('./utils/response');

const app = express();

// ── Security headers ─────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────
// With credentials: true, the browser rejects Access-Control-Allow-Origin: *.
// Always echo a concrete origin string — never cb(null, true) (ambiguous with some proxies).
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const vercelPreviewOk = () => {
  const v = (process.env.ALLOW_VERCEL_PREVIEW_ORIGINS || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
};

/** HTTPS only — Vercel production + preview hosts. */
const isVercelAppOrigin = (o) => /^https:\/\/.+\.vercel\.app$/i.test(o || '');

function corsOriginDelegate(incoming, cb) {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const devOrigin = incoming || allowedOrigins[0] || 'http://localhost:5173';
    return cb(null, devOrigin);
  }

  if (!incoming) {
    return cb(null, false);
  }

  if (allowedOrigins.includes(incoming)) {
    return cb(null, incoming);
  }

  if (vercelPreviewOk() && isVercelAppOrigin(incoming)) {
    return cb(null, incoming);
  }

  cb(new Error(`CORS: origin '${incoming}' is not allowed`));
}

app.use(cors({
  origin          : corsOriginDelegate,
  credentials     : true, // httpOnly cookie exchange — requires explicit Allow-Origin
  methods         : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders    : ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
}));

// ── Request parsing ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── HTTP logging (skip in test to keep test output clean) ───────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Rate limiting ─────────────────────────────────────────────────────────
// Tight limit on the login endpoint to prevent brute-force
const loginLimiter = rateLimit({
  windowMs        : 15 * 60 * 1000, // 15 minutes
  max             : 20,
  standardHeaders : true,
  legacyHeaders   : false,
  message         : { success: false, error: 'Too many login attempts. Try again later.' },
});

app.use('/api/auth/login', loginLimiter);

// General API limiter
const apiLimiter = rateLimit({
  windowMs        : 15 * 60 * 1000,
  max             : 500,
  standardHeaders : true,
  legacyHeaders   : false,
});

app.use('/api', apiLimiter);

// ── Static uploads (served directly, not proxied through API) ──────────
const path = require('path');
app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'uploads'), { maxAge: '7d' })
);

// ── API routes ──────────────────────────────────────────────────────────────
app.use('/api', router);

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  sendError(res, 'Endpoint not found', 404, ERROR_CODES.NOT_FOUND);
});

// ── Global error handler ───────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Service-layer errors carry statusCode + code
  const statusCode = err.statusCode || 500;
  const code       = err.code       || ERROR_CODES.INTERNAL_ERROR;
  const message    = statusCode < 500
    ? err.message
    : 'An unexpected error occurred';

  if (statusCode >= 500) {
    console.error('[ERROR]', err);
  }

  sendError(res, message, statusCode, code);
});

module.exports = app;


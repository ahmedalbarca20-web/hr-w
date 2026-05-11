'use strict';

/**
 * Express application setup.
 *
 * Exports the configured `app` without starting the server,
 * making it importable in tests without binding a port.
 */

const path = require('path');
// Vercel serverless (api/index.js) and tests: cwd may be repo root — load backend/.env explicitly.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');

const router                         = require('./routes/index');
const { flexibleDevicePushBody }     = require('./middleware/devicePushBody.middleware');
const { sendError, ERROR_CODES }     = require('./utils/response');

const app = express();

// Behind Vercel/edge proxies, trust first proxy so rate-limit uses real client IP.
const trustProxyEnv = String(process.env.TRUST_PROXY || '').trim().toLowerCase();
if (trustProxyEnv) {
  if (trustProxyEnv === 'true' || trustProxyEnv === '1' || trustProxyEnv === 'yes') app.set('trust proxy', 1);
  else if (trustProxyEnv === 'false' || trustProxyEnv === '0' || trustProxyEnv === 'no') app.set('trust proxy', false);
  else app.set('trust proxy', trustProxyEnv);
} else if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
  app.set('trust proxy', 1);
}

// ── Security headers ─────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────
// With credentials: true, the browser rejects Access-Control-Allow-Origin: *.
// Always echo a concrete origin string — never cb(null, true) (ambiguous with some proxies).
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/** Normalize for comparison (no trailing slash, lowercased). */
const normalizeOrigin = (o) =>
  String(o || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();

/**
 * Vercel env values may be hostname only or full URL — avoid `https://https://...`.
 * Used only for CORS allow-lists.
 */
const httpsOriginFromEnv = (val) => {
  const s = String(val || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  if (/^https:\/\//i.test(s)) return s;
  if (/^http:\/\//i.test(s)) return s.replace(/^http/i, 'https');
  return `https://${s}`;
};

const vercelSystemOrigins = [
  httpsOriginFromEnv(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  httpsOriginFromEnv(process.env.VERCEL_URL),
  ...(String(process.env.VERCEL_EXTRA_ORIGINS || '')
    .split(',')
    .map((o) => httpsOriginFromEnv(o))
    .filter(Boolean)),
].filter(Boolean);

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

  const inc = normalizeOrigin(incoming);

  if (allowedOrigins.some((o) => normalizeOrigin(httpsOriginFromEnv(o)) === inc)) {
    return cb(null, incoming);
  }

  if (vercelSystemOrigins.some((o) => normalizeOrigin(o) === inc)) {
    return cb(null, incoming);
  }

  if (vercelPreviewOk() && isVercelAppOrigin(incoming)) {
    return cb(null, incoming);
  }

  // Never pass an Error into cors — it becomes next(err) and surfaces as HTTP 500.
  console.warn(`[CORS] origin not allowed: ${incoming}`);
  return cb(null, false);
}

app.use(cors({
  origin          : corsOriginDelegate,
  credentials     : true, // httpOnly cookie exchange — requires explicit Allow-Origin
  methods         : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders    : ['Content-Type', 'Authorization', 'X-Device-Serial', 'X-Device-Key'],
  optionsSuccessStatus: 204,
}));

// ── Request parsing ─────────────────────────────────────────────────────────
// ZKTeco ADMS / iClock: text/plain ATTLOG must be parsed here (before json consumes the stream).
app.use(flexibleDevicePushBody);
app.use((req, res, next) => {
  if (req._devicePushBodyParsed) return next();
  express.json({ limit: '1mb' })(req, res, next);
});
app.use((req, res, next) => {
  if (req._devicePushBodyParsed) return next();
  express.urlencoded({ extended: true })(req, res, next);
});
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

// General API limiter (per IP, sliding window). Dev SPA + polling burns 500/15m quickly → higher default off production.
const parsedApiMax = Number.parseInt(String(process.env.API_RATE_LIMIT_MAX || '').trim(), 10);
const defaultApiMax = process.env.NODE_ENV === 'production' ? 500 : 20000;
const apiMax = Number.isFinite(parsedApiMax) && parsedApiMax > 0 ? parsedApiMax : defaultApiMax;

const apiLimiter = rateLimit({
  windowMs        : 15 * 60 * 1000,
  max             : apiMax,
  standardHeaders : true,
  legacyHeaders   : false,
});

app.use('/api', apiLimiter);

// ── Static uploads (same root as multer — on Vercel this is under /tmp) ───
const { getUploadsRoot } = require('./config/upload.paths');
app.use(
  '/uploads',
  express.static(getUploadsRoot(), { maxAge: '7d' })
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
  const gatewayStyle = [502, 503, 504].includes(Number(statusCode));
  const message = statusCode < 500 || gatewayStyle
    ? (err.message || 'Request failed')
    : 'An unexpected error occurred';

  if (statusCode >= 500) {
    console.error('[ERROR]', err);
  }

  sendError(res, message, statusCode, code);
});

module.exports = app;


/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_DIR = path.join(__dirname, '../../database');
const STORE_FILE = path.join(STORE_DIR, 'agent-jobs.json');

function ensureStoreFile() {
  try {
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_FILE)) {
      fs.writeFileSync(STORE_FILE, JSON.stringify({ jobs: [] }, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('[agent-jobs] ensureStoreFile failed', err);
  }
}

function readStore() {
  ensureStoreFile();
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.jobs)) {
      return { jobs: [] };
    }
    return { jobs: parsed.jobs };
  } catch (err) {
    console.error('[agent-jobs] readStore failed', err);
    return { jobs: [] };
  }
}

function writeStore(store) {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[agent-jobs] writeStore failed', err);
  }
}

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Create a new job for an agent.
 * payload can contain arbitrary JSON such as { device_ip }.
 */
function createJob({ agent_id, action, payload, timeout_ms }) {
  const store = readStore();
  const id = generateId();
  const job = {
    id,
    agent_id: String(agent_id || '').trim(),
    action: String(action || '').trim(),
    payload: payload || {},
    status: 'pending', // pending | in_progress | success | failed | timeout
    error: null,
    result: null,
    timeout_ms: Number.isFinite(Number(timeout_ms)) ? Number(timeout_ms) : 800,
    created_at: nowIso(),
    updated_at: nowIso(),
    started_at: null,
    completed_at: null,
  };
  store.jobs.push(job);
  writeStore(store);
  return job;
}

/**
 * Fetch pending jobs for agent and mark them in_progress.
 */
function claimPendingJobs(agent_id, { limit = 5 } = {}) {
  const store = readStore();
  const now = nowIso();
  const agentId = String(agent_id || '').trim();
  const limitNum = Number.isFinite(Number(limit)) ? Number(limit) : 5;

  const jobs = [];
  for (const job of store.jobs) {
    if (jobs.length >= limitNum) break;
    if (job.agent_id !== agentId) continue;
    if (job.status !== 'pending') continue;
    job.status = 'in_progress';
    job.started_at = now;
    job.updated_at = now;
    jobs.push(job);
  }
  if (jobs.length > 0) {
    writeStore(store);
  }
  return jobs;
}

function completeJob(id, { status, result, error }) {
  const store = readStore();
  const now = nowIso();
  const job = store.jobs.find((j) => j.id === id);
  if (!job) return null;

  const finalStatus = status || (error ? 'failed' : 'success');
  job.status = finalStatus;
  job.result = result || null;
  job.error = error || null;
  job.completed_at = now;
  job.updated_at = now;

  writeStore(store);
  return job;
}

function getJob(id) {
  const store = readStore();
  return store.jobs.find((j) => j.id === id) || null;
}

module.exports = {
  createJob,
  claimPendingJobs,
  completeJob,
  getJob,
};


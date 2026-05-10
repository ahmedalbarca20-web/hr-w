/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Transaction } = require('sequelize');
const { dialect } = require('../config/db');
const { AgentJob } = require('../models/agent_job.model');

const STORE_DIR = path.join(__dirname, '../../database');
const STORE_FILE = path.join(STORE_DIR, 'agent-jobs.json');

/** SQLite dev: JSON file. Postgres/MySQL (incl. Vercel): shared DB — file store breaks serverless + multi-instance. */
function useFileStore() {
  const override = String(process.env.AGENT_JOBS_STORE || '').trim().toLowerCase();
  if (override === 'db') return false;
  if (override === 'file') return true;
  return dialect === 'sqlite';
}

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

function toJobShape(row) {
  if (!row) return null;
  const j = row.get ? row.get({ plain: true }) : row;
  const iso = (d) => {
    if (d == null) return null;
    if (d instanceof Date) return d.toISOString();
    return d;
  };
  return {
    id: j.id,
    agent_id: j.agent_id,
    action: j.action,
    payload: j.payload || {},
    status: j.status,
    error: j.error,
    result: j.result,
    timeout_ms: j.timeout_ms,
    created_at: iso(j.created_at),
    updated_at: iso(j.updated_at),
    started_at: iso(j.started_at),
    completed_at: iso(j.completed_at),
  };
}

async function createJobDb({ agent_id, action, payload, timeout_ms }) {
  const id = generateId();
  const row = await AgentJob.create({
    id,
    agent_id: String(agent_id || '').trim(),
    action: String(action || '').trim(),
    payload: payload || {},
    status: 'pending',
    timeout_ms: Number.isFinite(Number(timeout_ms)) ? Number(timeout_ms) : 800,
  });
  return toJobShape(row);
}

async function claimPendingJobsDb(agent_id, { limit = 5 } = {}) {
  const agentId = String(agent_id || '').trim();
  const limitNum = Number.isFinite(Number(limit)) ? Number(limit) : 5;
  const sequelize = AgentJob.sequelize;
  return sequelize.transaction(async (t) => {
    const rows = await AgentJob.findAll({
      where: { agent_id: agentId, status: 'pending' },
      limit: limitNum,
      order: [['created_at', 'ASC']],
      transaction: t,
      lock: Transaction.LOCK.UPDATE,
      skipLocked: true,
    });
    const now = new Date();
    for (const row of rows) {
      row.status = 'in_progress';
      row.started_at = now;
      // eslint-disable-next-line no-await-in-loop
      await row.save({ transaction: t });
    }
    return rows.map((r) => toJobShape(r));
  });
}

async function completeJobDb(id, { status, result, error }) {
  const job = await AgentJob.findByPk(id);
  if (!job) return null;
  const finalStatus = status || (error ? 'failed' : 'success');
  job.status = finalStatus;
  job.result = result || null;
  job.error = error || null;
  job.completed_at = new Date();
  await job.save();
  return toJobShape(job);
}

async function getJobDb(id) {
  const job = await AgentJob.findByPk(id);
  return toJobShape(job);
}

/**
 * Create a new job for an agent.
 */
async function createJob({ agent_id, action, payload, timeout_ms }) {
  if (useFileStore()) {
    const store = readStore();
    const id = generateId();
    const job = {
      id,
      agent_id: String(agent_id || '').trim(),
      action: String(action || '').trim(),
      payload: payload || {},
      status: 'pending',
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
  return createJobDb({ agent_id, action, payload, timeout_ms });
}

/**
 * Fetch pending jobs for agent and mark them in_progress.
 */
async function claimPendingJobs(agent_id, opts) {
  if (useFileStore()) {
    const store = readStore();
    const now = nowIso();
    const agentId = String(agent_id || '').trim();
    const limitNum = Number.isFinite(Number(opts?.limit)) ? Number(opts.limit) : 5;

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
  return claimPendingJobsDb(agent_id, opts || {});
}

async function completeJob(id, { status, result, error }) {
  if (useFileStore()) {
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
  return completeJobDb(id, { status, result, error });
}

async function getJob(id) {
  if (useFileStore()) {
    const store = readStore();
    return store.jobs.find((j) => j.id === id) || null;
  }
  return getJobDb(id);
}

module.exports = {
  createJob,
  claimPendingJobs,
  completeJob,
  getJob,
  useFileStore,
};

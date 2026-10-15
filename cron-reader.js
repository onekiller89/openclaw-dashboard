'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

function normalizeJobs(data) {
  if (!data || !Array.isArray(data.jobs) || data.hasMore === true ||
      (data.total !== undefined && data.total !== data.jobs.length)) throw new Error('Invalid inventory');
  const seen = new Set();
  return data.jobs.map(job => {
    if (!job || typeof job.id !== 'string' || !job.id || seen.has(job.id)) throw new Error('Invalid job');
    seen.add(job.id);
    const schedule = job.schedule;
    let label = 'Unknown schedule';
    if (typeof schedule === 'string') label = schedule;
    else if (schedule && typeof schedule === 'object') {
      if (typeof schedule.expr === 'string') label = schedule.expr + (schedule.tz ? ` (${schedule.tz})` : '');
      else if (schedule.kind === 'at' && typeof schedule.at === 'string') label = `Once: ${schedule.at}`;
      else if (schedule.kind === 'every' && Number.isFinite(schedule.everyMs) && schedule.everyMs > 0) label = `Every ${schedule.everyMs / 1000}s`;
      else if (typeof schedule.kind === 'string') label = `Schedule type: ${schedule.kind}`;
    }
    const state = job.state || {};
    const number = value => Number.isFinite(value) && value >= 0 ? value : 0;
    return {
      id: job.id, name: typeof job.name === 'string' ? job.name : job.id.slice(0, 8),
      schedule: label, enabled: typeof job.enabled === 'boolean' ? job.enabled : null,
      lastStatus: typeof state.lastRunStatus === 'string' ? state.lastRunStatus :
        typeof state.lastStatus === 'string' ? state.lastStatus : 'unknown',
      lastRunAt: number(state.lastRunAtMs), nextRunAt: number(state.nextRunAtMs),
      lastDuration: Number.isFinite(state.lastDurationMs) && state.lastDurationMs >= 0 ? state.lastDurationMs : null
    };
  });
}

function readCurrentInventory() {
  return new Promise((resolve, reject) => {
    // Fixed argv, no shell, token injection, raw stderr, or scheduler mutation.
    const userCli = path.join(os.homedir(), '.npm-global', 'bin', 'openclaw');
    const executable = fs.existsSync(userCli) ? userCli : 'openclaw';
    execFile(executable, ['cron', 'list', '--all', '--json'],
      { timeout: 12000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
        if (error) return reject(new Error('Current inventory unavailable'));
        try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Invalid inventory')); }
      });
  });
}

function createCronReader(openclawDir, dependencies = {}) {
  const current = dependencies.readCurrent || readCurrentInventory;
  const readFile = dependencies.readFile || (file => fs.promises.readFile(file, 'utf8'));
  let pending = null;
  let cached = null;
  return async function readCrons() {
    if (cached && Date.now() - cached.checkedAt < 15000) return cached;
    if (pending) return pending;
    pending = (async () => {
      try {
        const jobs = normalizeJobs(await current());
        return { status: 'current', source: 'gateway-cli', checkedAt: Date.now(), readOnly: true, jobs };
      } catch {
        try {
          // Never read .migrated/.bak files or present a disk snapshot as live.
          const jobs = normalizeJobs(JSON.parse(await readFile(path.join(openclawDir, 'cron', 'jobs.json'))));
          return { status: 'legacy-snapshot', source: 'legacy-file', checkedAt: Date.now(), readOnly: true,
            message: 'Current inventory unavailable. Legacy file snapshot only; current scheduling is unverified.', jobs };
        } catch {
          return { status: 'unavailable', source: null, checkedAt: Date.now(), readOnly: true, jobs: [],
            message: 'Current cron inventory unavailable. No current job count or schedule can be verified.' };
        }
      }
    })();
    try { cached = await pending; return cached; } finally { pending = null; }
  };
}

module.exports = { normalizeJobs, createCronReader };

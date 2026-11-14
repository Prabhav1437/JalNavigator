const DEFAULT_CACHE_SECONDS = 10;
const DEFAULT_MAX_CONCURRENT = 4;
const DEFAULT_STATEMENT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_ENTRIES = 256;
const TRIM_CHARS = ' \t\n\v\f\r                 　﻿';

class AnalyticsBusyError extends Error {
  constructor(retryAfterSeconds) {
    super('Analytics is busy');
    this.name = 'AnalyticsBusyError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function readNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return /^\d+$/.test(raw) ? Number(raw) : fallback;
}

function readSettings() {
  return {
    ttlMs: readNumber('ANALYTICS_CACHE_SECONDS', DEFAULT_CACHE_SECONDS) * 1000,
    maxConcurrent: readNumber('ANALYTICS_MAX_CONCURRENT', DEFAULT_MAX_CONCURRENT),
    statementTimeoutMs: Math.max(readNumber('ANALYTICS_STATEMENT_TIMEOUT_MS', DEFAULT_STATEMENT_TIMEOUT_MS), 0),
    maxAssetRows: Math.max(readNumber('ANALYTICS_MAX_ASSET_ROWS', 1000), 1)
  };
}

function createGuard({ ttlMs = 0, maxConcurrent = 0, maxEntries = DEFAULT_MAX_ENTRIES, now = Date.now } = {}) {
  const cache = new Map();
  const inFlight = new Map();

  function prune(time) {
    cache.forEach((entry, key) => {
      if (entry.expiresAt <= time) cache.delete(key);
    });
    while (cache.size > maxEntries) {
      cache.delete(cache.keys().next().value);
    }
  }

  async function run(key, loader) {
    const time = now();
    if (ttlMs > 0) {
      const hit = cache.get(key);
      if (hit && hit.expiresAt > time) return { value: hit.value, source: 'cache' };
      const flying = inFlight.get(key);
      if (flying) return { value: await flying, source: 'shared' };
    }
    if (maxConcurrent > 0 && inFlight.size >= maxConcurrent) {
      throw new AnalyticsBusyError(1);
    }

    const promise = (async () => loader())();
    inFlight.set(key, promise);
    try {
      const value = await promise;
      if (ttlMs > 0) {
        cache.set(key, { expiresAt: now() + ttlMs, value });
        prune(now());
      }
      return { value, source: 'fresh' };
    } finally {
      inFlight.delete(key);
    }
  }

  return {
    run,
    clear: () => {
      cache.clear();
      inFlight.clear();
    },
    stats: () => ({ cached: cache.size, inFlight: inFlight.size })
  };
}

function withAnalyticsSession(prisma, { statementTimeoutMs, isolationLevel }, work) {
  const body = async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL TimeZone = 'UTC'");
    if (statementTimeoutMs > 0) {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${Number(statementTimeoutMs)}`);
    }
    return work(tx);
  };
  return isolationLevel ? prisma.$transaction(body, { isolationLevel }) : prisma.$transaction(body);
}

module.exports = {
  createGuard,
  withAnalyticsSession,
  readSettings,
  AnalyticsBusyError,
  TRIM_CHARS,
  DEFAULT_CACHE_SECONDS,
  DEFAULT_MAX_CONCURRENT,
  DEFAULT_STATEMENT_TIMEOUT_MS
};

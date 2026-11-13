const DEFAULT_MAX_CLIENTS = 50000;
const SWEEP_INTERVAL_MS = 30000;

function clientKey(ip) {
  if (typeof ip !== 'string' || ip === '') return 'unknown';
  let address = ip.split('%')[0].toLowerCase();
  if (address.startsWith('::ffff:') && address.includes('.')) address = address.slice(7);
  if (!address.includes(':')) return address;
  const [head, tail = ''] = address.split('::');
  const front = head ? head.split(':') : [];
  const back = tail ? tail.split(':') : [];
  const groups = address.includes('::')
    ? [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill('0'), ...back]
    : front;
  return `${groups.slice(0, 4).map((group) => (parseInt(group, 16) || 0).toString(16)).join(':')}::/64`;
}

function createDatabaseStore(getPrisma) {
  return {
    async hit(key, { limit, windowMs, time }) {
      const prisma = getPrisma();
      const nowIso = new Date(time).toISOString();
      const resetIso = new Date(time + windowMs).toISOString();
      const rows = await prisma.$queryRaw`
        INSERT INTO "FarmerRateLimit" ("key", "count", "resetAt")
        VALUES (${key}::text, 1, ${resetIso}::text::timestamp)
        ON CONFLICT ("key") DO UPDATE SET
          "count" = CASE
            WHEN "FarmerRateLimit"."resetAt" <= ${nowIso}::text::timestamp THEN 1
            ELSE LEAST("FarmerRateLimit"."count" + 1, ${String(limit + 1)}::text::int)
          END,
          "resetAt" = CASE
            WHEN "FarmerRateLimit"."resetAt" <= ${nowIso}::text::timestamp THEN ${resetIso}::text::timestamp
            ELSE "FarmerRateLimit"."resetAt"
          END
        RETURNING "count", "resetAt"
      `;
      return { count: rows[0].count, resetAt: new Date(rows[0].resetAt).getTime() };
    },

    async sweep(time, maxClients) {
      const prisma = getPrisma();
      const nowIso = new Date(time).toISOString();
      await prisma.$executeRaw`
        DELETE FROM "FarmerRateLimit" WHERE "resetAt" <= ${nowIso}::text::timestamp
      `;
      await prisma.$executeRaw`
        DELETE FROM "FarmerRateLimit"
        WHERE "key" IN (
          SELECT "key" FROM "FarmerRateLimit"
          ORDER BY "resetAt" DESC, "key" ASC
          OFFSET ${String(maxClients)}::text::int
        )
      `;
    }
  };
}

function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
  maxClients = DEFAULT_MAX_CLIENTS,
  sweepIntervalMs = SWEEP_INTERVAL_MS,
  store
}) {
  const backing = store || createDatabaseStore(() => require('../database'));
  let lastSweep = now();

  function sweepNow(time) {
    lastSweep = time;
    return Promise.resolve()
      .then(() => backing.sweep(time, maxClients))
      .catch((err) => console.error('[farmer] rate limit sweep failed:', err));
  }

  async function rateLimiter(req, res, next) {
    if (!limit) return next();

    const time = now();
    let entry;
    try {
      entry = await backing.hit(clientKey(req.ip), { limit, windowMs, time });
    } catch (err) {
      console.error('[farmer] rate limit failed:', err);
      return next();
    }

    if (time - lastSweep >= sweepIntervalMs) sweepNow(time);

    if (entry.count > limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - time) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: 'Too many complaints from this connection. Please try again later.',
        retryAfterSeconds
      });
    }
    return next();
  }

  rateLimiter.sweepNow = () => sweepNow(now());
  return rateLimiter;
}

module.exports = { createRateLimiter, createDatabaseStore, clientKey, DEFAULT_MAX_CLIENTS };

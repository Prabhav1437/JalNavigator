const MAX_TRACKED_CLIENTS = 5000;

function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const clients = new Map();

  function sweep(time) {
    clients.forEach((entry, key) => {
      if (entry.resetAt <= time) clients.delete(key);
    });
  }

  return function rateLimiter(req, res, next) {
    if (!limit) return next();

    const time = now();
    if (clients.size > MAX_TRACKED_CLIENTS) sweep(time);

    const key = req.ip || 'unknown';
    let entry = clients.get(key);
    if (!entry || entry.resetAt <= time) {
      entry = { count: 0, resetAt: time + windowMs };
      clients.set(key, entry);
    }

    if (entry.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - time) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: 'Too many complaints from this connection. Please try again later.',
        retryAfterSeconds
      });
    }

    entry.count += 1;
    return next();
  };
}

module.exports = { createRateLimiter };

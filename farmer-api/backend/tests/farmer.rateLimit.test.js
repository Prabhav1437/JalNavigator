process.env.FARMER_COMPLAINT_LIMIT = '2';
process.env.FARMER_COMPLAINT_WINDOW_MINUTES = '15';

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createRateLimiter, clientKey } = require('../utils/rateLimiter');

const databasePath = require.resolve('../database');
const created = [];
const table = new Map();
const sweeps = [];
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: {
    $queryRaw: (strings, ...values) => {
      const sql = strings.join('?');
      if (!sql.includes('INSERT INTO "FarmerRateLimit"')) return Promise.resolve([]);
      const [key, resetIso, nowIso, cap] = values;
      const now = Date.parse(nowIso);
      const row = table.get(key);
      if (!row || row.resetAt <= now) {
        table.set(key, { count: 1, resetAt: Date.parse(resetIso) });
      } else {
        row.count = Math.min(row.count + 1, Number(cap));
      }
      const saved = table.get(key);
      return Promise.resolve([{ count: saved.count, resetAt: new Date(saved.resetAt) }]);
    },
    $executeRaw: (strings, ...values) => {
      sweeps.push(values);
      return Promise.resolve(0);
    },
    $transaction: (operations) => Promise.all(operations),
    complaint: {
      create: ({ data }) => {
        created.push(data);
        return Promise.resolve({ id: created.length, ...data });
      }
    },
    farmerComplaintAccess: { findUnique: () => Promise.resolve(null) }
  }
};

function memoryStore() {
  const rows = new Map();
  return {
    rows,
    sweepCalls: [],
    async hit(key, { limit, windowMs, time }) {
      const row = rows.get(key);
      if (!row || row.resetAt <= time) {
        rows.set(key, { count: 1, resetAt: time + windowMs });
      } else {
        row.count = Math.min(row.count + 1, limit + 1);
      }
      return { ...rows.get(key) };
    },
    async sweep(time, max) {
      this.sweepCalls.push([time, max]);
    }
  };
}

function run(limiter, ip) {
  const res = {
    headers: {},
    statusCode: 200,
    body: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return new Promise((resolve) => {
    const finish = (passed) => resolve({ passed, res });
    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      originalJson(payload);
      finish(false);
      return res;
    };
    limiter({ ip }, res, () => finish(true));
  });
}

test('the limiter allows the limit, blocks the next request and reports when to retry', async () => {
  let time = 1000000;
  const limiter = createRateLimiter({ limit: 3, windowMs: 60000, now: () => time, store: memoryStore() });
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await run(limiter, '10.0.0.1')).passed, true);
  }
  time += 15000;
  const blocked = await run(limiter, '10.0.0.1');
  assert.equal(blocked.passed, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.headers['Retry-After'], '45');
  assert.equal(blocked.res.body.retryAfterSeconds, 45);
  assert.ok(blocked.res.body.error);
});

test('the limiter starts a fresh window once the old one has expired', async () => {
  let time = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time, store: memoryStore() });
  assert.equal((await run(limiter, 'a')).passed, true);
  assert.equal((await run(limiter, 'a')).passed, false);
  time = 999;
  assert.equal((await run(limiter, 'a')).passed, false);
  time = 1000;
  assert.equal((await run(limiter, 'a')).passed, true);
});

test('each client has its own allowance', async () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0, store: memoryStore() });
  assert.equal((await run(limiter, 'a')).passed, true);
  assert.equal((await run(limiter, 'a')).passed, false);
  assert.equal((await run(limiter, 'b')).passed, true);
  assert.equal((await run(limiter, undefined)).passed, true);
  assert.equal((await run(limiter, undefined)).passed, false);
});

test('a limit of 0 turns the limiter off and never touches the store', async () => {
  const store = memoryStore();
  const limiter = createRateLimiter({ limit: 0, windowMs: 1000, now: () => 0, store });
  for (let i = 0; i < 50; i += 1) {
    assert.equal((await run(limiter, 'a')).passed, true);
  }
  assert.equal(store.rows.size, 0);
});

test('addresses from one IPv6 /64 and IPv4-mapped forms are counted as one client', () => {
  assert.equal(clientKey('203.0.113.7'), '203.0.113.7');
  assert.equal(clientKey('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(clientKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(clientKey('2001:DB8:1:2::1'), '2001:db8:1:2::/64');
  assert.equal(clientKey('2001:db8:1:2:ffff:ffff:ffff:ffff'), clientKey('2001:db8:1:2::9'));
  assert.notEqual(clientKey('2001:db8:1:2::1'), clientKey('2001:db8:1:3::1'));
  assert.equal(clientKey('::1'), '0:0:0:0::/64');
  assert.equal(clientKey('fe80::1%eth0'), 'fe80:0:0:0::/64');
  assert.equal(clientKey(undefined), 'unknown');
  assert.equal(clientKey(''), 'unknown');
});

test('one client cannot dodge the limit by rotating addresses inside its IPv6 /64', async () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => 0, store: memoryStore() });
  assert.equal((await run(limiter, '2001:db8:1:2::1')).passed, true);
  assert.equal((await run(limiter, '2001:db8:1:2::2')).passed, true);
  assert.equal((await run(limiter, '2001:db8:1:2:dead:beef::3')).passed, false);
  assert.equal((await run(limiter, '2001:db8:1:3::1')).passed, true);
});

test('requests never scan the table: the sweep runs once per interval, not once per request', async () => {
  let time = 0;
  const store = memoryStore();
  const limiter = createRateLimiter({ limit: 5, windowMs: 600000, now: () => time, sweepIntervalMs: 30000, maxClients: 77, store });
  for (let i = 0; i < 200; i += 1) {
    time += 1000;
    await run(limiter, `client-${i}`);
  }
  assert.deepEqual(store.sweepCalls.map((call) => call[0]), [30000, 60000, 90000, 120000, 150000, 180000]);
  store.sweepCalls.forEach((call) => assert.equal(call[1], 77));
});

test('a failing sweep is logged and never blocks a request', async () => {
  const errorLog = mock.method(console, 'error', () => {});
  try {
    let time = 0;
    const store = memoryStore();
    store.sweep = () => Promise.reject(new Error('sweep boom'));
    const limiter = createRateLimiter({ limit: 5, windowMs: 1000, now: () => time, sweepIntervalMs: 10, store });
    time = 50;
    assert.equal((await run(limiter, 'a')).passed, true);
    await limiter.sweepNow();
    assert.ok(errorLog.mock.calls.some((call) => call.arguments[0] === '[farmer] rate limit sweep failed:'));
  } finally {
    errorLog.mock.restore();
  }
});

test('if the shared store is down the request goes through and the failure is logged', async () => {
  const errorLog = mock.method(console, 'error', () => {});
  try {
    const store = memoryStore();
    store.hit = () => Promise.reject(new Error('db down'));
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0, store });
    assert.equal((await run(limiter, 'a')).passed, true);
    assert.equal(errorLog.mock.calls[0].arguments[0], '[farmer] rate limit failed:');
    assert.equal(errorLog.mock.calls[0].arguments[1].message, 'db down');
  } finally {
    errorLog.mock.restore();
  }
});

let server;
let origin;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', require('../routes/api'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

const postComplaint = (body) =>
  fetch(`${origin}/api/farmer/complaints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

test('the complaint endpoint answers 429 with Retry-After after the configured limit, using the shared table', async () => {
  const first = await postComplaint({ description: 'Tap is broken' });
  const second = await postComplaint({ description: 'Tap is broken again' });
  const third = await postComplaint({ description: 'Tap is broken once more' });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(third.status, 429);
  const retry = Number(third.headers.get('retry-after'));
  assert.ok(retry >= 1 && retry <= 900);
  const body = await third.json();
  assert.equal(body.retryAfterSeconds, retry);
  assert.equal(created.length, 2);
  assert.equal(table.size, 1);
  assert.match([...table.keys()][0], /^(127\.0\.0\.1|0:0:0:0::\/64)$/);
});

test('reading endpoints are never limited', async () => {
  const before = table.get([...table.keys()][0]).count;
  for (let i = 0; i < 10; i += 1) {
    const villages = await fetch(`${origin}/api/farmer/villages`);
    const lookup = await fetch(`${origin}/api/farmer/complaints/1`, { headers: { 'X-Complaint-Token': 'abc' } });
    assert.equal(villages.status, 200);
    assert.equal(lookup.status, 404);
  }
  assert.equal(table.get([...table.keys()][0]).count, before);
});

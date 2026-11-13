process.env.FARMER_COMPLAINT_LIMIT = '2';
process.env.FARMER_COMPLAINT_WINDOW_MINUTES = '15';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createRateLimiter } = require('../utils/rateLimiter');

const databasePath = require.resolve('../database');
const created = [];
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: {
    $queryRaw: () => Promise.resolve([]),
    $transaction: (operations) => Promise.all(operations),
    complaint: {
      create: ({ data }) => {
        created.push(data);
        return Promise.resolve({ id: created.length, ...data });
      },
      findUnique: () => Promise.resolve(null)
    }
  }
};

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
  let passed = false;
  limiter({ ip }, res, () => {
    passed = true;
  });
  return { passed, res };
}

test('the limiter allows the limit, blocks the next request and reports when to retry', () => {
  let time = 1000000;
  const limiter = createRateLimiter({ limit: 3, windowMs: 60000, now: () => time });
  for (let i = 0; i < 3; i += 1) {
    assert.equal(run(limiter, '10.0.0.1').passed, true);
  }
  time += 15000;
  const blocked = run(limiter, '10.0.0.1');
  assert.equal(blocked.passed, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.headers['Retry-After'], '45');
  assert.equal(blocked.res.body.retryAfterSeconds, 45);
  assert.ok(blocked.res.body.error);
});

test('the limiter starts a fresh window once the old one has expired', () => {
  let time = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time });
  assert.equal(run(limiter, 'a').passed, true);
  assert.equal(run(limiter, 'a').passed, false);
  time = 999;
  assert.equal(run(limiter, 'a').passed, false);
  time = 1000;
  assert.equal(run(limiter, 'a').passed, true);
});

test('each client has its own allowance', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
  assert.equal(run(limiter, 'a').passed, true);
  assert.equal(run(limiter, 'a').passed, false);
  assert.equal(run(limiter, 'b').passed, true);
  assert.equal(run(limiter, undefined).passed, true);
  assert.equal(run(limiter, undefined).passed, false);
});

test('a limit of 0 turns the limiter off', () => {
  const limiter = createRateLimiter({ limit: 0, windowMs: 1000, now: () => 0 });
  for (let i = 0; i < 50; i += 1) {
    assert.equal(run(limiter, 'a').passed, true);
  }
});

test('expired clients are swept so the table cannot grow forever', () => {
  let time = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time });
  for (let i = 0; i < 5100; i += 1) {
    run(limiter, `client-${i}`);
  }
  time = 5000;
  assert.equal(run(limiter, 'client-0').passed, true);
  assert.equal(run(limiter, 'fresh').passed, true);
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

test('the complaint endpoint answers 429 with Retry-After after the configured limit', async () => {
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
});

test('reading endpoints are never limited', async () => {
  for (let i = 0; i < 10; i += 1) {
    const villages = await fetch(`${origin}/api/farmer/villages`);
    const lookup = await fetch(`${origin}/api/farmer/complaints/1`);
    assert.equal(villages.status, 200);
    assert.equal(lookup.status, 404);
  }
});

process.env.ANALYTICS_CACHE_SECONDS = '30';
process.env.ANALYTICS_MAX_CONCURRENT = '1';
process.env.ANALYTICS_STATEMENT_TIMEOUT_MS = '1234';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const queries = [];
const sessionStatements = [];
const hold = { gate: null };

const emptyModel = {
  count: () => Promise.resolve(0),
  groupBy: () => Promise.resolve([])
};

const tx = {
  asset: emptyModel,
  complaint: emptyModel,
  alert: emptyModel,
  sensorReading: emptyModel,
  $executeRawUnsafe: (sql) => {
    sessionStatements.push(sql);
    return Promise.resolve(0);
  },
  $queryRaw: async (strings, ...values) => {
    queries.push({ sql: strings.join('?'), values });
    if (hold.gate) await hold.gate;
    return [];
  }
};

const databasePath = require.resolve('../database');
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: {
    ...tx,
    $transaction: (work, options) => (typeof work === 'function' ? work(tx) : Promise.all(work))
  }
};

let server;
let origin;

before(async () => {
  const app = express();
  app.use('/api', require('../routes/api'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

const get = async (path) => {
  const res = await fetch(`${origin}/api/analytics${path}`);
  return { status: res.status, retryAfter: res.headers.get('retry-after'), body: await res.json() };
};

test('repeated identical requests are answered without querying the database again', async () => {
  queries.length = 0;
  const first = await get('/villages');
  assert.equal(first.status, 200);
  for (let i = 0; i < 20; i += 1) {
    const repeat = await get('/villages');
    assert.equal(repeat.status, 200);
    assert.deepEqual(repeat.body, first.body);
  }
  assert.equal(queries.length, 1);
});

test('each distinct window is computed once, and the statement timeout is applied', async () => {
  queries.length = 0;
  sessionStatements.length = 0;
  await get('/trends?days=3');
  await get('/trends?days=3');
  await get('/trends?days=4');
  await get('/trends?days=4');
  await get('/readings?days=3');
  await get('/readings?days=3');
  await get('/readings?days=3&assetId=7');
  assert.equal(queries.length, 4);
  assert.deepEqual(
    [...new Set(sessionStatements)],
    ["SET LOCAL TimeZone = 'UTC'", 'SET LOCAL statement_timeout = 1234']
  );
});

test('a slow query does not stall every caller: identical ones share it, new ones get 503', async () => {
  queries.length = 0;
  let release;
  hold.gate = new Promise((resolve) => {
    release = resolve;
  });

  const slow = get('/readings?days=9');
  const sharing = get('/readings?days=9');
  await new Promise((resolve) => setTimeout(resolve, 60));

  const refused = await get('/trends?days=9');
  assert.equal(refused.status, 503);
  assert.equal(refused.retryAfter, '1');
  assert.equal(refused.body.retryAfterSeconds, 1);
  assert.match(refused.body.error, /busy/i);

  release();
  hold.gate = null;
  const [a, b] = await Promise.all([slow, sharing]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.deepEqual(a.body, b.body);
  assert.equal(queries.length, 1);

  const afterwards = await get('/trends?days=9');
  assert.equal(afterwards.status, 200);
});

test('the directory never touches the database, so it cannot be refused or go stale', async () => {
  queries.length = 0;
  let release;
  hold.gate = new Promise((resolve) => {
    release = resolve;
  });
  const slow = get('/readings?days=11');
  await new Promise((resolve) => setTimeout(resolve, 60));
  for (let i = 0; i < 5; i += 1) {
    const { status, body } = await get('');
    assert.equal(status, 200);
    assert.equal(body.endpoints.length, 4);
  }
  assert.equal(queries.length, 1);
  release();
  hold.gate = null;
  await slow;
});

test('a failure is never cached, so a recovered database answers correctly', async () => {
  const original = require.cache[databasePath].exports.$transaction;
  const failing = { ...tx, $queryRaw: () => Promise.reject(new Error('boom')) };
  require.cache[databasePath].exports.$transaction = (work) =>
    typeof work === 'function' ? work(failing) : Promise.all(work);
  const log = console.error;
  console.error = () => {};
  try {
    for (let i = 0; i < 3; i += 1) {
      const { status, body } = await get('/trends?days=77');
      assert.equal(status, 500, `attempt ${i}`);
      assert.equal(body.error, 'Failed to compute analytics');
    }
  } finally {
    console.error = log;
    require.cache[databasePath].exports.$transaction = original;
  }

  const recovered = await get('/trends?days=77');
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.days, 77);
});

test('a cached answer is keyed by the whole query, and unknown parameters cannot poison it', async () => {
  queries.length = 0;
  const plain = await get('/trends?days=5');
  const extra = await get('/trends?days=5&somethingElse=1');
  assert.equal(plain.status, 200);
  assert.deepEqual(extra.body, plain.body);
  assert.equal(queries.length, 1, 'an unknown parameter must not force a second query');

  const other = await get('/trends?days=6');
  assert.equal(other.body.days, 6);
  assert.equal(queries.length, 2);
});

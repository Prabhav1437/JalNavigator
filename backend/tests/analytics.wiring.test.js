const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const emptyModel = {
  count: () => Promise.resolve(0),
  groupBy: () => Promise.resolve([])
};

const tx = {
  asset: emptyModel,
  complaint: emptyModel,
  alert: emptyModel,
  sensorReading: emptyModel,
  $executeRawUnsafe: () => Promise.resolve(0),
  $queryRaw: () => Promise.resolve([])
};

const databasePath = require.resolve('../database');
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: {
    ...tx,
    $transaction: (work) => (typeof work === 'function' ? work(tx) : Promise.all(work))
  }
};

const EXPECTED = [
  'GET /api/analytics',
  'GET /api/analytics/summary',
  'GET /api/analytics/readings',
  'GET /api/analytics/villages',
  'GET /api/analytics/trends'
];

const WIRING_HELP =
  'backend/routes/api.js does not mount the analytics router. Run "node path/to/analytics-api/install.js" ' +
  'from the repository root, or add the two lines from analytics-api/README.md to backend/routes/api.js.';

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

test('the installed backend really serves every analytics endpoint, not a 404', async () => {
  for (const entry of EXPECTED) {
    const path = entry.slice('GET '.length);
    const res = await fetch(`${origin}${path}`);
    assert.equal(res.status, 200, `${path} answered ${res.status}. ${WIRING_HELP}`);
  }
});

test('the api directory at /api advertises the analytics endpoints so tools can discover them', async () => {
  const res = await fetch(`${origin}/api`);
  assert.equal(res.status, 200);
  const body = await res.json();
  const listed = body.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`);
  for (const entry of EXPECTED) {
    assert.ok(
      listed.includes(entry),
      `${entry} is missing from the /api endpoint directory. Re-run the analytics installer, or add it to the endpoints array in backend/routes/api.js.`
    );
  }
  body.endpoints
    .filter((endpoint) => endpoint.path.startsWith('/api/analytics'))
    .forEach((endpoint) => {
      assert.equal(typeof endpoint.description, 'string');
      assert.ok(endpoint.description.length > 0, endpoint.path);
    });
});

test('the endpoints the directory advertises are exactly the ones that answer', async () => {
  const directory = await (await fetch(`${origin}/api`)).json();
  const advertised = directory.endpoints
    .filter((endpoint) => endpoint.path.startsWith('/api/analytics'))
    .map((endpoint) => `${endpoint.method} ${endpoint.path}`)
    .sort();
  assert.deepEqual(advertised, [...EXPECTED].sort());

  const own = await (await fetch(`${origin}/api/analytics`)).json();
  own.endpoints.forEach((endpoint) => {
    assert.ok(
      advertised.includes(`${endpoint.method} ${endpoint.path}`),
      `${endpoint.path} is served but not listed at /api`
    );
  });
});

test('an unknown analytics path is still a 404, so the mount is not a catch-all', async () => {
  const res = await fetch(`${origin}/api/analytics/nothing-here`);
  assert.equal(res.status, 404);
});

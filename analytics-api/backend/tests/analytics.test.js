process.env.ANALYTICS_CACHE_SECONDS = '0';
process.env.ANALYTICS_MAX_CONCURRENT = '0';

const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (offset) => new Date(Date.now() - offset * DAY_MS).toISOString().slice(0, 10);

const assets = [
  { id: 1, type: 'tank', status: 'Operational' },
  { id: 2, type: 'Tank', status: 'operational' },
  { id: 3, type: 'borewell', status: 'Maintenance' },
  { id: 4, type: 'pump', status: 'Operational' },
  { id: 5, type: 'pipeline', status: 'Inactive' }
];

const complaints = [
  { id: 1, category: 'Dirty water', status: 'Resolved' },
  { id: 2, category: 'Dirty water', status: 'resolved' },
  { id: 3, category: 'Dirty water', status: 'Pending' },
  { id: 4, category: 'Other', status: '__proto__' },
  { id: 5, category: 'Other', status: 'constructor' },
  { id: 6, category: 'Other', status: 'In Progress' }
];

const alerts = [
  { id: 1, severity: 'Critical', status: 'Open' },
  { id: 2, severity: 'Critical', status: 'open' },
  { id: 3, severity: 'constructor', status: 'Resolved' }
];

const readings = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

function createModel(rows) {
  return {
    count: () => Promise.resolve(rows.length),
    groupBy: ({ by }) => {
      const groups = new Map();
      rows.forEach((row) => {
        const key = by.map((field) => row[field]).join('|');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      });
      return Promise.resolve(
        [...groups.values()].map((list) => ({
          ...Object.fromEntries(by.map((field) => [field, list[0][field]])),
          _count: { _all: list.length }
        }))
      );
    }
  };
}

const behavior = { queryRaw: () => [], transaction: null };
const queryRawCalls = [];
const transactionCalls = [];
const sessionStatements = [];

const tx = {
  asset: createModel(assets),
  complaint: createModel(complaints),
  alert: createModel(alerts),
  sensorReading: createModel(readings),
  $executeRawUnsafe: (sql) => {
    sessionStatements.push(sql);
    return Promise.resolve(0);
  },
  $queryRaw: (strings, ...values) => {
    queryRawCalls.push({ sql: strings.join('?'), values });
    try {
      return Promise.resolve(behavior.queryRaw());
    } catch (err) {
      return Promise.reject(err);
    }
  }
};

const databasePath = require.resolve('../database');
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: {
    ...tx,
    $transaction: (work, options) => {
      transactionCalls.push(options);
      if (behavior.transaction) return Promise.reject(behavior.transaction);
      return typeof work === 'function' ? work(tx) : Promise.all(work);
    }
  }
};

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

beforeEach(() => {
  behavior.queryRaw = () => [];
  behavior.transaction = null;
  queryRawCalls.length = 0;
  transactionCalls.length = 0;
  sessionStatements.length = 0;
});

const get = async (path) => {
  const res = await fetch(`${origin}/api/analytics${path}`);
  return { status: res.status, body: await res.json() };
};

const ownValue = (object, key) => {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor ? descriptor.value : undefined;
};

test('the router is mounted under /api and lists its exact endpoints', async () => {
  const { status, body } = await get('');
  assert.equal(status, 200);
  assert.equal(body.name, 'JalNavigator Analytics API');
  assert.deepEqual(
    body.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`),
    [
      'GET /api/analytics/summary',
      'GET /api/analytics/readings',
      'GET /api/analytics/villages',
      'GET /api/analytics/trends'
    ]
  );
  body.endpoints.forEach((endpoint) => {
    assert.equal(typeof endpoint.description, 'string');
    assert.ok(endpoint.description.length > 0);
  });
});

test('every listed endpoint really exists and answers 200', async () => {
  const { body } = await get('');
  for (const endpoint of body.endpoints) {
    const res = await fetch(`${origin}${endpoint.path}`);
    assert.equal(res.status, 200, endpoint.path);
  }
});

test('summary counts everything inside one repeatable-read snapshot', async () => {
  const { status, body } = await get('/summary');
  assert.equal(status, 200);
  assert.deepEqual(transactionCalls, [{ isolationLevel: 'RepeatableRead' }]);
  assert.equal(body.assets.total, 5);
  assert.deepEqual(body.assets.byType, { tank: 2, borewell: 1, pump: 1, pipeline: 1 });
  assert.deepEqual(body.assets.byStatus, { Operational: 3, Maintenance: 1, Inactive: 1 });
  assert.equal(body.alerts.total, 3);
  assert.deepEqual(body.alerts.byStatus, { Open: 2, Resolved: 1 });
  assert.equal(body.readings.total, 4);
});

test('summary treats status case variants as one status', async () => {
  const { body } = await get('/summary');
  assert.equal(body.complaints.total, 6);
  assert.equal(body.complaints.byStatus.Resolved, 2);
  assert.equal(body.complaints.byStatus.resolved, undefined);
  assert.equal(body.complaints.resolvedPercent, 33.33);
  assert.deepEqual(body.complaints.byCategory, { 'Dirty water': 3, Other: 3 });
});

test('summary survives labels that match inherited object properties', async () => {
  const { status, body } = await get('/summary');
  assert.equal(status, 200);
  assert.equal(ownValue(body.complaints.byStatus, '__proto__'), 1);
  assert.equal(ownValue(body.complaints.byStatus, 'constructor'), 1);
  assert.equal(ownValue(body.alerts.bySeverity, 'constructor'), 1);
  assert.equal(ownValue(body.alerts.bySeverity, 'Critical'), 2);
  assert.equal(body.complaints.total, 6);
  assert.equal(body.alerts.total, 3);
});

test('summary on an empty table reports zeros', async () => {
  const saved = complaints.splice(0);
  try {
    const { body } = await get('/summary');
    assert.equal(body.complaints.total, 0);
    assert.equal(body.complaints.resolvedPercent, 0);
    assert.deepEqual(body.complaints.byStatus, {});
  } finally {
    complaints.push(...saved);
  }
});

test('readings rejects every malformed or out-of-range query value', async () => {
  const bad = [
    '?days=0',
    '?days=abc',
    '?days=366',
    '?days=2.5',
    '?days=1e2',
    '?days=07',
    '?days=-1',
    '?days=',
    '?days=1&days=2',
    '?assetId=0',
    '?assetId=x',
    '?assetId=-5',
    '?assetId=1e3',
    '?assetId=0x10',
    '?assetId=+5',
    '?assetId=%205',
    '?assetId=2147483648',
    '?assetId=99999999999999999999',
    '?assetId=5&assetId=6'
  ];
  for (const query of bad) {
    const { status, body } = await get(`/readings${query}`);
    assert.equal(status, 400, query);
    assert.ok(body.error, query);
  }
  assert.equal(queryRawCalls.length, 0, 'invalid input must never reach the database');
});

test('readings accepts the largest valid asset id and day window', async () => {
  const biggest = await get('/readings?assetId=2147483647');
  assert.equal(biggest.status, 200);
  assert.deepEqual(biggest.body.assets, []);
  const longest = await get('/readings?days=365');
  assert.equal(longest.status, 200);
  assert.equal(longest.body.days, 365);
});

test('readings always bounds the window above by now', async () => {
  await get('/readings');
  const { sql, values } = queryRawCalls[0];
  assert.match(sql, /"recordedAt" <= /);
  assert.equal(values[0], '20');
  assert.ok(Math.abs(Date.parse(values[1]) - Date.now()) < 5000);
  assert.deepEqual(values.slice(2), [null, null, null, null, '1000']);
  assert.match(sql, /LIMIT /);
});

test('readings with days and assetId pass both filters as parameters', async () => {
  await get('/readings?days=7&assetId=3');
  const { values } = queryRawCalls[0];
  assert.equal(Date.parse(values[1]) - Date.parse(values[2]), 7 * DAY_MS);
  assert.equal(values[2], values[3]);
  assert.deepEqual(values.slice(4), ['3', '3', '1000']);
});

test('readings maps database rows into the documented shape', async () => {
  behavior.queryRaw = () => [
    {
      assetId: 1,
      name: 'Rampur Tank',
      type: 'tank',
      village: 'Rampur',
      status: 'Operational',
      readingCount: 3,
      lowLevelReadings: 1,
      waterLevelAvg: 43.333333333,
      waterLevelMin: 10,
      waterLevelMax: 90,
      flowRateAvg: 7,
      flowRateMin: 5,
      flowRateMax: 9,
      pressureAvg: 2,
      pressureMin: 1,
      pressureMax: 3
    }
  ];
  const { status, body } = await get('/readings');
  assert.equal(status, 200);
  assert.equal(body.days, null);
  assert.equal(body.lowLevelThreshold, 20);
  assert.equal(body.maxAssets, 1000);
  assert.deepEqual(body.assets, [
    {
      assetId: 1,
      name: 'Rampur Tank',
      type: 'tank',
      village: 'Rampur',
      status: 'Operational',
      readingCount: 3,
      lowLevelReadings: 1,
      waterLevel: { avg: 43.33, min: 10, max: 90 },
      flowRate: { avg: 7, min: 5, max: 9 },
      pressure: { avg: 2, min: 1, max: 3 }
    }
  ]);
});

test('villages maps database rows and groups blank villages in one SQL statement', async () => {
  behavior.queryRaw = () => [
    { village: 'Rampur', totalAssets: 6, operational: 4, maintenance: 1, inactive: 0, other: 1, openAlerts: 3 },
    { village: 'Unassigned', totalAssets: 2, operational: 2, maintenance: 0, inactive: 0, other: 0, openAlerts: 0 }
  ];
  const { status, body } = await get('/villages');
  assert.equal(status, 200);
  assert.equal(queryRawCalls.length, 1);
  assert.deepEqual(body, [
    { village: 'Rampur', totalAssets: 6, operational: 4, maintenance: 1, inactive: 0, other: 1, openAlerts: 3 },
    { village: 'Unassigned', totalAssets: 2, operational: 2, maintenance: 0, inactive: 0, other: 0, openAlerts: 0 }
  ]);
  body.forEach((row) => {
    assert.equal(row.operational + row.maintenance + row.inactive + row.other, row.totalAssets, row.village);
    assert.deepEqual(Object.keys(row), ['village', 'totalAssets', 'operational', 'maintenance', 'inactive', 'other', 'openAlerts']);
  });
  const { sql } = queryRawCalls[0];
  assert.match(sql, /COALESCE\(NULLIF\(LOWER\(BTRIM\(a\."village", \?::text\)\), ''\), 'unassigned'\)/);
  assert.match(sql, /LOWER\(BTRIM\("status", \?::text\)\) = 'open'/);
  assert.match(sql, /NOT IN \('operational', 'maintenance', 'inactive'\)/);
  assert.match(sql, /"village" ASC/);
});

test('trends fills every quiet day with a real zero, never null', async () => {
  behavior.queryRaw = () => [
    { series: 'alerts', day: dayKey(0), count: 2 },
    { series: 'complaints', day: dayKey(0), count: 1 },
    { series: 'readings', day: dayKey(2), count: 5 }
  ];
  const { status, body } = await get('/trends?days=3');
  assert.equal(status, 200);
  assert.equal(body.series.length, 3);
  assert.equal(body.from, dayKey(2));
  assert.equal(body.to, dayKey(0));
  assert.deepEqual(body.series[0], { date: dayKey(2), alerts: 0, complaints: 0, readings: 5 });
  assert.deepEqual(body.series[1], { date: dayKey(1), alerts: 0, complaints: 0, readings: 0 });
  assert.deepEqual(body.series[2], { date: dayKey(0), alerts: 2, complaints: 1, readings: 0 });
  body.series.forEach((row) => {
    ['alerts', 'complaints', 'readings'].forEach((field) => {
      assert.equal(typeof row[field], 'number', `${row.date} ${field}`);
    });
  });
});

test('trends with no data at all is zero for every series on every day', async () => {
  const { body } = await get('/trends');
  assert.equal(body.series.length, 7);
  body.series.forEach((row) => {
    assert.strictEqual(row.alerts, 0);
    assert.strictEqual(row.complaints, 0);
    assert.strictEqual(row.readings, 0);
  });
});

test('trends ignores rows outside the window or with an unknown series', async () => {
  behavior.queryRaw = () => [
    { series: 'alerts', day: '1999-01-01', count: 9 },
    { series: 'constructor', day: dayKey(0), count: 7 },
    { series: '__proto__', day: dayKey(0), count: 7 },
    { series: 'alerts', day: dayKey(0), count: 1 }
  ];
  const { body } = await get('/trends?days=2');
  assert.deepEqual(body.series[1], { date: dayKey(0), alerts: 1, complaints: 0, readings: 0 });
  assert.deepEqual(Object.keys(body.series[1]), ['date', 'alerts', 'complaints', 'readings']);
});

test('trends runs one statement over one window that ends now', async () => {
  await get('/trends?days=3');
  assert.equal(queryRawCalls.length, 1);
  const { values } = queryRawCalls[0];
  assert.equal(values.length, 6);
  assert.ok(values[0].endsWith('T00:00:00.000Z'));
  assert.ok(Date.parse(values[1]) - Date.parse(values[0]) < 3 * DAY_MS);
  assert.deepEqual(values.slice(0, 2), values.slice(2, 4));
  assert.deepEqual(values.slice(0, 2), values.slice(4, 6));
});

test('trends validates days', async () => {
  for (const query of ['?days=0', '?days=366', '?days=abc', '?days=07', '?days=1e1', '?days=', '?days=2&days=3']) {
    const { status } = await get(`/trends${query}`);
    assert.equal(status, 400, query);
  }
  assert.equal(queryRawCalls.length, 0);
});

test('database failures are logged on the server and not leaked to the caller', async () => {
  const secret = 'relation "Asset" does not exist at 10.0.0.5';
  const errorLog = mock.method(console, 'error', () => {});
  try {
    behavior.queryRaw = () => {
      throw new Error(secret);
    };
    behavior.transaction = new Error(secret);

    for (const path of ['/summary', '/readings', '/villages', '/trends']) {
      const { status, body } = await get(path);
      assert.equal(status, 500, path);
      assert.equal(body.error, 'Failed to compute analytics', path);
      assert.ok(!JSON.stringify(body).includes(secret), path);
    }

    assert.deepEqual(
      errorLog.mock.calls.map((call) => call.arguments[0]),
      [
        '[analytics] summary failed:',
        '[analytics] readings failed:',
        '[analytics] villages failed:',
        '[analytics] trends failed:'
      ]
    );
    errorLog.mock.calls.forEach((call) => {
      assert.equal(call.arguments[1].message, secret);
    });
  } finally {
    errorLog.mock.restore();
  }
});

test('the existing api directory still responds', async () => {
  const res = await fetch(`${origin}/api`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.name, 'JalNavigator REST API');
});

test('every village bucket trims the same whitespace that JavaScript trims', async () => {
  const { TRIM_CHARS } = require('../utils/analyticsGuard');
  behavior.queryRaw = () => [];
  await get('/villages');
  const { values } = queryRawCalls[0];
  assert.equal(values.length, 4);
  values.forEach((value) => assert.equal(value, TRIM_CHARS));
  const padded = `\u00a0\t\n\u3000 Rampur \u2003\ufeff\r`;
  assert.equal(padded.trim(), 'Rampur');
  Array.from(TRIM_CHARS).forEach((character) => {
    assert.equal(`${character}Rampur${character}`.trim(), 'Rampur', JSON.stringify(character));
  });
  Array.from(padded).forEach((character) => {
    if (character !== 'R' && !/[ampur]/.test(character)) {
      assert.ok(TRIM_CHARS.includes(character), `SQL would keep ${JSON.stringify(character)}`);
    }
  });
});

test('every database statement runs in a transaction pinned to UTC with a statement timeout', async () => {
  for (const path of ['/summary', '/readings', '/villages', '/trends']) {
    sessionStatements.length = 0;
    transactionCalls.length = 0;
    const { status } = await get(path);
    assert.equal(status, 200, path);
    assert.deepEqual(
      sessionStatements,
      ["SET LOCAL TimeZone = 'UTC'", 'SET LOCAL statement_timeout = 5000'],
      path
    );
    assert.equal(transactionCalls.length, 1, path);
  }
});

test('the summary snapshot and the UTC pin share one transaction', async () => {
  await get('/summary');
  assert.deepEqual(transactionCalls, [{ isolationLevel: 'RepeatableRead' }]);
  assert.deepEqual(sessionStatements, ["SET LOCAL TimeZone = 'UTC'", 'SET LOCAL statement_timeout = 5000']);
});

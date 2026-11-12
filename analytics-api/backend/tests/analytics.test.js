const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (days) => new Date(now - days * DAY_MS);
const dateKey = (date) => date.toISOString().slice(0, 10);

const assets = [
  { id: 1, name: 'Rampur Tank', type: 'tank', village: 'Rampur', status: 'Operational' },
  { id: 2, name: 'Rampur Borewell', type: 'borewell', village: 'Rampur', status: 'Maintenance' },
  { id: 3, name: 'Sonpur Pump', type: 'pump', village: 'Sonpur', status: 'Operational' },
  { id: 4, name: 'Sonpur Tank', type: 'Tank', village: ' sonpur ', status: 'Inactive' },
  { id: 5, name: 'Loose Pipeline', type: 'pipeline', village: '', status: 'Operational' }
];

const readings = [
  { id: 1, assetId: 1, waterLevel: 10, flowRate: 5, pressure: 1, recordedAt: daysAgo(1) },
  { id: 2, assetId: 1, waterLevel: 30, flowRate: 7, pressure: 2, recordedAt: daysAgo(0) },
  { id: 3, assetId: 1, waterLevel: 90, flowRate: 9, pressure: 3, recordedAt: daysAgo(30) },
  { id: 4, assetId: 3, waterLevel: 50, flowRate: 10, pressure: 2, recordedAt: daysAgo(1) },
  { id: 5, assetId: 3, waterLevel: 70, flowRate: 12, pressure: 2.5, recordedAt: daysAgo(2) }
];

const alerts = [
  { id: 1, assetId: 1, severity: 'Critical', status: 'Open', createdAt: daysAgo(0) },
  { id: 2, assetId: 1, severity: 'Critical', status: 'Resolved', createdAt: daysAgo(2) },
  { id: 3, assetId: 3, severity: 'Critical', status: 'Open', createdAt: daysAgo(0) }
];

const complaints = [
  { id: 1, category: 'Dirty water', status: 'Pending', createdAt: daysAgo(0) },
  { id: 2, category: 'Dirty water', status: 'Resolved', createdAt: daysAgo(3) },
  { id: 3, category: 'Low water pressure', status: 'In Progress', createdAt: daysAgo(10) }
];

function matches(row, where = {}) {
  return Object.entries(where).every(([field, condition]) => {
    const value = row[field];
    const isOperator =
      condition !== null && typeof condition === 'object' && !(condition instanceof Date);
    if (!isOperator) return value === condition;
    if ('gte' in condition && !(value >= condition.gte)) return false;
    if ('lt' in condition && !(value < condition.lt)) return false;
    if ('in' in condition && !condition.in.includes(value)) return false;
    return true;
  });
}

function createModel(rows) {
  const pick = (row, fields) =>
    fields ? Object.fromEntries(Object.keys(fields).map((key) => [key, row[key]])) : row;

  return {
    findMany: async ({ where, select } = {}) =>
      rows.filter((row) => matches(row, where)).map((row) => pick(row, select)),
    count: async ({ where } = {}) => rows.filter((row) => matches(row, where)).length,
    groupBy: async ({ by, where, _count, _avg, _min, _max }) => {
      const groups = new Map();
      rows
        .filter((row) => matches(row, where))
        .forEach((row) => {
          const key = by.map((field) => row[field]).join('|');
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(row);
        });
      return [...groups.values()].map((list) => {
        const result = Object.fromEntries(by.map((field) => [field, list[0][field]]));
        const aggregate = (spec, fn) =>
          Object.fromEntries(
            Object.keys(spec).map((field) => [field, fn(list.map((row) => row[field]))])
          );
        if (_count) result._count = { _all: list.length };
        if (_avg) result._avg = aggregate(_avg, (v) => v.reduce((a, b) => a + b, 0) / v.length);
        if (_min) result._min = aggregate(_min, (v) => Math.min(...v));
        if (_max) result._max = aggregate(_max, (v) => Math.max(...v));
        return result;
      });
    }
  };
}

const databasePath = require.resolve('../database');
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: {
    asset: createModel(assets),
    sensorReading: createModel(readings),
    alert: createModel(alerts),
    complaint: createModel(complaints)
  }
};

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', require('../routes/api'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/analytics`;
});

after(() => {
  server.close();
});

const get = async (path) => {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
};

test('directory lists the four analytics endpoints', async () => {
  const { status, body } = await get('');
  assert.equal(status, 200);
  assert.equal(body.endpoints.length, 4);
});

test('summary groups assets, complaints and alerts', async () => {
  const { status, body } = await get('/summary');
  assert.equal(status, 200);
  assert.equal(body.assets.total, 5);
  assert.deepEqual(body.assets.byType, { tank: 2, borewell: 1, pump: 1, pipeline: 1 });
  assert.deepEqual(body.assets.byStatus, { Operational: 3, Maintenance: 1, Inactive: 1 });
  assert.equal(body.complaints.total, 3);
  assert.equal(body.complaints.resolvedPercent, 33.33);
  assert.deepEqual(body.complaints.byCategory, { 'Dirty water': 2, 'Low water pressure': 1 });
  assert.deepEqual(body.alerts.byStatus, { Open: 2, Resolved: 1 });
  assert.deepEqual(body.alerts.bySeverity, { Critical: 3 });
  assert.equal(body.readings.total, 5);
});

test('readings aggregates per asset and sorts lowest average first', async () => {
  const { status, body } = await get('/readings');
  assert.equal(status, 200);
  assert.equal(body.days, null);
  assert.equal(body.lowLevelThreshold, 20);
  assert.deepEqual(body.assets.map((row) => row.assetId), [1, 3]);
  const tank = body.assets[0];
  assert.equal(tank.readingCount, 3);
  assert.equal(tank.lowLevelReadings, 1);
  assert.deepEqual(tank.waterLevel, { avg: 43.33, min: 10, max: 90 });
  assert.deepEqual(tank.pressure, { avg: 2, min: 1, max: 3 });
});

test('readings honours the days window', async () => {
  const { body } = await get('/readings?days=7');
  const tank = body.assets.find((row) => row.assetId === 1);
  assert.equal(body.days, 7);
  assert.equal(tank.readingCount, 2);
  assert.equal(tank.waterLevel.avg, 20);
});

test('readings can be limited to one asset', async () => {
  const { body } = await get('/readings?assetId=3');
  assert.equal(body.assets.length, 1);
  assert.equal(body.assets[0].name, 'Sonpur Pump');
  assert.equal(body.assets[0].waterLevel.avg, 60);
});

test('readings rejects invalid query values', async () => {
  for (const query of ['?days=0', '?days=abc', '?days=366', '?days=2.5', '?assetId=0', '?assetId=x']) {
    const { status, body } = await get(`/readings${query}`);
    assert.equal(status, 400, query);
    assert.ok(body.error);
  }
});

test('villages merges name variants and ranks by open alerts', async () => {
  const { status, body } = await get('/villages');
  assert.equal(status, 200);
  assert.deepEqual(body.map((row) => row.village), ['Rampur', 'Sonpur', 'Unassigned']);
  assert.deepEqual(body[0], {
    village: 'Rampur',
    totalAssets: 2,
    operational: 1,
    maintenance: 1,
    inactive: 0,
    openAlerts: 1
  });
  assert.equal(body[1].totalAssets, 2);
  assert.equal(body[1].inactive, 1);
  assert.equal(body[1].openAlerts, 1);
  assert.equal(body[2].openAlerts, 0);
});

test('trends returns one zero-filled bucket per day', async () => {
  const { status, body } = await get('/trends?days=3');
  assert.equal(status, 200);
  assert.equal(body.series.length, 3);
  assert.equal(body.to, dateKey(new Date()));
  assert.equal(body.from, dateKey(daysAgo(2)));
  const today = body.series.find((row) => row.date === dateKey(daysAgo(0)));
  assert.equal(today.alerts, 2);
  assert.equal(today.complaints, 1);
  const twoDaysAgo = body.series.find((row) => row.date === dateKey(daysAgo(2)));
  assert.equal(twoDaysAgo.alerts, 1);
  assert.equal(twoDaysAgo.readings, 1);
});

test('trends defaults to seven days and rejects bad input', async () => {
  const week = await get('/trends');
  assert.equal(week.body.series.length, 7);
  assert.equal(week.body.series.reduce((sum, row) => sum + row.complaints, 0), 2);
  for (const query of ['?days=0', '?days=400', '?days=abc']) {
    const { status } = await get(`/trends${query}`);
    assert.equal(status, 400, query);
  }
});

test('existing api directory still responds', async () => {
  const res = await fetch(baseUrl.replace('/analytics', ''));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.name, 'JalNavigator REST API');
});

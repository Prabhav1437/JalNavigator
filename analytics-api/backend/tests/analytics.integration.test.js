process.env.ANALYTICS_CACHE_SECONDS = '0';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { requireTestDatabase } = require('./analyticsTestDatabase');

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const databaseUrl = process.env.ANALYTICS_TEST_DATABASE_URL;

function midnight() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function at(daysBack) {
  if (daysBack === 0) return midnight();
  return new Date(midnight().getTime() - daysBack * DAY_MS + 12 * HOUR_MS);
}

const daysAhead = (days) => new Date(Date.now() + days * DAY_MS);
const dayKey = (date) => date.toISOString().slice(0, 10);

function foldCounts(counts) {
  const folded = new Map();
  Object.entries(counts).forEach(([label, count]) => {
    const key = label.trim().toLowerCase();
    folded.set(key, (folded.get(key) || 0) + count);
  });
  return folded;
}

function runSuite(url) {
  requireTestDatabase(url);
  process.env.DATABASE_URL = url;
  const prisma = require('../database');

  let server;
  let origin;
  const ids = {};

  const get = async (path) => {
    const res = await fetch(`${origin}/api/analytics${path}`);
    return { status: res.status, body: await res.json() };
  };

  async function clearAll() {
    await prisma.alert.deleteMany();
    await prisma.sensorReading.deleteMany();
    await prisma.complaint.deleteMany();
    await prisma.asset.deleteMany();
  }

  before(async () => {
    await clearAll();
    const make = async (key, data) => {
      ids[key] = (await prisma.asset.create({ data: { latitude: 26.8, longitude: 80.9, ...data } })).id;
    };
    await make('rampurTank', { name: 'Rampur Tank', type: 'tank', village: 'Rampur', status: 'Operational' });
    await make('rampurWell', { name: 'Rampur Borewell', type: 'borewell', village: '  rampur ', status: 'maintenance' });
    await make('sonpurPump', { name: 'Sonpur Pump', type: 'pump', village: 'Sonpur', status: 'Operational' });
    await make('sonpurTank', { name: 'Sonpur Tank', type: 'Tank', village: ' sonpur ', status: 'Inactive' });
    await make('blank', { name: 'Blank Village', type: 'pipeline', village: '', status: 'Operational' });
    await make('literal', { name: 'Literal Unassigned', type: 'pump', village: 'Unassigned', status: 'operational' });
    await make('spaced', { name: 'Spaced Unassigned', type: 'tank', village: ' unassigned ', status: 'Operational' });
    await make('lonely', { name: 'Lonely Well', type: 'borewell', village: 'Lonely', status: 'Operational' });

    const reading = (assetId, waterLevel, recordedAt) => ({
      assetId,
      waterLevel,
      flowRate: waterLevel / 10,
      pressure: 2,
      recordedAt
    });
    await prisma.sensorReading.createMany({
      data: [
        reading(ids.rampurTank, 10, at(1)),
        reading(ids.rampurTank, 30, at(0)),
        reading(ids.rampurTank, 90, at(30)),
        reading(ids.rampurTank, 5, daysAhead(2)),
        reading(ids.rampurWell, 25, at(0)),
        reading(ids.sonpurPump, 50, at(1)),
        reading(ids.sonpurPump, 70, at(2))
      ]
    });

    const alert = (assetId, status, createdAt) => ({
      assetId,
      message: 'Critical low water level',
      severity: 'Critical',
      status,
      createdAt
    });
    await prisma.alert.createMany({
      data: [
        alert(ids.rampurTank, 'Open', at(0)),
        alert(ids.sonpurPump, 'open', at(0)),
        alert(ids.rampurTank, 'Resolved', at(2)),
        alert(ids.rampurWell, 'OPEN', at(3)),
        alert(ids.sonpurPump, 'Resolved', daysAhead(1))
      ]
    });

    const complaint = (category, status, createdAt) => ({
      title: 'Water problem',
      category,
      description: 'Example',
      status,
      createdAt
    });
    await prisma.complaint.createMany({
      data: [
        complaint('Dirty water', 'Pending', at(0)),
        complaint('Dirty water', 'constructor', at(0)),
        complaint('Dirty water', 'resolved', at(3)),
        complaint('Other', 'Resolved', at(3)),
        complaint('Other', '__proto__', at(10)),
        complaint('Other', 'Pending', daysAhead(1))
      ]
    });

    const app = express();
    app.use(express.json());
    app.use('/api', require('../routes/api'));
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) server.close();
    await clearAll();
    await prisma.$disconnect();
  });

  test('summary counts every table and folds case variants together', async () => {
    const { status, body } = await get('/summary');
    assert.equal(status, 200);
    assert.equal(body.assets.total, 8);
    assert.deepEqual(Object.fromEntries(foldCounts(body.assets.byType)), { tank: 3, borewell: 2, pump: 2, pipeline: 1 });
    assert.equal(Object.keys(body.assets.byType).length, 4);
    assert.deepEqual(Object.fromEntries(foldCounts(body.assets.byStatus)), { operational: 6, maintenance: 1, inactive: 1 });
    assert.equal(Object.keys(body.assets.byStatus).length, 3);
    assert.equal(body.alerts.total, 5);
    assert.deepEqual(Object.fromEntries(foldCounts(body.alerts.byStatus)), { open: 3, resolved: 2 });
    assert.equal(Object.keys(body.alerts.byStatus).length, 2);
    assert.deepEqual(Object.fromEntries(foldCounts(body.alerts.bySeverity)), { critical: 5 });
    assert.equal(body.readings.total, 7);
  });

  test('summary counts resolved complaints regardless of case and survives odd labels', async () => {
    const { body } = await get('/summary');
    assert.equal(body.complaints.total, 6);
    assert.equal(body.complaints.resolvedPercent, 33.33);
    const statuses = foldCounts(body.complaints.byStatus);
    assert.equal(statuses.get('resolved'), 2);
    assert.equal(statuses.get('pending'), 2);
    assert.equal(statuses.get('__proto__'), 1);
    assert.equal(statuses.get('constructor'), 1);
    assert.equal(Object.getOwnPropertyDescriptor(body.complaints.byStatus, '__proto__').value, 1);
    assert.deepEqual(Object.fromEntries(foldCounts(body.complaints.byCategory)), { 'dirty water': 3, other: 3 });
  });

  test('readings ignores future-dated rows and sorts by lowest average first', async () => {
    const { status, body } = await get('/readings');
    assert.equal(status, 200);
    assert.equal(body.days, null);
    assert.deepEqual(
      body.assets.map((row) => row.assetId),
      [ids.rampurWell, ids.rampurTank, ids.sonpurPump]
    );
    const tank = body.assets.find((row) => row.assetId === ids.rampurTank);
    assert.equal(tank.readingCount, 3);
    assert.equal(tank.lowLevelReadings, 1);
    assert.deepEqual(tank.waterLevel, { avg: 43.33, min: 10, max: 90 });
    assert.deepEqual(tank.flowRate, { avg: 4.33, min: 1, max: 9 });
    assert.deepEqual(tank.pressure, { avg: 2, min: 2, max: 2 });
    assert.equal(tank.name, 'Rampur Tank');
    assert.equal(tank.village, 'Rampur');
  });

  test('readings honours the days window and the asset filter', async () => {
    const week = await get('/readings?days=7');
    assert.equal(week.body.days, 7);
    assert.deepEqual(
      week.body.assets.map((row) => row.assetId),
      [ids.rampurTank, ids.rampurWell, ids.sonpurPump]
    );
    const tank = week.body.assets[0];
    assert.equal(tank.readingCount, 2);
    assert.equal(tank.waterLevel.avg, 20);

    const one = await get(`/readings?assetId=${ids.sonpurPump}`);
    assert.equal(one.body.assets.length, 1);
    assert.deepEqual(one.body.assets[0].waterLevel, { avg: 60, min: 50, max: 70 });
  });

  test('the days window is a rolling 24 hours, at any time of day', async () => {
    const asset = await prisma.asset.create({
      data: { name: 'Window Tank', type: 'tank', village: 'Windowpur', status: 'Operational', latitude: 1, longitude: 1 }
    });
    const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000);
    try {
      await prisma.sensorReading.createMany({
        data: [
          { assetId: asset.id, waterLevel: 10, flowRate: 1, pressure: 1, recordedAt: minutesAgo(120) },
          { assetId: asset.id, waterLevel: 30, flowRate: 1, pressure: 1, recordedAt: minutesAgo(23 * 60 + 59) },
          { assetId: asset.id, waterLevel: 40, flowRate: 1, pressure: 1, recordedAt: minutesAgo(24 * 60 + 1) },
          { assetId: asset.id, waterLevel: 50, flowRate: 1, pressure: 1, recordedAt: minutesAgo(26 * 60) }
        ]
      });

      const day = (await get(`/readings?days=1&assetId=${asset.id}`)).body.assets[0];
      assert.equal(day.readingCount, 2);
      assert.deepEqual(day.waterLevel, { avg: 20, min: 10, max: 30 });

      const twoDays = (await get(`/readings?days=2&assetId=${asset.id}`)).body.assets[0];
      assert.equal(twoDays.readingCount, 4);
      assert.deepEqual(twoDays.waterLevel, { avg: 32.5, min: 10, max: 50 });

      const hour = await get(`/readings?days=1&assetId=${asset.id}`);
      assert.equal(hour.body.days, 1);
    } finally {
      await prisma.sensorReading.deleteMany({ where: { assetId: asset.id } });
      await prisma.asset.delete({ where: { id: asset.id } });
    }
  });

  test('the indexes the history queries need are present in the database', async () => {
    const indexes = await prisma.$queryRaw`
      SELECT tablename::text AS "table", indexdef::text AS "definition"
      FROM pg_indexes WHERE schemaname = current_schema()::text
    `;
    const has = (table, pattern) => indexes.some((row) => row.table === table && pattern.test(row.definition));
    assert.ok(has('SensorReading', /\("recordedAt"\)/), 'missing SensorReading index on (recordedAt)');
    assert.ok(has('SensorReading', /\("assetId", "recordedAt"\)/), 'missing SensorReading index on (assetId, recordedAt)');
    assert.ok(has('Alert', /\("createdAt"\)/), 'missing Alert index on (createdAt)');
    assert.ok(has('Complaint', /\("createdAt"\)/), 'missing Complaint index on (createdAt)');
  });

  test('villages groups name variants and blank or literal Unassigned into one row each', async () => {
    const { status, body } = await get('/villages');
    assert.equal(status, 200);
    assert.equal(body.length, 4);
    assert.deepEqual(
      body.map((row) => row.village.trim().toLowerCase()),
      ['rampur', 'sonpur', 'unassigned', 'lonely']
    );
    const [rampur, sonpur, unassigned, lonely] = body;
    assert.deepEqual(
      { ...rampur, village: rampur.village.toLowerCase() },
      { village: 'rampur', totalAssets: 2, operational: 1, maintenance: 1, inactive: 0, other: 0, openAlerts: 2 }
    );
    assert.deepEqual(
      { ...sonpur, village: sonpur.village.toLowerCase() },
      { village: 'sonpur', totalAssets: 2, operational: 1, maintenance: 0, inactive: 1, other: 0, openAlerts: 1 }
    );
    assert.deepEqual(unassigned, {
      village: 'Unassigned',
      totalAssets: 3,
      operational: 3,
      maintenance: 0,
      inactive: 0,
      other: 0,
      openAlerts: 0
    });
    assert.deepEqual(lonely, {
      village: 'Lonely',
      totalAssets: 1,
      operational: 1,
      maintenance: 0,
      inactive: 0,
      other: 0,
      openAlerts: 0
    });
    body.forEach((row) => {
      assert.equal(row.operational + row.maintenance + row.inactive + row.other, row.totalAssets, row.village);
    });
  });

  test('every asset status is accounted for, so the health buckets add up to the total', async () => {
    const statuses = ['Operational', 'maintenance', 'INACTIVE', 'Decommissioned', 'Planned', '', '   ', 'operational '];
    const made = [];
    try {
      for (const status of statuses) {
        made.push(
          (
            await prisma.asset.create({
              data: { name: `Status ${made.length}`, type: 'tank', village: 'Statuspur', status, latitude: 1, longitude: 1 }
            })
          ).id
        );
      }
      const rows = (await get('/villages')).body;
      const statuspur = rows.find((row) => row.village === 'Statuspur');
      assert.ok(statuspur, 'Statuspur is missing from the village list');
      assert.deepEqual(statuspur, {
        village: 'Statuspur',
        totalAssets: 8,
        operational: 2,
        maintenance: 1,
        inactive: 1,
        other: 4,
        openAlerts: 0
      });
      rows.forEach((row) => {
        assert.equal(row.operational + row.maintenance + row.inactive + row.other, row.totalAssets, row.village);
      });

      const totals = rows.reduce(
        (sum, row) => sum + row.operational + row.maintenance + row.inactive + row.other,
        0
      );
      assert.equal(totals, (await get('/summary')).body.assets.total);
    } finally {
      await prisma.asset.deleteMany({ where: { id: { in: made } } });
    }
  });

  test('tabs and newlines around a name or status are trimmed exactly as JavaScript trims them', async () => {
    const before = (await get('/villages')).body;
    const rampurBefore = before.find((row) => row.village.trim().toLowerCase() === 'rampur');
    const made = [];
    try {
      const padded = ['\tRampur\n', '\u00a0rampur\u3000', '\r\nRAMPUR\t'];
      for (const village of padded) {
        made.push(
          (
            await prisma.asset.create({
              data: { name: `Padded ${made.length}`, type: 'tank', village, status: '\tOperational\n', latitude: 1, longitude: 1 }
            })
          ).id
        );
      }
      const rows = (await get('/villages')).body;
      assert.equal(rows.length, before.length, 'padded names must not create extra village rows');
      const rampur = rows.find((row) => row.village.trim().toLowerCase() === 'rampur');
      assert.equal(rampur.totalAssets, rampurBefore.totalAssets + padded.length);
      assert.equal(rampur.operational, rampurBefore.operational + padded.length);
      assert.equal(rampur.other, 0, 'a padded status must not fall into the other bucket');
      assert.equal(rampur.village, rampur.village.trim());

      const alert = await prisma.alert.create({
        data: { assetId: made[0], message: 'Critical low water level', severity: 'Critical', status: '\n OPEN \t' }
      });
      const withAlert = (await get('/villages')).body.find((row) => row.village.trim().toLowerCase() === 'rampur');
      assert.equal(withAlert.openAlerts, rampurBefore.openAlerts + 1, 'a padded Open status must still count as open');
      await prisma.alert.delete({ where: { id: alert.id } });
    } finally {
      await prisma.asset.deleteMany({ where: { id: { in: made } } });
    }
  });

  test('village labels and order are identical on every request', async () => {
    const first = (await get('/villages')).body;
    for (let i = 0; i < 5; i += 1) {
      const next = (await get('/villages')).body;
      assert.deepEqual(next, first);
    }
    assert.ok(first[0].village === first[0].village.trim());
  });

  test('trends counts per UTC day, excludes future rows and zero-fills quiet days', async () => {
    const { status, body } = await get('/trends?days=3');
    assert.equal(status, 200);
    assert.equal(body.from, dayKey(at(2)));
    assert.equal(body.to, dayKey(midnight()));
    assert.deepEqual(body.series, [
      { date: dayKey(at(2)), alerts: 1, complaints: 0, readings: 1 },
      { date: dayKey(at(1)), alerts: 0, complaints: 0, readings: 2 },
      { date: dayKey(at(0)), alerts: 2, complaints: 2, readings: 2 }
    ]);
    body.series.forEach((row) => {
      ['alerts', 'complaints', 'readings'].forEach((field) => {
        assert.equal(typeof row[field], 'number');
      });
    });
  });

  test('trends covers a longer window with real zeros on empty days', async () => {
    const { body } = await get('/trends?days=14');
    assert.equal(body.series.length, 14);
    const quiet = body.series.filter((row) => row.alerts + row.complaints + row.readings === 0);
    assert.ok(quiet.length >= 8);
    quiet.forEach((row) => {
      assert.strictEqual(row.alerts, 0);
      assert.strictEqual(row.complaints, 0);
      assert.strictEqual(row.readings, 0);
    });
    assert.equal(body.series.reduce((sum, row) => sum + row.alerts, 0), 4);
    assert.equal(body.series.reduce((sum, row) => sum + row.complaints, 0), 5);
    assert.equal(body.series.reduce((sum, row) => sum + row.readings, 0), 5);
  });

  test('aggregations are computed in the database even for 30000 readings', async () => {
    const bulk = await prisma.asset.create({
      data: { name: 'Bulk', type: 'tank', village: 'Bulk', status: 'Operational', latitude: 1, longitude: 1 }
    });
    await prisma.$executeRaw`
      INSERT INTO "SensorReading" ("assetId", "waterLevel", "flowRate", "pressure", "recordedAt")
      SELECT ${bulk.id}::int, (g % 100)::float8, 1, 1,
             (date_trunc('day', now() AT TIME ZONE 'UTC') - ((g % 5) || ' days')::interval)
      FROM generate_series(1, 30000) g
    `;
    try {
      const startedAt = Date.now();
      const readings = await get(`/readings?assetId=${bulk.id}`);
      const trends = await get('/trends?days=5');
      assert.ok(Date.now() - startedAt < 5000);

      const row = readings.body.assets[0];
      assert.equal(row.readingCount, 30000);
      assert.equal(row.lowLevelReadings, 6000);
      assert.deepEqual(row.waterLevel, { avg: 49.5, min: 0, max: 99 });

      const bulkInTrends = trends.body.series.reduce((sum, day) => sum + day.readings, 0);
      assert.equal(bulkInTrends, 30000 + 5);
      trends.body.series.forEach((day) => assert.ok(day.readings >= 6000));
    } finally {
      await prisma.sensorReading.deleteMany({ where: { assetId: bulk.id } });
      await prisma.asset.delete({ where: { id: bulk.id } });
    }
  });

  test('summary stays internally consistent while rows are being written', async () => {
    const baseline = (await get('/summary')).body;
    const writes = 40;
    let writing = true;

    const writer = (async () => {
      for (let i = 0; i < writes; i += 1) {
        await prisma.$transaction([
          prisma.asset.create({
            data: {
              name: `Writer ${i}`,
              type: 'tank',
              village: 'Writers',
              status: 'Operational',
              latitude: 1,
              longitude: 1,
              alerts: { create: { message: 'Critical low water level', severity: 'Critical', status: 'Open' } },
              sensorReadings: { create: { waterLevel: 50, flowRate: 1, pressure: 1 } }
            }
          }),
          prisma.complaint.create({ data: { title: 'Writer', category: 'Other', description: 'Writer' } })
        ]);
      }
      writing = false;
    })();

    const deltas = [];
    const reader = async () => {
      while (writing) {
        const { body } = await get('/summary');
        deltas.push([
          body.assets.total - baseline.assets.total,
          body.alerts.total - baseline.alerts.total,
          body.readings.total - baseline.readings.total,
          body.complaints.total - baseline.complaints.total
        ]);
      }
    };
    await Promise.all([writer, reader(), reader(), reader()]);

    assert.ok(deltas.length >= 5);
    deltas.forEach(([assetDelta, alertDelta, readingDelta, complaintDelta]) => {
      assert.equal(alertDelta, assetDelta);
      assert.equal(readingDelta, assetDelta);
      assert.equal(complaintDelta, assetDelta);
    });
    assert.ok(deltas.some(([delta]) => delta > 0 && delta < writes));

    const final = (await get('/summary')).body;
    assert.equal(final.assets.total - baseline.assets.total, writes);
  });
}

if (databaseUrl) {
  runSuite(databaseUrl);
} else {
  test('analytics integration tests need ANALYTICS_TEST_DATABASE_URL', { skip: true }, () => {});
}

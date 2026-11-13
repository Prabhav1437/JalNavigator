process.env.ANALYTICS_CACHE_SECONDS = '0';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { requireTestDatabase } = require('./analyticsTestDatabase');

const SESSION_TIME_ZONE = process.env.ANALYTICS_TEST_TIME_ZONE || '-05:30';
const DAY_MS = 24 * 60 * 60 * 1000;
const databaseUrl = process.env.ANALYTICS_TEST_DATABASE_URL;

const TIMESTAMP_COLUMNS = [
  ['SensorReading', 'recordedAt'],
  ['Alert', 'createdAt'],
  ['Complaint', 'createdAt']
];

function withSessionTimeZone(url, zone) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}options=${encodeURIComponent(`-c timezone=${zone}`)}`;
}

function utcDay(daysBack, hours, minutes) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return new Date(date.getTime() - daysBack * DAY_MS + hours * 60 * 60 * 1000 + minutes * 60 * 1000);
}

const dayKey = (date) => date.toISOString().slice(0, 10);

function runSuite(url) {
  requireTestDatabase(url);
  process.env.DATABASE_URL = withSessionTimeZone(url, SESSION_TIME_ZONE);
  const prisma = require('../database');

  let server;
  let origin;
  let assetId;

  const get = async (path) => {
    const res = await fetch(`${origin}/api/analytics${path}`);
    return { status: res.status, body: await res.json() };
  };

  const changeColumns = async (type) => {
    for (const [table, column] of TIMESTAMP_COLUMNS) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE ${type} USING ("${column}" AT TIME ZONE 'UTC')`
      );
    }
  };

  const clearAll = async () => {
    await prisma.alert.deleteMany();
    await prisma.sensorReading.deleteMany();
    await prisma.complaint.deleteMany();
    await prisma.asset.deleteMany();
  };

  before(async () => {
    const [{ tz }] = await prisma.$queryRaw`SELECT current_setting('TimeZone') AS tz`;
    assert.notEqual(
      tz,
      'UTC',
      `this suite needs a non-UTC PostgreSQL session time zone to be meaningful, but the session reports ${tz}`
    );

    await clearAll();
    await changeColumns('timestamptz(3)');

    assetId = (
      await prisma.asset.create({
        data: { name: 'Zone Tank', type: 'tank', village: 'Zonepur', status: 'Operational', latitude: 1, longitude: 1 }
      })
    ).id;

    const insertReading = (date) => prisma.$executeRawUnsafe(
      `INSERT INTO "SensorReading" ("assetId", "waterLevel", "flowRate", "pressure", "recordedAt")
       VALUES (${assetId}, 50, 1, 1, '${date.toISOString()}'::timestamptz)`
    );
    await insertReading(utcDay(1, 0, 30));
    await insertReading(utcDay(1, 23, 30));
    await insertReading(utcDay(2, 20, 0));
    await insertReading(utcDay(3, 12, 0));

    await prisma.$executeRawUnsafe(
      `INSERT INTO "Alert" ("assetId", "message", "severity", "status", "createdAt")
       VALUES (${assetId}, 'Critical low water level', 'Critical', 'Open', '${utcDay(1, 23, 30).toISOString()}'::timestamptz)`
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Complaint" ("title", "category", "description", "status", "createdAt")
       VALUES ('Zone', 'Other', 'Zone', 'Pending', '${utcDay(1, 23, 30).toISOString()}'::timestamptz)`
    );

    const app = express();
    app.use('/api', require('../routes/api'));
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) server.close();
    try {
      await clearAll();
      await changeColumns('timestamp(3)');
    } finally {
      await prisma.$disconnect();
    }
  });

  test('a row late in a UTC day counts on that day, not the next, under a non-UTC session', async () => {
    const { status, body } = await get('/trends?days=2');
    assert.equal(status, 200);
    assert.equal(body.from, dayKey(utcDay(1, 0, 0)));
    assert.equal(body.to, dayKey(utcDay(0, 0, 0)));
    assert.deepEqual(body.series, [
      { date: dayKey(utcDay(1, 0, 0)), alerts: 1, complaints: 1, readings: 2 },
      { date: dayKey(utcDay(0, 0, 0)), alerts: 0, complaints: 0, readings: 0 }
    ]);
  });

  test('the trends window starts at a UTC midnight, so older rows stay out', async () => {
    const two = await get('/trends?days=2');
    assert.equal(two.body.series.reduce((sum, row) => sum + row.readings, 0), 2);

    const three = await get('/trends?days=3');
    assert.equal(three.body.series.reduce((sum, row) => sum + row.readings, 0), 3);
    assert.equal(three.body.series[0].readings, 1);
    assert.equal(three.body.series[0].date, dayKey(utcDay(2, 0, 0)));

    const four = await get('/trends?days=4');
    assert.equal(four.body.series.reduce((sum, row) => sum + row.readings, 0), 4);
  });

  test('the readings window and averages are the same under any session time zone', async () => {
    const window = (await get(`/readings?days=2&assetId=${assetId}`)).body.assets[0];
    assert.equal(window.readingCount, 2);
    const all = (await get(`/readings?assetId=${assetId}`)).body.assets[0];
    assert.equal(all.readingCount, 4);
    assert.deepEqual(all.waterLevel, { avg: 50, min: 50, max: 50 });
  });

  test('every date column really is timestamptz for this suite, so the check is meaningful', async () => {
    const rows = await prisma.$queryRaw`
      SELECT table_name::text AS "table", column_name::text AS "column", data_type::text AS "type"
      FROM information_schema.columns
      WHERE table_schema = current_schema()::text
        AND (table_name, column_name) IN (('SensorReading', 'recordedAt'), ('Alert', 'createdAt'), ('Complaint', 'createdAt'))
    `;
    assert.equal(rows.length, 3);
    rows.forEach((row) => assert.equal(row.type, 'timestamp with time zone', `${row.table}.${row.column}`));
  });
}

if (databaseUrl) {
  runSuite(databaseUrl);
} else {
  test('analytics timezone tests need ANALYTICS_TEST_DATABASE_URL', { skip: true }, () => {});
}

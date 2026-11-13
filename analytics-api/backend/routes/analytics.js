const express = require('express');
const router = express.Router();
const prisma = require('../database');

const LOW_WATER_LEVEL = 20;
const DEFAULT_TREND_DAYS = 7;
const MAX_DAYS = 365;
const MAX_INT = 2147483647;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_ERROR = `days must be an integer between 1 and ${MAX_DAYS}`;
const ASSET_ID_ERROR = `assetId must be an integer between 1 and ${MAX_INT}`;
const SNAPSHOT = { isolationLevel: 'RepeatableRead' };
const TREND_SERIES = ['alerts', 'complaints', 'readings'];

const round = (value) => (value === null || value === undefined ? null : +Number(value).toFixed(2));

const total = (counts) => Object.values(counts).reduce((sum, count) => sum + count, 0);

const normalize = (value) => String(value === null || value === undefined ? '' : value).trim().toLowerCase();

function parseDays(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d{0,2}$/.test(value)) return NaN;
  const days = Number(value);
  return days <= MAX_DAYS ? days : NaN;
}

function parseAssetId(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) return NaN;
  const assetId = Number(value);
  return assetId <= MAX_INT ? assetId : NaN;
}

function countMap(rows, key, toLabel = (value) => value) {
  const groups = new Map();
  rows.forEach((row) => {
    const label = toLabel(String(row[key] === null || row[key] === undefined ? '' : row[key]).trim()) || 'Unspecified';
    const id = label.toLowerCase();
    const count = row._count._all;
    const group = groups.get(id) || { total: 0, label, labelCount: -1 };
    group.total += count;
    if (count > group.labelCount || (count === group.labelCount && label < group.label)) {
      group.label = label;
      group.labelCount = count;
    }
    groups.set(id, group);
  });
  return Object.fromEntries([...groups.values()].map((group) => [group.label, group.total]));
}

function countOf(counts, name) {
  return Object.entries(counts).reduce(
    (sum, [label, count]) => (normalize(label) === name ? sum + count : sum),
    0
  );
}

function fail(res, label, err) {
  console.error(`[analytics] ${label} failed:`, err);
  res.status(500).json({ error: 'Failed to compute analytics' });
}

router.get('/', (req, res) => {
  res.json({
    name: 'JalNavigator Analytics API',
    endpoints: [
      { method: 'GET', path: '/api/analytics/summary', description: 'Counts of assets, complaints and alerts grouped by type, status and category' },
      { method: 'GET', path: '/api/analytics/readings', description: 'Per-asset min, average and max telemetry (optional ?days= and ?assetId=)' },
      { method: 'GET', path: '/api/analytics/villages', description: 'Per-village asset health and open alert counts' },
      { method: 'GET', path: '/api/analytics/trends', description: 'Daily alerts, complaints and readings for the last N days (?days=, default 7)' }
    ]
  });
});

router.get('/summary', async (req, res) => {
  try {
    const [
      assetsByType,
      assetsByStatus,
      complaintsByStatus,
      complaintsByCategory,
      alertsBySeverity,
      alertsByStatus,
      totalReadings
    ] = await prisma.$transaction(
      [
        prisma.asset.groupBy({ by: ['type'], _count: { _all: true } }),
        prisma.asset.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.complaint.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.complaint.groupBy({ by: ['category'], _count: { _all: true } }),
        prisma.alert.groupBy({ by: ['severity'], _count: { _all: true } }),
        prisma.alert.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.sensorReading.count()
      ],
      SNAPSHOT
    );

    const assetTypes = countMap(assetsByType, 'type', (value) => value.toLowerCase());
    const complaintStatuses = countMap(complaintsByStatus, 'status');
    const alertStatuses = countMap(alertsByStatus, 'status');
    const totalComplaints = total(complaintStatuses);
    const resolved = countOf(complaintStatuses, 'resolved');

    res.json({
      assets: {
        total: total(assetTypes),
        byType: assetTypes,
        byStatus: countMap(assetsByStatus, 'status')
      },
      complaints: {
        total: totalComplaints,
        resolvedPercent: totalComplaints ? round((resolved / totalComplaints) * 100) : 0,
        byStatus: complaintStatuses,
        byCategory: countMap(complaintsByCategory, 'category')
      },
      alerts: {
        total: total(alertStatuses),
        bySeverity: countMap(alertsBySeverity, 'severity'),
        byStatus: alertStatuses
      },
      readings: { total: totalReadings }
    });
  } catch (err) {
    fail(res, 'summary', err);
  }
});

router.get('/readings', async (req, res) => {
  const days = parseDays(req.query.days, null);
  if (Number.isNaN(days)) {
    return res.status(400).json({ error: DAYS_ERROR });
  }
  const assetId = parseAssetId(req.query.assetId);
  if (Number.isNaN(assetId)) {
    return res.status(400).json({ error: ASSET_ID_ERROR });
  }

  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const sinceIso = days === null ? null : new Date(now.getTime() - days * DAY_MS).toISOString();
    const assetIdText = assetId === null ? null : String(assetId);

    const rows = await prisma.$queryRaw`
      SELECT
        a."id" AS "assetId",
        a."name" AS "name",
        a."type" AS "type",
        a."village" AS "village",
        a."status" AS "status",
        COUNT(*)::int AS "readingCount",
        (COUNT(*) FILTER (WHERE r."waterLevel" < ${String(LOW_WATER_LEVEL)}::text::float8))::int AS "lowLevelReadings",
        AVG(r."waterLevel")::float8 AS "waterLevelAvg",
        MIN(r."waterLevel")::float8 AS "waterLevelMin",
        MAX(r."waterLevel")::float8 AS "waterLevelMax",
        AVG(r."flowRate")::float8 AS "flowRateAvg",
        MIN(r."flowRate")::float8 AS "flowRateMin",
        MAX(r."flowRate")::float8 AS "flowRateMax",
        AVG(r."pressure")::float8 AS "pressureAvg",
        MIN(r."pressure")::float8 AS "pressureMin",
        MAX(r."pressure")::float8 AS "pressureMax"
      FROM "SensorReading" r
      JOIN "Asset" a ON a."id" = r."assetId"
      WHERE r."recordedAt" <= ${nowIso}::text::timestamp
        AND (${sinceIso}::text IS NULL OR r."recordedAt" >= ${sinceIso}::text::timestamp)
        AND (${assetIdText}::text IS NULL OR r."assetId" = ${assetIdText}::text::int)
      GROUP BY a."id"
      ORDER BY AVG(r."waterLevel") ASC, a."id" ASC
    `;

    const summarize = (row, field) => ({
      avg: round(row[`${field}Avg`]),
      min: row[`${field}Min`],
      max: row[`${field}Max`]
    });

    res.json({
      days,
      lowLevelThreshold: LOW_WATER_LEVEL,
      assets: rows.map((row) => ({
        assetId: row.assetId,
        name: row.name,
        type: row.type,
        village: row.village,
        status: row.status,
        readingCount: row.readingCount,
        lowLevelReadings: row.lowLevelReadings,
        waterLevel: summarize(row, 'waterLevel'),
        flowRate: summarize(row, 'flowRate'),
        pressure: summarize(row, 'pressure')
      }))
    });
  } catch (err) {
    fail(res, 'readings', err);
  }
});

router.get('/villages', async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      WITH keyed AS (
        SELECT
          a."id" AS "id",
          a."status" AS "status",
          NULLIF(BTRIM(a."village"), '') AS "name",
          COALESCE(NULLIF(LOWER(BTRIM(a."village")), ''), 'unassigned') AS "key"
        FROM "Asset" a
      )
      SELECT
        CASE WHEN k."key" = 'unassigned' THEN 'Unassigned' ELSE MIN(k."name") END AS "village",
        COUNT(*)::int AS "totalAssets",
        (COUNT(*) FILTER (WHERE LOWER(BTRIM(k."status")) = 'operational'))::int AS "operational",
        (COUNT(*) FILTER (WHERE LOWER(BTRIM(k."status")) = 'maintenance'))::int AS "maintenance",
        (COUNT(*) FILTER (WHERE LOWER(BTRIM(k."status")) = 'inactive'))::int AS "inactive",
        COALESCE(SUM(o."openCount"), 0)::int AS "openAlerts"
      FROM keyed k
      LEFT JOIN (
        SELECT "assetId", COUNT(*)::int AS "openCount"
        FROM "Alert"
        WHERE LOWER(BTRIM("status")) = 'open'
        GROUP BY "assetId"
      ) o ON o."assetId" = k."id"
      GROUP BY k."key"
      ORDER BY "openAlerts" DESC, "totalAssets" DESC, "village" ASC
    `;

    res.json(
      rows.map((row) => ({
        village: row.village,
        totalAssets: row.totalAssets,
        operational: row.operational,
        maintenance: row.maintenance,
        inactive: row.inactive,
        openAlerts: row.openAlerts
      }))
    );
  } catch (err) {
    fail(res, 'villages', err);
  }
});

router.get('/trends', async (req, res) => {
  const days = parseDays(req.query.days, DEFAULT_TREND_DAYS);
  if (Number.isNaN(days)) {
    return res.status(400).json({ error: DAYS_ERROR });
  }

  try {
    const now = new Date();
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    const start = new Date(today.getTime() - (days - 1) * DAY_MS);
    const startIso = start.toISOString();
    const nowIso = now.toISOString();

    const rows = await prisma.$queryRaw`
      SELECT 'alerts' AS "series", to_char("createdAt", 'YYYY-MM-DD') AS "day", COUNT(*)::int AS "count"
      FROM "Alert"
      WHERE "createdAt" >= ${startIso}::text::timestamp AND "createdAt" <= ${nowIso}::text::timestamp
      GROUP BY 2
      UNION ALL
      SELECT 'complaints', to_char("createdAt", 'YYYY-MM-DD'), COUNT(*)::int
      FROM "Complaint"
      WHERE "createdAt" >= ${startIso}::text::timestamp AND "createdAt" <= ${nowIso}::text::timestamp
      GROUP BY 2
      UNION ALL
      SELECT 'readings', to_char("recordedAt", 'YYYY-MM-DD'), COUNT(*)::int
      FROM "SensorReading"
      WHERE "recordedAt" >= ${startIso}::text::timestamp AND "recordedAt" <= ${nowIso}::text::timestamp
      GROUP BY 2
    `;

    const buckets = new Map();
    for (let i = 0; i < days; i += 1) {
      const date = new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10);
      buckets.set(date, { date, alerts: 0, complaints: 0, readings: 0 });
    }

    rows.forEach((row) => {
      const bucket = buckets.get(row.day);
      if (bucket && TREND_SERIES.includes(row.series)) {
        bucket[row.series] = Number(row.count);
      }
    });

    const series = [...buckets.values()];
    res.json({ days, from: series[0].date, to: series[series.length - 1].date, series });
  } catch (err) {
    fail(res, 'trends', err);
  }
});

module.exports = router;

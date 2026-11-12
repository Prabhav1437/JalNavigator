const express = require('express');
const router = express.Router();
const prisma = require('../database');

const LOW_WATER_LEVEL = 20;
const DEFAULT_TREND_DAYS = 7;
const MAX_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_ERROR = `days must be an integer between 1 and ${MAX_DAYS}`;

const round = (value) => (value === null || value === undefined ? null : +value.toFixed(2));

const total = (counts) => Object.values(counts).reduce((sum, count) => sum + count, 0);

function parseDays(value, fallback) {
  if (value === undefined) return fallback;
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= MAX_DAYS ? days : NaN;
}

function countMap(rows, key, normalize = (value) => value) {
  return rows.reduce((counts, row) => {
    const name = normalize(row[key]);
    counts[name] = (counts[name] || 0) + row._count._all;
    return counts;
  }, {});
}

const toDateKey = (date) => date.toISOString().slice(0, 10);

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
    ] = await Promise.all([
      prisma.asset.groupBy({ by: ['type'], _count: { _all: true } }),
      prisma.asset.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.complaint.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.complaint.groupBy({ by: ['category'], _count: { _all: true } }),
      prisma.alert.groupBy({ by: ['severity'], _count: { _all: true } }),
      prisma.alert.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.sensorReading.count()
    ]);

    const complaintStatusCounts = countMap(complaintsByStatus, 'status');
    const totalComplaints = total(complaintStatusCounts);
    const resolved = complaintStatusCounts.Resolved || 0;

    res.json({
      assets: {
        total: total(countMap(assetsByType, 'type')),
        byType: countMap(assetsByType, 'type', (value) => String(value).toLowerCase()),
        byStatus: countMap(assetsByStatus, 'status')
      },
      complaints: {
        total: totalComplaints,
        resolvedPercent: totalComplaints ? round((resolved / totalComplaints) * 100) : 0,
        byStatus: complaintStatusCounts,
        byCategory: countMap(complaintsByCategory, 'category')
      },
      alerts: {
        total: total(countMap(alertsByStatus, 'status')),
        bySeverity: countMap(alertsBySeverity, 'severity'),
        byStatus: countMap(alertsByStatus, 'status')
      },
      readings: { total: totalReadings }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/readings', async (req, res) => {
  try {
    const days = parseDays(req.query.days, null);
    if (Number.isNaN(days)) {
      return res.status(400).json({ error: DAYS_ERROR });
    }

    const where = {};
    if (days !== null) {
      where.recordedAt = { gte: new Date(Date.now() - days * DAY_MS) };
    }
    if (req.query.assetId !== undefined) {
      const assetId = Number(req.query.assetId);
      if (!Number.isInteger(assetId) || assetId < 1) {
        return res.status(400).json({ error: 'assetId must be a positive integer' });
      }
      where.assetId = assetId;
    }

    const [stats, lowCounts] = await Promise.all([
      prisma.sensorReading.groupBy({
        by: ['assetId'],
        where,
        _count: { _all: true },
        _avg: { waterLevel: true, flowRate: true, pressure: true },
        _min: { waterLevel: true, flowRate: true, pressure: true },
        _max: { waterLevel: true, flowRate: true, pressure: true }
      }),
      prisma.sensorReading.groupBy({
        by: ['assetId'],
        where: { ...where, waterLevel: { lt: LOW_WATER_LEVEL } },
        _count: { _all: true }
      })
    ]);

    const assets = await prisma.asset.findMany({
      where: { id: { in: stats.map((row) => row.assetId) } }
    });
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    const lowByAsset = new Map(lowCounts.map((row) => [row.assetId, row._count._all]));

    const summarize = (row, field) => ({
      avg: round(row._avg[field]),
      min: row._min[field],
      max: row._max[field]
    });

    const rows = stats
      .filter((row) => assetById.has(row.assetId))
      .map((row) => {
        const asset = assetById.get(row.assetId);
        return {
          assetId: asset.id,
          name: asset.name,
          type: asset.type,
          village: asset.village,
          status: asset.status,
          readingCount: row._count._all,
          lowLevelReadings: lowByAsset.get(row.assetId) || 0,
          waterLevel: summarize(row, 'waterLevel'),
          flowRate: summarize(row, 'flowRate'),
          pressure: summarize(row, 'pressure')
        };
      })
      .sort((a, b) => a.waterLevel.avg - b.waterLevel.avg);

    res.json({ days, lowLevelThreshold: LOW_WATER_LEVEL, assets: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/villages', async (req, res) => {
  try {
    const [assets, openAlerts] = await Promise.all([
      prisma.asset.findMany({ select: { id: true, village: true, status: true } }),
      prisma.alert.groupBy({
        by: ['assetId'],
        where: { status: 'Open' },
        _count: { _all: true }
      })
    ]);

    const openByAsset = new Map(openAlerts.map((row) => [row.assetId, row._count._all]));
    const villages = new Map();

    assets.forEach((asset) => {
      const name = (asset.village || '').trim();
      const key = name.toLowerCase();
      if (!villages.has(key)) {
        villages.set(key, {
          village: name || 'Unassigned',
          totalAssets: 0,
          operational: 0,
          maintenance: 0,
          inactive: 0,
          openAlerts: 0
        });
      }
      const entry = villages.get(key);
      entry.totalAssets += 1;
      entry.openAlerts += openByAsset.get(asset.id) || 0;
      switch ((asset.status || '').toLowerCase()) {
        case 'operational':
          entry.operational += 1;
          break;
        case 'maintenance':
          entry.maintenance += 1;
          break;
        case 'inactive':
          entry.inactive += 1;
          break;
        default:
          break;
      }
    });

    const rows = [...villages.values()].sort(
      (a, b) =>
        b.openAlerts - a.openAlerts ||
        b.totalAssets - a.totalAssets ||
        a.village.localeCompare(b.village)
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trends', async (req, res) => {
  try {
    const days = parseDays(req.query.days, DEFAULT_TREND_DAYS);
    if (Number.isNaN(days)) {
      return res.status(400).json({ error: DAYS_ERROR });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = new Date(today.getTime() - (days - 1) * DAY_MS);

    const [alerts, complaints, readings] = await Promise.all([
      prisma.alert.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
      prisma.complaint.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
      prisma.sensorReading.findMany({ where: { recordedAt: { gte: start } }, select: { recordedAt: true } })
    ]);

    const buckets = new Map();
    for (let i = 0; i < days; i += 1) {
      const date = toDateKey(new Date(start.getTime() + i * DAY_MS));
      buckets.set(date, { date, alerts: 0, complaints: 0, readings: 0 });
    }

    const tally = (rows, field, dateField) => {
      rows.forEach((row) => {
        const bucket = buckets.get(toDateKey(row[dateField]));
        if (bucket) bucket[field] += 1;
      });
    };

    tally(alerts, 'alerts', 'createdAt');
    tally(complaints, 'complaints', 'createdAt');
    tally(readings, 'readings', 'recordedAt');

    const series = [...buckets.values()];
    res.json({ days, from: series[0].date, to: series[series.length - 1].date, series });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

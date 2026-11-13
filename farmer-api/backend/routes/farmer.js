const express = require('express');
const router = express.Router();
const prisma = require('../database');
const messages = require('../utils/farmerMessages');
const { createRateLimiter } = require('../utils/rateLimiter');

const MAX_INT = 2147483647;
const CRITICAL_LEVEL = 20;
const LOW_LEVEL = 40;
const MEDIUM_LEVEL = 70;
const DEFAULT_RADIUS_KM = 10;
const MIN_RADIUS_KM = 0.1;
const MAX_RADIUS_KM = 100;
const DEFAULT_NEARBY = 5;
const MAX_NEARBY = 20;
const DEFAULT_VILLAGES = 100;
const MAX_VILLAGES = 500;
const NOTICE_LIMIT = 5;
const NAME_MAX = 80;
const DESCRIPTION_MIN = 5;
const DESCRIPTION_MAX = 500;
const SNAPSHOT = { isolationLevel: 'RepeatableRead' };
const WATER_POINT_TYPES = ['tank', 'borewell', 'pump'];
const CATEGORY_VALUES = messages.CATEGORIES.map((category) => category.value);
const DECIMAL = /^-?\d{1,3}(\.\d{1,10})?$/;
const RADIUS = /^\d{1,3}(\.\d{1,3})?$/;
const POSITIVE_INT = /^[1-9]\d{0,9}$/;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function readCount(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

const complaintLimiter = createRateLimiter({
  limit: readCount('FARMER_COMPLAINT_LIMIT', 20),
  windowMs: Math.max(readCount('FARMER_COMPLAINT_WINDOW_MINUTES', 15), 1) * 60 * 1000
});

const bad = (res, error) => res.status(400).json({ error });

function fail(res, label, err) {
  console.error(`[farmer] ${label} failed:`, err);
  res.status(500).json({ error: 'Something went wrong. Please try again later.' });
}

function parseLang(value) {
  if (value === undefined) return 'en';
  if (typeof value !== 'string') return null;
  const lang = value.trim().toLowerCase();
  return messages.LANGUAGES.includes(lang) ? lang : null;
}

function parseCount(value, fallback, max) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !POSITIVE_INT.test(value)) return NaN;
  const count = Number(value);
  return count <= max ? count : NaN;
}

function parseCoordinate(value, limit) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && Math.abs(value) <= limit ? value : NaN;
  }
  if (typeof value !== 'string' || !DECIMAL.test(value)) return NaN;
  const coordinate = Number(value);
  return Math.abs(coordinate) <= limit ? coordinate : NaN;
}

function parseRadius(value) {
  if (value === undefined) return DEFAULT_RADIUS_KM;
  if (typeof value !== 'string' || !RADIUS.test(value)) return NaN;
  const radius = Number(value);
  return radius >= MIN_RADIUS_KM && radius <= MAX_RADIUS_KM ? radius : NaN;
}

function cleanText(value) {
  return value.replace(CONTROL_CHARS, '').trim();
}

function parseName(value) {
  if (typeof value !== 'string') return null;
  const name = cleanText(value);
  return name.length >= 1 && name.length <= NAME_MAX ? name : null;
}

const levelBand = (percent) => {
  if (percent < CRITICAL_LEVEL) return 'critical';
  if (percent < LOW_LEVEL) return 'low';
  if (percent < MEDIUM_LEVEL) return 'medium';
  return 'good';
};

function describeLevel(percent, recordedAt, lang) {
  if (percent === null || percent === undefined) return null;
  const band = levelBand(percent);
  return {
    percent: Math.round(percent),
    band,
    text: messages.levelText(band, lang),
    updatedAt: recordedAt ? new Date(recordedAt).toISOString() : null
  };
}

const mapUrl = (latitude, longitude) =>
  `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;

function villageStatus(row) {
  if (row.openAlerts > 0 || row.operational === 0 || row.criticalLevel > 0) return 'problem';
  if (row.lowLevel > 0 || row.maintenance > 0) return 'low';
  return 'good';
}

function describeVillage(row, lang) {
  const status = villageStatus(row);
  return {
    village: row.village,
    status,
    message: messages.villageMessage(status, lang),
    totalWaterPoints: row.totalAssets,
    workingWaterPoints: row.operational
  };
}

function villageSummaries(key, prefix, limit, nowIso) {
  return prisma.$queryRaw`
    WITH assets AS (
      SELECT
        a."id" AS "id",
        a."type" AS "type",
        a."status" AS "status",
        BTRIM(a."village") AS "village",
        LOWER(BTRIM(a."village")) AS "key"
      FROM "Asset" a
      WHERE BTRIM(a."village") <> '' AND LOWER(BTRIM(a."village")) <> 'unassigned'
    ),
    latest AS (
      SELECT DISTINCT ON (r."assetId") r."assetId" AS "assetId", r."waterLevel" AS "waterLevel"
      FROM "SensorReading" r
      WHERE r."recordedAt" <= ${nowIso}::text::timestamp
      ORDER BY r."assetId", r."recordedAt" DESC, r."id" DESC
    ),
    open_alerts AS (
      SELECT "assetId", COUNT(*)::int AS "openCount"
      FROM "Alert"
      WHERE LOWER(BTRIM("status")) = 'open'
      GROUP BY "assetId"
    )
    SELECT
      MIN(a."village") AS "village",
      COUNT(*)::int AS "totalAssets",
      (COUNT(*) FILTER (WHERE LOWER(BTRIM(a."status")) = 'operational'))::int AS "operational",
      (COUNT(*) FILTER (WHERE LOWER(BTRIM(a."status")) = 'maintenance'))::int AS "maintenance",
      COALESCE(SUM(o."openCount"), 0)::int AS "openAlerts",
      (COUNT(*) FILTER (
        WHERE LOWER(BTRIM(a."status")) = 'operational'
          AND LOWER(BTRIM(a."type")) IN ('tank', 'borewell')
          AND l."waterLevel" < ${String(LOW_LEVEL)}::text::float8
      ))::int AS "lowLevel",
      (COUNT(*) FILTER (
        WHERE LOWER(BTRIM(a."status")) = 'operational'
          AND LOWER(BTRIM(a."type")) IN ('tank', 'borewell')
          AND l."waterLevel" < ${String(CRITICAL_LEVEL)}::text::float8
      ))::int AS "criticalLevel"
    FROM assets a
    LEFT JOIN latest l ON l."assetId" = a."id"
    LEFT JOIN open_alerts o ON o."assetId" = a."id"
    WHERE (${key}::text IS NULL OR a."key" = ${key}::text)
      AND (${prefix}::text IS NULL OR starts_with(a."key", ${prefix}::text))
    GROUP BY a."key"
    ORDER BY a."key" ASC
    LIMIT ${String(limit)}::text::int
  `;
}

function villageWaterPoints(key, nowIso) {
  return prisma.$queryRaw`
    SELECT
      a."id" AS "id",
      a."name" AS "name",
      a."type" AS "type",
      a."status" AS "status",
      a."latitude" AS "latitude",
      a."longitude" AS "longitude",
      l."waterLevel"::float8 AS "waterLevel",
      l."recordedAt" AS "recordedAt"
    FROM "Asset" a
    LEFT JOIN LATERAL (
      SELECT r."waterLevel", r."recordedAt"
      FROM "SensorReading" r
      WHERE r."assetId" = a."id" AND r."recordedAt" <= ${nowIso}::text::timestamp
      ORDER BY r."recordedAt" DESC, r."id" DESC
      LIMIT 1
    ) l ON TRUE
    WHERE LOWER(BTRIM(a."village")) = ${key}::text
    ORDER BY a."id" ASC
  `;
}

function villageNotices(key, nowIso) {
  return prisma.$queryRaw`
    SELECT
      al."id" AS "id",
      al."severity" AS "severity",
      al."createdAt" AS "createdAt",
      a."name" AS "assetName"
    FROM "Alert" al
    JOIN "Asset" a ON a."id" = al."assetId"
    WHERE LOWER(BTRIM(a."village")) = ${key}::text
      AND LOWER(BTRIM(al."status")) = 'open'
      AND al."createdAt" <= ${nowIso}::text::timestamp
    ORDER BY al."createdAt" DESC, al."id" DESC
    LIMIT ${String(NOTICE_LIMIT)}::text::int
  `;
}

function nearbyWaterPoints({ lat, lng, radiusKm, type, limit, nowIso }) {
  return prisma.$queryRaw`
    WITH p AS (
      SELECT
        ${String(lat)}::text::float8 AS "lat",
        ${String(lng)}::text::float8 AS "lng",
        ${String(radiusKm)}::text::float8 AS "radius"
    ),
    found AS (
      SELECT
        a."id" AS "id",
        a."name" AS "name",
        a."type" AS "type",
        a."village" AS "village",
        a."latitude" AS "latitude",
        a."longitude" AS "longitude",
        2 * 6371.0088 * ASIN(SQRT(LEAST(1.0,
          POWER(SIN(RADIANS(a."latitude" - p."lat") / 2), 2)
          + COS(RADIANS(p."lat")) * COS(RADIANS(a."latitude"))
          * POWER(SIN(RADIANS(a."longitude" - p."lng") / 2), 2)
        ))) AS "km"
      FROM "Asset" a
      CROSS JOIN p
      WHERE LOWER(BTRIM(a."status")) = 'operational'
        AND (
          (${type}::text IS NULL AND LOWER(BTRIM(a."type")) IN ('tank', 'borewell', 'pump'))
          OR LOWER(BTRIM(a."type")) = ${type}::text
        )
    )
    SELECT
      f."id" AS "id",
      f."name" AS "name",
      f."type" AS "type",
      f."village" AS "village",
      f."latitude" AS "latitude",
      f."longitude" AS "longitude",
      f."km"::float8 AS "km",
      l."waterLevel"::float8 AS "waterLevel",
      l."recordedAt" AS "recordedAt"
    FROM (
      SELECT * FROM found
      WHERE "km" <= (SELECT "radius" FROM p)
      ORDER BY "km" ASC, "id" ASC
      LIMIT ${String(limit)}::text::int
    ) f
    LEFT JOIN LATERAL (
      SELECT r."waterLevel", r."recordedAt"
      FROM "SensorReading" r
      WHERE r."assetId" = f."id" AND r."recordedAt" <= ${nowIso}::text::timestamp
      ORDER BY r."recordedAt" DESC, r."id" DESC
      LIMIT 1
    ) l ON TRUE
    ORDER BY f."km" ASC, f."id" ASC
  `;
}

router.get('/', (req, res) => {
  res.json({
    name: 'JalNavigator Farmer API',
    languages: messages.LANGUAGES,
    categories: messages.CATEGORIES,
    endpoints: [
      { method: 'GET', path: '/api/farmer/villages', description: 'Villages with a plain-language water supply status (optional ?q= name prefix, ?limit=)' },
      { method: 'GET', path: '/api/farmer/villages/:name', description: 'Water points, status and notices for one village' },
      { method: 'GET', path: '/api/farmer/nearby', description: 'Closest working water points to ?lat= and ?lng= (optional ?radiusKm=, ?type=, ?limit=)' },
      { method: 'POST', path: '/api/farmer/complaints', description: 'Register a complaint and receive a complaint number' },
      { method: 'GET', path: '/api/farmer/complaints/:id', description: 'Check the status of a complaint by its number' }
    ]
  });
});

router.get('/villages', async (req, res) => {
  const lang = parseLang(req.query.lang);
  if (!lang) return bad(res, 'lang must be one of: en, hi');
  const limit = parseCount(req.query.limit, DEFAULT_VILLAGES, MAX_VILLAGES);
  if (Number.isNaN(limit)) return bad(res, `limit must be an integer between 1 and ${MAX_VILLAGES}`);

  let prefix = null;
  if (req.query.q !== undefined) {
    const name = parseName(req.query.q);
    if (!name) return bad(res, `q must be text of 1 to ${NAME_MAX} characters`);
    prefix = name.toLowerCase();
  }

  try {
    const rows = await villageSummaries(null, prefix, limit, new Date().toISOString());
    res.json({
      lang,
      count: rows.length,
      villages: rows.map((row) => describeVillage(row, lang))
    });
  } catch (err) {
    fail(res, 'villages', err);
  }
});

router.get('/villages/:name', async (req, res) => {
  const lang = parseLang(req.query.lang);
  if (!lang) return bad(res, 'lang must be one of: en, hi');
  const name = parseName(req.params.name);
  if (!name) return bad(res, `village name must be text of 1 to ${NAME_MAX} characters`);

  try {
    const key = name.toLowerCase();
    const nowIso = new Date().toISOString();
    const [summaries, points, notices] = await prisma.$transaction(
      [villageSummaries(key, null, 1, nowIso), villageWaterPoints(key, nowIso), villageNotices(key, nowIso)],
      SNAPSHOT
    );

    if (summaries.length === 0) {
      return res.status(404).json({ error: 'Village not found. Check the spelling or search with /api/farmer/villages?q=' });
    }

    const summary = describeVillage(summaries[0], lang);
    res.json({
      lang,
      village: summary.village,
      status: summary.status,
      message: summary.message,
      totalWaterPoints: summaries[0].totalAssets,
      workingWaterPoints: summaries[0].operational,
      underMaintenance: summaries[0].maintenance,
      openProblems: summaries[0].openAlerts,
      waterPoints: points.map((point) => ({
        id: point.id,
        name: point.name,
        type: String(point.type).trim().toLowerCase(),
        typeText: messages.typeText(point.type, lang),
        working: String(point.status).trim().toLowerCase() === 'operational',
        waterLevel: describeLevel(point.waterLevel, point.recordedAt, lang),
        mapUrl: mapUrl(point.latitude, point.longitude)
      })),
      notices: notices.map((notice) => ({
        severity: notice.severity,
        since: new Date(notice.createdAt).toISOString(),
        text: messages.noticeText(notice.assetName, lang)
      })),
      readingsAreSimulated: true
    });
  } catch (err) {
    fail(res, 'village', err);
  }
});

router.get('/nearby', async (req, res) => {
  const lang = parseLang(req.query.lang);
  if (!lang) return bad(res, 'lang must be one of: en, hi');

  const lat = parseCoordinate(req.query.lat, 90);
  const lng = parseCoordinate(req.query.lng, 180);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return bad(res, 'lat (-90 to 90) and lng (-180 to 180) are required as plain decimal numbers');
  }
  const radiusKm = parseRadius(req.query.radiusKm);
  if (Number.isNaN(radiusKm)) {
    return bad(res, `radiusKm must be a number between ${MIN_RADIUS_KM} and ${MAX_RADIUS_KM}`);
  }
  const limit = parseCount(req.query.limit, DEFAULT_NEARBY, MAX_NEARBY);
  if (Number.isNaN(limit)) return bad(res, `limit must be an integer between 1 and ${MAX_NEARBY}`);

  let type = null;
  if (req.query.type !== undefined) {
    type = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : '';
    if (!WATER_POINT_TYPES.includes(type)) {
      return bad(res, `type must be one of: ${WATER_POINT_TYPES.join(', ')}`);
    }
  }

  try {
    const rows = await nearbyWaterPoints({ lat, lng, radiusKm, type, limit, nowIso: new Date().toISOString() });
    res.json({
      lang,
      query: { lat, lng, radiusKm, type, limit },
      count: rows.length,
      waterPoints: rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: String(row.type).trim().toLowerCase(),
        typeText: messages.typeText(row.type, lang),
        village: row.village,
        distanceKm: Math.round(row.km * 100) / 100,
        waterLevel: describeLevel(row.waterLevel, row.recordedAt, lang),
        latitude: row.latitude,
        longitude: row.longitude,
        mapUrl: mapUrl(row.latitude, row.longitude)
      })),
      readingsAreSimulated: true
    });
  } catch (err) {
    fail(res, 'nearby', err);
  }
});

router.post('/complaints', complaintLimiter, async (req, res) => {
  const lang = parseLang(req.query.lang);
  if (!lang) return bad(res, 'lang must be one of: en, hi');

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null;
  if (!body) return bad(res, 'Send the complaint as a JSON object');

  let category = 'Other';
  if (body.category !== undefined && body.category !== null && body.category !== '') {
    const match =
      typeof body.category === 'string'
        ? CATEGORY_VALUES.find((value) => value.toLowerCase() === body.category.trim().toLowerCase())
        : undefined;
    if (!match) return bad(res, `category must be one of: ${CATEGORY_VALUES.join(', ')}`);
    category = match;
  }

  if (typeof body.description !== 'string') {
    return bad(res, `description is required (${DESCRIPTION_MIN} to ${DESCRIPTION_MAX} characters)`);
  }
  const description = cleanText(body.description);
  const length = Array.from(description).length;
  if (length < DESCRIPTION_MIN || length > DESCRIPTION_MAX) {
    return bad(res, `description must be ${DESCRIPTION_MIN} to ${DESCRIPTION_MAX} characters`);
  }

  let village = null;
  if (body.village !== undefined && body.village !== null && body.village !== '') {
    village = parseName(body.village);
    if (!village) return bad(res, `village must be text of 1 to ${NAME_MAX} characters`);
  }

  const hasLatitude = body.latitude !== undefined && body.latitude !== null && body.latitude !== '';
  const hasLongitude = body.longitude !== undefined && body.longitude !== null && body.longitude !== '';
  if (hasLatitude !== hasLongitude) {
    return bad(res, 'Send both latitude and longitude, or neither');
  }
  let latitude = null;
  let longitude = null;
  if (hasLatitude) {
    latitude = parseCoordinate(body.latitude, 90);
    longitude = parseCoordinate(body.longitude, 180);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return bad(res, 'latitude (-90 to 90) and longitude (-180 to 180) must be plain decimal numbers');
    }
  }

  try {
    const complaint = await prisma.complaint.create({
      data: {
        title: village ? `${category} - ${village}` : category,
        category,
        description,
        latitude,
        longitude,
        status: 'Pending'
      }
    });
    res.status(201).json({
      lang,
      complaintId: complaint.id,
      status: complaint.status,
      message: messages.complaintReceived(lang),
      trackPath: `/api/farmer/complaints/${complaint.id}`
    });
  } catch (err) {
    fail(res, 'complaint', err);
  }
});

router.get('/complaints/:id', async (req, res) => {
  const lang = parseLang(req.query.lang);
  if (!lang) return bad(res, 'lang must be one of: en, hi');
  if (!POSITIVE_INT.test(req.params.id) || Number(req.params.id) > MAX_INT) {
    return bad(res, `complaint number must be an integer between 1 and ${MAX_INT}`);
  }

  try {
    const complaint = await prisma.complaint.findUnique({
      where: { id: Number(req.params.id) },
      select: { id: true, title: true, category: true, status: true, createdAt: true }
    });
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found. Check the complaint number.' });
    }
    const key = String(complaint.status).replace(/\s+/g, '').toLowerCase();
    res.json({
      lang,
      complaintId: complaint.id,
      title: complaint.title,
      category: complaint.category,
      status: complaint.status,
      message: messages.complaintMessage(key, lang),
      createdAt: new Date(complaint.createdAt).toISOString()
    });
  } catch (err) {
    fail(res, 'complaint lookup', err);
  }
});

module.exports = router;

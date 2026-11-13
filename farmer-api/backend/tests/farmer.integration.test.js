process.env.FARMER_COMPLAINT_LIMIT = '0';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const databaseUrl = process.env.FARMER_TEST_DATABASE_URL;
const ORIGIN_POINT = { lat: 26.8467, lng: 80.9462 };

const hoursAgo = (hours) => new Date(Date.now() - hours * HOUR_MS);
const daysAhead = (days) => new Date(Date.now() + days * DAY_MS);

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
}

const SEED_ASSETS = [
  { key: 'rampurTank', name: 'Rampur Tank', type: 'tank', village: 'Rampur', status: 'Operational', latitude: 26.8467, longitude: 80.9462 },
  { key: 'rampurWell', name: 'Rampur Borewell', type: 'borewell', village: ' rampur ', status: 'operational', latitude: 26.85, longitude: 80.95 },
  { key: 'rampurPump', name: 'Rampur Pump', type: 'pump', village: 'Rampur', status: 'Operational', latitude: 26.842, longitude: 80.94 },
  { key: 'sonpurTank', name: 'Sonpur Tank', type: 'tank', village: 'Sonpur', status: 'Operational', latitude: 26.9, longitude: 81.0 },
  { key: 'sonpurPipe', name: 'Sonpur Pipeline', type: 'pipeline', village: 'Sonpur', status: 'Operational', latitude: 26.91, longitude: 81.01 },
  { key: 'kheraTank', name: 'Khera Tank', type: 'tank', village: 'Khera', status: 'Operational', latitude: 26.8, longitude: 80.9 },
  { key: 'dhaniWell', name: 'Dhani Borewell', type: 'borewell', village: 'Dhani', status: 'Maintenance', latitude: 27.0, longitude: 80.8 },
  { key: 'dhaniOld', name: 'Dhani Old Well', type: 'borewell', village: 'Dhani', status: 'Inactive', latitude: 27.01, longitude: 80.81 },
  { key: 'tulsiTank', name: 'Tulsi Tank', type: 'tank', village: 'Tulsi', status: 'Operational', latitude: 26.87, longitude: 80.97 },
  { key: 'tulsiPump', name: 'Tulsi Pump', type: 'pump', village: 'Tulsi', status: 'Maintenance', latitude: 26.871, longitude: 80.971 },
  { key: 'gahraTank', name: 'Gahra Tank', type: 'tank', village: 'Gahra', status: 'Operational', latitude: 26.83, longitude: 80.93 },
  { key: 'nayiTank', name: 'Nayi Tank', type: 'tank', village: 'Nayi Basti', status: 'Operational', latitude: 26.85, longitude: 80.955 },
  { key: 'nayiWell', name: 'Nayi Borewell', type: 'borewell', village: 'nayi basti ', status: 'Operational', latitude: 26.851, longitude: 80.956 },
  { key: 'hindiTank', name: 'रामपुर टंकी', type: 'tank', village: 'रामपुर', status: 'Operational', latitude: 26.86, longitude: 80.96 },
  { key: 'blankTank', name: 'Blank Village Tank', type: 'tank', village: '', status: 'Operational', latitude: 26.847, longitude: 80.947 },
  { key: 'literalTank', name: 'Literal Unassigned Tank', type: 'tank', village: 'Unassigned', status: 'Operational', latitude: 26.848, longitude: 80.948 },
  { key: 'meridianEast', name: 'Meridian East Tank', type: 'tank', village: 'Meridian', status: 'Operational', latitude: 0, longitude: 179.99 },
  { key: 'meridianWest', name: 'Meridian West Pump', type: 'pump', village: 'Meridian', status: 'Operational', latitude: 0, longitude: -179.99 },
  { key: 'writerFirst', name: 'Writer Seed', type: 'tank', village: 'Writers', status: 'Operational', latitude: 1, longitude: 1 }
];

const EXPECTED_VILLAGE_STATUS = {
  rampur: 'good',
  sonpur: 'low',
  khera: 'problem',
  dhani: 'problem',
  tulsi: 'low',
  gahra: 'problem',
  'nayi basti': 'good',
  रामपुर: 'good',
  meridian: 'good',
  writers: 'good'
};

function runSuite(url) {
  const databaseName = new URL(url).pathname.replace('/', '');
  if (!/test/i.test(databaseName)) {
    throw new Error(
      `Refusing to run: the database name "${databaseName}" must contain "test" because this suite deletes every row.`
    );
  }
  process.env.DATABASE_URL = url;
  const prisma = require('../database');

  let server;
  let origin;
  const ids = {};

  const request = async (method, path, body) => {
    const res = await fetch(`${origin}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  };
  const get = (path) => request('GET', `/api/farmer${path}`);
  const post = (path, body) => request('POST', `/api/farmer${path}`, body);

  async function clearAll() {
    await prisma.alert.deleteMany();
    await prisma.sensorReading.deleteMany();
    await prisma.complaint.deleteMany();
    await prisma.asset.deleteMany();
  }

  before(async () => {
    await clearAll();
    for (const { key, ...data } of SEED_ASSETS) {
      ids[key] = (await prisma.asset.create({ data })).id;
    }

    const reading = (key, waterLevel, recordedAt) => ({
      assetId: ids[key],
      waterLevel,
      flowRate: 5,
      pressure: 2,
      recordedAt
    });
    await prisma.sensorReading.createMany({
      data: [
        reading('rampurTank', 30, hoursAgo(5)),
        reading('rampurTank', 85, hoursAgo(1)),
        reading('rampurTank', 5, daysAhead(2)),
        reading('rampurWell', 60, hoursAgo(2)),
        reading('sonpurTank', 30, hoursAgo(1)),
        reading('kheraTank', 50, hoursAgo(1)),
        reading('tulsiTank', 90, hoursAgo(1)),
        reading('gahraTank', 10, hoursAgo(1)),
        reading('nayiTank', 75, hoursAgo(1)),
        reading('hindiTank', 80, hoursAgo(1))
      ]
    });

    await prisma.alert.createMany({
      data: [
        { assetId: ids.kheraTank, message: 'Critical low water level', severity: 'Critical', status: 'open', createdAt: hoursAgo(1) },
        { assetId: ids.kheraTank, message: 'Critical low water level', severity: 'Critical', status: 'Resolved', createdAt: hoursAgo(48) }
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

  test('villages list derives each status from real alerts, levels and asset states', async () => {
    const { status, body } = await get('/villages');
    assert.equal(status, 200);
    const byName = new Map(body.villages.map((village) => [village.village.trim().toLowerCase(), village]));
    assert.equal(byName.size, body.count);
    assert.deepEqual(
      Object.fromEntries([...byName].map(([name, village]) => [name, village.status])),
      EXPECTED_VILLAGE_STATUS
    );
    assert.equal(byName.has('unassigned'), false);
    assert.equal(byName.has(''), false);
    assert.deepEqual(
      { total: byName.get('rampur').totalWaterPoints, working: byName.get('rampur').workingWaterPoints },
      { total: 3, working: 3 }
    );
    assert.equal(byName.get('nayi basti').totalWaterPoints, 2);
    assert.equal(byName.get('dhani').workingWaterPoints, 0);
    assert.equal(byName.get('tulsi').workingWaterPoints, 1);
  });

  test('villages list is stable, honours the limit and speaks Hindi', async () => {
    const first = (await get('/villages')).body;
    const second = (await get('/villages')).body;
    assert.deepEqual(first, second);
    const two = (await get('/villages?limit=2')).body;
    assert.deepEqual(two.villages, first.villages.slice(0, 2));
    const hindi = (await get('/villages?lang=hi')).body;
    const rampur = hindi.villages.find((village) => village.village.trim().toLowerCase() === 'rampur');
    assert.equal(rampur.message, 'पानी की आपूर्ति सामान्य है।');
  });

  test('villages search matches a case-insensitive prefix and treats wildcards as plain text', async () => {
    const lower = (await get('/villages?q=ra')).body;
    assert.deepEqual(lower.villages.map((village) => village.village.toLowerCase()), ['rampur']);
    const upper = (await get('/villages?q=RAMP')).body;
    assert.equal(upper.count, 1);
    const none = (await get('/villages?q=zzz')).body;
    assert.equal(none.count, 0);
    for (const q of ['%25', '_', '%25a', 'r%25']) {
      const wildcard = (await get(`/villages?q=${q}`)).body;
      assert.equal(wildcard.count, 0, q);
    }
    const hindi = (await get(`/villages?q=${encodeURIComponent('रा')}`)).body;
    assert.deepEqual(hindi.villages.map((village) => village.village), ['रामपुर']);
  });

  test('a village detail merges name variants and uses each asset’s newest past reading', async () => {
    const { status, body } = await get('/villages/RAMPUR');
    assert.equal(status, 200);
    assert.equal(body.village.toLowerCase(), 'rampur');
    assert.equal(body.status, 'good');
    assert.equal(body.totalWaterPoints, 3);
    assert.equal(body.workingWaterPoints, 3);
    assert.equal(body.openProblems, 0);
    assert.equal(body.readingsAreSimulated, true);
    assert.deepEqual(body.waterPoints.map((point) => point.id), [ids.rampurTank, ids.rampurWell, ids.rampurPump]);
    const tank = body.waterPoints[0];
    assert.equal(tank.waterLevel.percent, 85);
    assert.equal(tank.waterLevel.band, 'good');
    assert.equal(tank.working, true);
    assert.equal(tank.typeText, 'Water tank');
    assert.equal(body.waterPoints[1].waterLevel.percent, 60);
    assert.equal(body.waterPoints[1].waterLevel.band, 'medium');
    assert.equal(body.waterPoints[2].waterLevel, null);
    assert.deepEqual(body.notices, []);
    assert.match(tank.mapUrl, /^https:\/\/www\.openstreetmap\.org\/\?mlat=26\.8467&mlon=80\.9462#map=17\/26\.8467\/80\.9462$/);
  });

  test('a village with an open alert is a problem and lists only its open notices', async () => {
    const { body } = await get('/villages/khera');
    assert.equal(body.status, 'problem');
    assert.equal(body.openProblems, 1);
    assert.equal(body.notices.length, 1);
    assert.equal(body.notices[0].text, 'A problem has been reported at Khera Tank.');
    assert.equal(body.notices[0].severity, 'Critical');
    const hindi = (await get('/villages/khera?lang=hi')).body;
    assert.equal(hindi.notices[0].text, 'Khera Tank पर समस्या दर्ज की गई है।');
    assert.equal(hindi.message, 'इस गाँव की पानी की आपूर्ति में समस्या दर्ज की गई है।');
  });

  test('critical levels, missing working sources and maintenance each set the right status', async () => {
    const gahra = (await get('/villages/gahra')).body;
    assert.equal(gahra.status, 'problem');
    assert.equal(gahra.openProblems, 0);
    assert.equal(gahra.waterPoints[0].waterLevel.band, 'critical');

    const dhani = (await get('/villages/dhani')).body;
    assert.equal(dhani.status, 'problem');
    assert.deepEqual(dhani.waterPoints.map((point) => point.working), [false, false]);

    const tulsi = (await get('/villages/tulsi')).body;
    assert.equal(tulsi.status, 'low');
    assert.equal(tulsi.underMaintenance, 1);

    const sonpur = (await get('/villages/sonpur')).body;
    assert.equal(sonpur.status, 'low');
    assert.equal(sonpur.waterPoints.find((point) => point.type === 'pipeline').typeText, 'Pipeline');
  });

  test('village names with spaces and Devanagari text resolve, and unknown ones are 404', async () => {
    const spaced = await get(`/villages/${encodeURIComponent('NAYI BASTI')}`);
    assert.equal(spaced.status, 200);
    assert.equal(spaced.body.totalWaterPoints, 2);
    const hindi = await get(`/villages/${encodeURIComponent('रामपुर')}`);
    assert.equal(hindi.status, 200);
    assert.equal(hindi.body.waterPoints[0].name, 'रामपुर टंकी');
    for (const name of ['Nowhere', 'Unassigned', 'unassigned']) {
      const missing = await get(`/villages/${name}`);
      assert.equal(missing.status, 404, name);
    }
  });

  test('nearby returns working tanks, borewells and pumps ordered by true distance', async () => {
    const { status, body } = await get(`/nearby?lat=${ORIGIN_POINT.lat}&lng=${ORIGIN_POINT.lng}&radiusKm=100&limit=20`);
    assert.equal(status, 200);
    const expected = SEED_ASSETS.filter(
      (asset) => asset.status.toLowerCase() === 'operational' && ['tank', 'borewell', 'pump'].includes(asset.type)
    )
      .map((asset) => ({ ...asset, km: haversineKm(ORIGIN_POINT.lat, ORIGIN_POINT.lng, asset.latitude, asset.longitude) }))
      .filter((asset) => asset.km <= 100)
      .sort((a, b) => a.km - b.km);

    assert.deepEqual(body.waterPoints.map((point) => point.name), expected.map((asset) => asset.name));
    body.waterPoints.forEach((point, index) => {
      assert.ok(Math.abs(point.distanceKm - expected[index].km) <= 0.011, point.name);
    });
    const names = body.waterPoints.map((point) => point.name);
    assert.equal(names.includes('Dhani Borewell'), false);
    assert.equal(names.includes('Tulsi Pump'), false);
    assert.equal(names.includes('Sonpur Pipeline'), false);
    assert.equal(names.includes('Dhani Old Well'), false);
    assert.equal(body.waterPoints[0].name, 'Rampur Tank');
    assert.equal(body.waterPoints[0].distanceKm, 0);
  });

  test('nearby honours radius, limit and type and includes assets with no village', async () => {
    const close = (await get(`/nearby?lat=${ORIGIN_POINT.lat}&lng=${ORIGIN_POINT.lng}&radiusKm=1`)).body;
    const closeNames = close.waterPoints.map((point) => point.name);
    assert.deepEqual(closeNames, ['Rampur Tank', 'Blank Village Tank', 'Literal Unassigned Tank', 'Rampur Borewell', 'Rampur Pump']);
    assert.equal(close.waterPoints[1].village, '');
    close.waterPoints.forEach((point) => assert.ok(point.distanceKm <= 1));

    const two = (await get(`/nearby?lat=${ORIGIN_POINT.lat}&lng=${ORIGIN_POINT.lng}&radiusKm=100&limit=2`)).body;
    assert.deepEqual(two.waterPoints.map((point) => point.name), ['Rampur Tank', 'Blank Village Tank']);

    const pumps = (await get(`/nearby?lat=${ORIGIN_POINT.lat}&lng=${ORIGIN_POINT.lng}&radiusKm=100&type=PUMP`)).body;
    assert.ok(pumps.waterPoints.length >= 1);
    pumps.waterPoints.forEach((point) => assert.equal(point.type, 'pump'));
    assert.equal(pumps.query.type, 'pump');

    const defaultRadius = (await get(`/nearby?lat=${ORIGIN_POINT.lat}&lng=${ORIGIN_POINT.lng}&limit=20`)).body;
    assert.equal(defaultRadius.query.radiusKm, 10);
    defaultRadius.waterPoints.forEach((point) => assert.ok(point.distanceKm <= 10));
  });

  test('nearby shows the newest past reading and hides future ones', async () => {
    const { body } = await get(`/nearby?lat=${ORIGIN_POINT.lat}&lng=${ORIGIN_POINT.lng}&radiusKm=1`);
    const tank = body.waterPoints.find((point) => point.name === 'Rampur Tank');
    assert.equal(tank.waterLevel.percent, 85);
    const pump = body.waterPoints.find((point) => point.name === 'Rampur Pump');
    assert.equal(pump.waterLevel, null);
  });

  test('nearby is correct across the antimeridian and with nothing in range', async () => {
    const { body } = await get('/nearby?lat=0&lng=179.999&radiusKm=10&limit=5');
    const expected = [
      ['Meridian East Tank', haversineKm(0, 179.999, 0, 179.99)],
      ['Meridian West Pump', haversineKm(0, 179.999, 0, -179.99)]
    ];
    assert.deepEqual(body.waterPoints.map((point) => point.name), expected.map(([name]) => name));
    body.waterPoints.forEach((point, index) => {
      assert.ok(Math.abs(point.distanceKm - expected[index][1]) <= 0.011);
    });
    const empty = await get('/nearby?lat=-45&lng=-100&radiusKm=100');
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.waterPoints, []);
    const poles = await get('/nearby?lat=90&lng=0&radiusKm=100');
    assert.equal(poles.status, 200);
  });

  test('a complaint filed by a farmer appears in the existing admin routes and dashboard', async () => {
    const before = (await request('GET', '/api/dashboard')).body;
    const created = await post('/complaints', {
      category: 'dirty water',
      description: 'Water from the hand pump is brown.',
      village: 'Rampur',
      latitude: 26.8467,
      longitude: 80.9462
    });
    assert.equal(created.status, 201);
    const id = created.body.complaintId;
    assert.equal(created.body.status, 'Pending');
    assert.equal(created.body.trackPath, `/api/farmer/complaints/${id}`);

    const row = await prisma.complaint.findUnique({ where: { id } });
    assert.equal(row.title, 'Dirty water - Rampur');
    assert.equal(row.category, 'Dirty water');
    assert.equal(row.description, 'Water from the hand pump is brown.');
    assert.equal(row.status, 'Pending');
    assert.equal(row.latitude, 26.8467);
    assert.equal(row.longitude, 80.9462);

    const adminList = (await request('GET', '/api/complaints')).body;
    assert.ok(adminList.some((item) => item.id === id && item.title === 'Dirty water - Rampur'));
    const pendingList = (await request('GET', '/api/complaints?status=Pending')).body;
    assert.ok(pendingList.some((item) => item.id === id));

    const after = (await request('GET', '/api/dashboard')).body;
    assert.equal(after.totalComplaints, before.totalComplaints + 1);
    assert.equal(after.pendingComplaints, before.pendingComplaints + 1);
    assert.ok(after.recentComplaints.some((item) => item.id === id));
  });

  test('the full flow: farmer files, an officer updates the status, the farmer sees it', async () => {
    const { body: created } = await post('/complaints', { category: 'No water supply', description: 'No water since two days' });
    const id = created.complaintId;

    const pending = (await get(`/complaints/${id}`)).body;
    assert.equal(pending.status, 'Pending');
    assert.equal(pending.message, 'Your complaint has been received and is waiting for review.');

    const progress = await request('PUT', `/api/complaints/${id}`, { status: 'In Progress' });
    assert.equal(progress.status, 200);
    const inProgress = (await get(`/complaints/${id}`)).body;
    assert.equal(inProgress.status, 'In Progress');
    assert.equal(inProgress.message, 'Officials are working on your complaint.');
    assert.equal((await get(`/complaints/${id}?lang=hi`)).body.message, 'आपकी शिकायत पर काम चल रहा है।');

    await request('PUT', `/api/complaints/${id}`, { status: 'Resolved' });
    const resolved = (await get(`/complaints/${id}`)).body;
    assert.equal(resolved.status, 'Resolved');
    assert.equal(resolved.message, 'Your complaint has been resolved.');

    await request('PUT', `/api/complaints/${id}`, { status: 'Escalated' });
    const escalated = (await get(`/complaints/${id}`)).body;
    assert.equal(escalated.status, 'Escalated');
    assert.equal(escalated.message, 'Officials have updated the status of your complaint.');
  });

  test('a complaint tracking response exposes nothing but safe fields', async () => {
    const { body: created } = await post('/complaints', {
      description: 'My name is Ramesh and my phone number is 9999999999',
      latitude: 26.1,
      longitude: 80.1
    });
    const { status, body } = await get(`/complaints/${created.complaintId}`);
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(body).sort(), ['category', 'complaintId', 'createdAt', 'lang', 'message', 'status', 'title']);
    assert.ok(!JSON.stringify(body).includes('9999999999'));
  });

  test('complaints filed through the old admin route can also be tracked by number', async () => {
    const legacy = await request('POST', '/api/complaints', { title: 'Low water pressure in Ward 3', category: 'Low water pressure', description: 'Weak flow since morning' });
    assert.equal(legacy.status, 201);
    const { status, body } = await get(`/complaints/${legacy.body.id}`);
    assert.equal(status, 200);
    assert.equal(body.title, 'Low water pressure in Ward 3');
    assert.equal(body.category, 'Low water pressure');
    assert.equal(body.status, 'Pending');
  });

  test('null bytes, Hindi text and a 0,0 location are stored correctly instead of failing', async () => {
    const nul = await post('/complaints', { description: 'Tap\u0000 is broken', village: 'Ram\u0000pur' });
    assert.equal(nul.status, 201);
    const nulRow = await prisma.complaint.findUnique({ where: { id: nul.body.complaintId } });
    assert.equal(nulRow.description, 'Tap is broken');
    assert.equal(nulRow.title, 'Other - Rampur');

    const hindi = await post('/complaints', { category: 'Dirty water', description: 'हैंडपंप से गंदा पानी आ रहा है', village: 'रामपुर' });
    assert.equal(hindi.status, 201);
    const hindiRow = await prisma.complaint.findUnique({ where: { id: hindi.body.complaintId } });
    assert.equal(hindiRow.description, 'हैंडपंप से गंदा पानी आ रहा है');
    assert.equal(hindiRow.title, 'Dirty water - रामपुर');

    const zero = await post('/complaints', { description: 'Tap is broken', latitude: 0, longitude: 0 });
    const zeroRow = await prisma.complaint.findUnique({ where: { id: zero.body.complaintId } });
    assert.equal(zeroRow.latitude, 0);
    assert.equal(zeroRow.longitude, 0);
  });

  test('invalid complaints leave the table untouched', async () => {
    const countBefore = await prisma.complaint.count();
    const payloads = [{}, { description: 'abc' }, { description: 'Tap is broken', category: 'Sewage' }, { description: 'Tap is broken', latitude: 26 }];
    for (const payload of payloads) {
      assert.equal((await post('/complaints', payload)).status, 400);
    }
    assert.equal(await prisma.complaint.count(), countBefore);
  });

  test('many complaints at once all get their own number', async () => {
    const responses = await Promise.all(
      Array.from({ length: 25 }, (_, index) => post('/complaints', { description: `Concurrent complaint number ${index}` }))
    );
    responses.forEach((response) => assert.equal(response.status, 201));
    const numbers = responses.map((response) => response.body.complaintId);
    assert.equal(new Set(numbers).size, 25);
    const rows = await prisma.complaint.findMany({ where: { id: { in: numbers } } });
    assert.equal(rows.length, 25);
  });

  test('unknown complaint numbers are 404 and oversized ones are 400, never 500', async () => {
    assert.equal((await get('/complaints/999999')).status, 404);
    assert.equal((await get('/complaints/2147483647')).status, 404);
    assert.equal((await get('/complaints/2147483648')).status, 400);
    assert.equal((await get('/complaints/abc')).status, 400);
  });

  test('a village detail never disagrees with itself while rows are being written', async () => {
    const writes = 30;
    let writing = true;

    const writer = (async () => {
      for (let i = 0; i < writes; i += 1) {
        await prisma.asset.create({
          data: {
            name: `Writer ${i}`,
            type: 'tank',
            village: 'Writers',
            status: 'Operational',
            latitude: 1,
            longitude: 1,
            alerts: { create: { message: 'Critical low water level', severity: 'Critical', status: 'Open' } }
          }
        });
      }
      writing = false;
    })();

    const observed = [];
    const reader = async () => {
      while (writing) {
        const { status, body } = await get('/villages/Writers');
        assert.equal(status, 200);
        observed.push(body);
      }
    };
    await Promise.all([writer, reader(), reader(), reader()]);

    assert.ok(observed.length >= 5);
    observed.forEach((body) => {
      assert.equal(body.totalWaterPoints, body.waterPoints.length);
      assert.equal(Math.min(body.openProblems, 5), body.notices.length);
    });
    assert.ok(observed.some((body) => body.totalWaterPoints > 1 && body.totalWaterPoints < writes + 1));
    const final = (await get('/villages/Writers')).body;
    assert.equal(final.totalWaterPoints, writes + 1);
    assert.equal(final.openProblems, writes);
    assert.equal(final.status, 'problem');
  });
}

if (databaseUrl) {
  runSuite(databaseUrl);
} else {
  test('farmer integration tests need FARMER_TEST_DATABASE_URL', { skip: true }, () => {});
}

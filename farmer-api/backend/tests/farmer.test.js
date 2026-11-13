process.env.FARMER_COMPLAINT_LIMIT = '0';

const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const state = {
  summaries: [],
  points: [],
  notices: [],
  nearby: [],
  complaint: null,
  failQueries: null,
  failCreate: null,
  failLookup: null
};
const queryCalls = [];
const transactionCalls = [];
const created = [];
const lookups = [];

function rowsFor(sql) {
  if (sql.includes('WITH assets AS')) return state.summaries;
  if (sql.includes('ASIN(SQRT')) return state.nearby;
  if (sql.includes('JOIN "Asset" a ON a."id" = al."assetId"')) return state.notices;
  if (sql.includes('ORDER BY a."id" ASC')) return state.points;
  return [];
}

const databasePath = require.resolve('../database');
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: {
    $queryRaw: (strings, ...values) => {
      const sql = strings.join('?');
      queryCalls.push({ sql, values });
      if (state.failQueries) return Promise.reject(state.failQueries);
      return Promise.resolve(rowsFor(sql));
    },
    $transaction: (operations, options) => {
      transactionCalls.push(options);
      return Promise.all(operations);
    },
    complaint: {
      create: ({ data }) => {
        if (state.failCreate) return Promise.reject(state.failCreate);
        created.push(data);
        return Promise.resolve({ id: 100 + created.length, createdAt: new Date(), ...data });
      },
      findUnique: (args) => {
        lookups.push(args);
        if (state.failLookup) return Promise.reject(state.failLookup);
        return Promise.resolve(state.complaint);
      }
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
  state.summaries = [];
  state.points = [];
  state.notices = [];
  state.nearby = [];
  state.complaint = null;
  state.failQueries = null;
  state.failCreate = null;
  state.failLookup = null;
  queryCalls.length = 0;
  transactionCalls.length = 0;
  created.length = 0;
  lookups.length = 0;
});

const get = async (path) => {
  const res = await fetch(`${origin}/api/farmer${path}`);
  return { status: res.status, body: await res.json() };
};

const post = async (path, body) => {
  const res = await fetch(`${origin}/api/farmer${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
};

const summary = (overrides = {}) => ({
  village: 'Rampur',
  totalAssets: 3,
  operational: 3,
  maintenance: 0,
  openAlerts: 0,
  lowLevel: 0,
  criticalLevel: 0,
  ...overrides
});

test('the directory lists the exact endpoints, languages and categories', async () => {
  const { status, body } = await get('');
  assert.equal(status, 200);
  assert.equal(body.name, 'JalNavigator Farmer API');
  assert.deepEqual(body.languages, ['en', 'hi']);
  assert.deepEqual(
    body.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`),
    [
      'GET /api/farmer/villages',
      'GET /api/farmer/villages/:name',
      'GET /api/farmer/nearby',
      'POST /api/farmer/complaints',
      'GET /api/farmer/complaints/:id'
    ]
  );
  assert.deepEqual(
    body.categories.map((category) => category.value),
    ['Pipeline leakage', 'No water supply', 'Dirty water', 'Low water pressure', 'Damaged infrastructure', 'Other']
  );
  body.categories.forEach((category) => {
    assert.ok(category.label.en && category.label.hi);
  });
});

test('the farmer router is mounted next to the existing routes', async () => {
  const api = await fetch(`${origin}/api`);
  assert.equal(api.status, 200);
  assert.equal((await api.json()).name, 'JalNavigator REST API');
  const farmer = await fetch(`${origin}/api/farmer`);
  assert.equal(farmer.status, 200);
});

test('villages derive good, low and problem from the counts', async () => {
  state.summaries = [
    summary({ village: 'Aam' }),
    summary({ village: 'Bela', lowLevel: 1 }),
    summary({ village: 'Chak', maintenance: 1 }),
    summary({ village: 'Dera', openAlerts: 2 }),
    summary({ village: 'Ekta', operational: 0, maintenance: 3 }),
    summary({ village: 'Fatehpur', criticalLevel: 1, lowLevel: 1 })
  ];
  const { status, body } = await get('/villages');
  assert.equal(status, 200);
  assert.equal(body.count, 6);
  assert.deepEqual(
    body.villages.map((village) => [village.village, village.status]),
    [['Aam', 'good'], ['Bela', 'low'], ['Chak', 'low'], ['Dera', 'problem'], ['Ekta', 'problem'], ['Fatehpur', 'problem']]
  );
  assert.deepEqual(body.villages[0], {
    village: 'Aam',
    status: 'good',
    message: 'Water supply is normal.',
    totalWaterPoints: 3,
    workingWaterPoints: 3
  });
});

test('villages answer in Hindi when asked', async () => {
  state.summaries = [summary()];
  const { body } = await get('/villages?lang=HI');
  assert.equal(body.lang, 'hi');
  assert.equal(body.villages[0].message, 'पानी की आपूर्ति सामान्य है।');
});

test('villages pass the search prefix and limit to the database as lowercase text', async () => {
  await get('/villages?q=%20RaM%20&limit=7');
  const { values } = queryCalls[0];
  assert.deepEqual(values.slice(3), [null, null, 'ram', 'ram', '7']);
  await get('/villages');
  assert.deepEqual(queryCalls[1].values.slice(3), [null, null, null, null, '100']);
});

test('villages reject every invalid query value without touching the database', async () => {
  const bad = [
    '?lang=fr',
    '?lang=',
    '?limit=0',
    '?limit=501',
    '?limit=abc',
    '?limit=1.5',
    '?limit=-1',
    '?limit=1e2',
    '?limit=5&limit=6',
    '?q=',
    `?q=${'a'.repeat(81)}`,
    '?q=a&q=b',
    '?q=%00'
  ];
  for (const query of bad) {
    const { status, body } = await get(`/villages${query}`);
    assert.equal(status, 400, query);
    assert.ok(body.error, query);
  }
  assert.equal(queryCalls.length, 0);
});

test('a village detail is read in one repeatable-read snapshot and keyed by lowercase name', async () => {
  state.summaries = [summary({ operational: 2, maintenance: 1, openAlerts: 1, lowLevel: 1, criticalLevel: 1 })];
  state.points = [
    {
      id: 1,
      name: 'Rampur Tank',
      type: 'Tank',
      status: 'Operational',
      latitude: 26.8,
      longitude: 80.9,
      waterLevel: 12.4,
      recordedAt: new Date('2026-11-14T06:00:00.000Z')
    },
    { id: 2, name: 'Old Well', type: 'borewell', status: 'Maintenance', latitude: 26.81, longitude: 80.91, waterLevel: null, recordedAt: null }
  ];
  state.notices = [{ id: 9, severity: 'Critical', createdAt: new Date('2026-11-14T05:00:00.000Z'), assetName: 'Rampur Tank' }];

  const { status, body } = await get('/villages/%20RAMPUR%20');
  assert.equal(status, 200);
  assert.deepEqual(transactionCalls, [{ isolationLevel: 'RepeatableRead' }]);
  assert.equal(queryCalls.length, 3);
  assert.deepEqual(queryCalls[0].values.slice(3, 7), ['rampur', 'rampur', null, null]);
  assert.equal(body.village, 'Rampur');
  assert.equal(body.status, 'problem');
  assert.equal(body.totalWaterPoints, 3);
  assert.equal(body.workingWaterPoints, 2);
  assert.equal(body.underMaintenance, 1);
  assert.equal(body.openProblems, 1);
  assert.equal(body.readingsAreSimulated, true);
  assert.deepEqual(body.waterPoints[0], {
    id: 1,
    name: 'Rampur Tank',
    type: 'tank',
    typeText: 'Water tank',
    working: true,
    waterLevel: { percent: 12, band: 'critical', text: 'Critically low', updatedAt: '2026-11-14T06:00:00.000Z' },
    mapUrl: 'https://www.openstreetmap.org/?mlat=26.8&mlon=80.9#map=17/26.8/80.9'
  });
  assert.equal(body.waterPoints[1].working, false);
  assert.equal(body.waterPoints[1].waterLevel, null);
  assert.deepEqual(body.notices, [
    { severity: 'Critical', since: '2026-11-14T05:00:00.000Z', text: 'A problem has been reported at Rampur Tank.' }
  ]);
});

test('a village detail speaks Hindi and keeps asset names intact', async () => {
  state.summaries = [summary()];
  state.points = [{ id: 1, name: 'Rampur Tank', type: 'pump', status: 'Operational', latitude: 1, longitude: 2, waterLevel: 75, recordedAt: new Date() }];
  state.notices = [{ id: 1, severity: 'Critical', createdAt: new Date(), assetName: 'Rampur Tank' }];
  const { body } = await get('/villages/Rampur?lang=hi');
  assert.equal(body.message, 'पानी की आपूर्ति सामान्य है।');
  assert.equal(body.waterPoints[0].typeText, 'पंप');
  assert.equal(body.waterPoints[0].waterLevel.band, 'good');
  assert.equal(body.waterPoints[0].waterLevel.text, 'अच्छा');
  assert.equal(body.notices[0].text, 'Rampur Tank पर समस्या दर्ज की गई है।');
});

test('an unknown village is a 404 and a bad name or language is a 400', async () => {
  const missing = await get('/villages/Nowhere');
  assert.equal(missing.status, 404);
  assert.ok(missing.body.error);
  const tooLong = await get(`/villages/${'a'.repeat(81)}`);
  assert.equal(tooLong.status, 400);
  const control = await get('/villages/a%00b');
  assert.equal(control.status, 404);
  assert.equal(queryCalls[queryCalls.length - 3].values[3], 'ab');
  const language = await get('/villages/Rampur?lang=fr');
  assert.equal(language.status, 400);
});

test('water level bands follow the 20, 40 and 70 percent thresholds', async () => {
  state.summaries = [summary()];
  const levels = [[19.4, 'critical'], [20, 'low'], [39.9, 'low'], [40, 'medium'], [69.9, 'medium'], [70, 'good'], [100, 'good']];
  state.points = levels.map(([waterLevel], index) => ({
    id: index + 1,
    name: `Tank ${index + 1}`,
    type: 'tank',
    status: 'Operational',
    latitude: 1,
    longitude: 1,
    waterLevel,
    recordedAt: new Date()
  }));
  const { body } = await get('/villages/Rampur');
  assert.deepEqual(
    body.waterPoints.map((point) => point.waterLevel.band),
    levels.map(([, band]) => band)
  );
});

test('nearby passes parsed parameters to the database in order', async () => {
  await get('/nearby?lat=26.845&lng=80.952');
  const { values } = queryCalls[0];
  assert.deepEqual(values.slice(0, 6), ['26.845', '80.952', '10', null, null, '5']);
  assert.ok(Math.abs(Date.parse(values[6]) - Date.now()) < 5000);

  await get('/nearby?lat=-12.5&lng=-0.25&radiusKm=2.5&type=BOREWELL&limit=3');
  const second = queryCalls[1].values;
  assert.deepEqual(second.slice(0, 6), ['-12.5', '-0.25', '2.5', 'borewell', 'borewell', '3']);
});

test('nearby shapes rows with rounded distance, level bands and map links', async () => {
  state.nearby = [
    { id: 4, name: 'Sonpur Borewell', type: 'borewell', village: 'Sonpur', latitude: 26.85, longitude: 80.95, km: 1.23456, waterLevel: 55.5, recordedAt: new Date('2026-11-14T01:00:00.000Z') },
    { id: 5, name: 'New Pump', type: 'pump', village: 'Sonpur', latitude: 26.9, longitude: 80.9, km: 6, waterLevel: null, recordedAt: null }
  ];
  const { status, body } = await get('/nearby?lat=26.845&lng=80.952&limit=2');
  assert.equal(status, 200);
  assert.deepEqual(body.query, { lat: 26.845, lng: 80.952, radiusKm: 10, type: null, limit: 2 });
  assert.equal(body.count, 2);
  assert.equal(body.readingsAreSimulated, true);
  assert.deepEqual(body.waterPoints[0], {
    id: 4,
    name: 'Sonpur Borewell',
    type: 'borewell',
    typeText: 'Borewell',
    village: 'Sonpur',
    distanceKm: 1.23,
    waterLevel: { percent: 56, band: 'medium', text: 'Medium', updatedAt: '2026-11-14T01:00:00.000Z' },
    latitude: 26.85,
    longitude: 80.95,
    mapUrl: 'https://www.openstreetmap.org/?mlat=26.85&mlon=80.95#map=17/26.85/80.95'
  });
  assert.equal(body.waterPoints[1].waterLevel, null);
  assert.equal(body.waterPoints[1].distanceKm, 6);
});

test('nearby accepts boundary coordinates and rejects everything else', async () => {
  for (const query of ['?lat=90&lng=180', '?lat=-90&lng=-180', '?lat=0&lng=0', '?lat=26&lng=80&radiusKm=0.1', '?lat=26&lng=80&radiusKm=100', '?lat=26&lng=80&limit=20']) {
    const { status } = await get(`/nearby${query}`);
    assert.equal(status, 200, query);
  }
  const callsBefore = queryCalls.length;
  const bad = [
    '',
    '?lat=26',
    '?lng=80',
    '?lat=90.0001&lng=80',
    '?lat=26&lng=180.1',
    '?lat=-91&lng=0',
    '?lat=abc&lng=80',
    '?lat=1e1&lng=80',
    '?lat=26&lng=80&lat=27',
    '?lat=%2026&lng=80',
    '?lat=26&lng=80&radiusKm=0',
    '?lat=26&lng=80&radiusKm=0.05',
    '?lat=26&lng=80&radiusKm=100.1',
    '?lat=26&lng=80&radiusKm=abc',
    '?lat=26&lng=80&limit=0',
    '?lat=26&lng=80&limit=21',
    '?lat=26&lng=80&limit=x',
    '?lat=26&lng=80&type=pipeline',
    '?lat=26&lng=80&type=river',
    '?lat=26&lng=80&type=',
    '?lat=26&lng=80&type=tank&type=pump',
    '?lat=26&lng=80&lang=fr'
  ];
  for (const query of bad) {
    const { status, body } = await get(`/nearby${query}`);
    assert.equal(status, 400, query);
    assert.ok(body.error, query);
  }
  assert.equal(queryCalls.length, callsBefore);
});

test('a complaint is stored through the existing Complaint model with safe defaults', async () => {
  const { status, body } = await post('/complaints', {
    category: ' dirty WATER ',
    description: '  Water from the hand pump is brown and smells bad.  ',
    village: ' Rampur ',
    latitude: 26.845,
    longitude: '80.952'
  });
  assert.equal(status, 201);
  assert.equal(body.complaintId, 101);
  assert.equal(body.status, 'Pending');
  assert.equal(body.trackPath, '/api/farmer/complaints/101');
  assert.match(body.message, /registered/);
  assert.deepEqual(created, [
    {
      title: 'Dirty water - Rampur',
      category: 'Dirty water',
      description: 'Water from the hand pump is brown and smells bad.',
      latitude: 26.845,
      longitude: 80.952,
      status: 'Pending'
    }
  ]);
});

test('a complaint needs only a description, and the category defaults to Other', async () => {
  const { status, body } = await post('/complaints?lang=hi', { description: 'पानी नहीं आ रहा है' });
  assert.equal(status, 201);
  assert.equal(body.lang, 'hi');
  assert.match(body.message, /शिकायत दर्ज/);
  assert.deepEqual(created[0], {
    title: 'Other',
    category: 'Other',
    description: 'पानी नहीं आ रहा है',
    latitude: null,
    longitude: null,
    status: 'Pending'
  });
});

test('a location of 0,0 is kept, not turned into null', async () => {
  await post('/complaints', { description: 'Tap is broken', latitude: 0, longitude: '0' });
  assert.equal(created[0].latitude, 0);
  assert.equal(created[0].longitude, 0);
});

test('control characters are stripped so the database never sees a null byte', async () => {
  const { status } = await post('/complaints', { description: 'Tap\u0000 is\u0007 broken\u001f here', village: 'Ram\u0000pur' });
  assert.equal(status, 201);
  assert.equal(created[0].description, 'Tap is broken here');
  assert.equal(created[0].title, 'Other - Rampur');
});

test('descriptions are counted in characters, not bytes or UTF-16 units', async () => {
  const hindi = await post('/complaints', { description: 'पानी' });
  assert.equal(hindi.status, 400);
  const five = await post('/complaints', { description: 'पानीकम' });
  assert.equal(five.status, 201);
  const emoji = await post('/complaints', { description: '💧'.repeat(500) });
  assert.equal(emoji.status, 201);
  const tooMany = await post('/complaints', { description: '💧'.repeat(501) });
  assert.equal(tooMany.status, 400);
});

test('invalid complaints are rejected with 400 and never stored', async () => {
  const cases = [
    {},
    { description: 'abcd' },
    { description: '     ' },
    { description: 'a'.repeat(501) },
    { description: 123 },
    { description: ['Tap is broken'] },
    { description: 'Tap is broken', category: 'Sewage' },
    { description: 'Tap is broken', category: 5 },
    { description: 'Tap is broken', village: 'v'.repeat(81) },
    { description: 'Tap is broken', village: 7 },
    { description: 'Tap is broken', latitude: 26.8 },
    { description: 'Tap is broken', longitude: 80.9 },
    { description: 'Tap is broken', latitude: 91, longitude: 80 },
    { description: 'Tap is broken', latitude: 26, longitude: 181 },
    { description: 'Tap is broken', latitude: 'abc', longitude: 80 },
    { description: 'Tap is broken', latitude: 1e21, longitude: 80 },
    { description: 'Tap is broken', latitude: null, longitude: 80 }
  ];
  for (const payload of cases) {
    const { status, body } = await post('/complaints', payload);
    assert.equal(status, 400, JSON.stringify(payload));
    assert.ok(body.error);
  }
  const array = await post('/complaints', ['Tap is broken']);
  assert.equal(array.status, 400);
  const language = await post('/complaints?lang=fr', { description: 'Tap is broken' });
  assert.equal(language.status, 400);
  assert.equal(created.length, 0);
});

test('a complaint can be looked up by number and exposes only safe fields', async () => {
  state.complaint = { id: 7, title: 'Dirty water - Rampur', category: 'Dirty water', status: 'Pending', createdAt: new Date('2026-11-14T00:00:00.000Z') };
  const { status, body } = await get('/complaints/7');
  assert.equal(status, 200);
  assert.deepEqual(lookups, [{ where: { id: 7 }, select: { id: true, title: true, category: true, status: true, createdAt: true } }]);
  assert.deepEqual(body, {
    lang: 'en',
    complaintId: 7,
    title: 'Dirty water - Rampur',
    category: 'Dirty water',
    status: 'Pending',
    message: 'Your complaint has been received and is waiting for review.',
    createdAt: '2026-11-14T00:00:00.000Z'
  });
  assert.equal('description' in body, false);
  assert.equal('latitude' in body, false);
  assert.equal('longitude' in body, false);
});

test('every complaint status has an English and a Hindi message', async () => {
  const expected = {
    Pending: ['Your complaint has been received and is waiting for review.', 'आपकी शिकायत दर्ज हो गई है और समीक्षा की प्रतीक्षा में है।'],
    'In Progress': ['Officials are working on your complaint.', 'आपकी शिकायत पर काम चल रहा है।'],
    resolved: ['Your complaint has been resolved.', 'आपकी शिकायत का समाधान हो गया है।'],
    Escalated: ['Officials have updated the status of your complaint.', 'अधिकारियों ने आपकी शिकायत की स्थिति अपडेट की है।']
  };
  for (const [statusText, [en, hi]] of Object.entries(expected)) {
    state.complaint = { id: 1, title: 't', category: 'Other', status: statusText, createdAt: new Date() };
    assert.equal((await get('/complaints/1')).body.message, en, statusText);
    assert.equal((await get('/complaints/1?lang=hi')).body.message, hi, statusText);
  }
});

test('a missing complaint is 404 and malformed numbers are 400', async () => {
  const missing = await get('/complaints/999');
  assert.equal(missing.status, 404);
  assert.ok(missing.body.error);
  for (const id of ['0', 'abc', '2147483648', '1e3', '01', '-1', '1.5', '99999999999999999999']) {
    const { status } = await get(`/complaints/${id}`);
    assert.equal(status, 400, id);
  }
  const language = await get('/complaints/1?lang=fr');
  assert.equal(language.status, 400);
  assert.equal(lookups.length, 1);
  const largest = await get('/complaints/2147483647');
  assert.equal(largest.status, 404);
});

test('database failures are logged and never leaked to the caller', async () => {
  const secret = 'relation "Asset" does not exist at 10.0.0.5';
  const errorLog = mock.method(console, 'error', () => {});
  try {
    state.failQueries = new Error(secret);
    state.failCreate = new Error(secret);
    state.failLookup = new Error(secret);
    const responses = [
      await get('/villages'),
      await get('/villages/Rampur'),
      await get('/nearby?lat=26&lng=80'),
      await post('/complaints', { description: 'Tap is broken' }),
      await get('/complaints/3')
    ];
    responses.forEach(({ status, body }) => {
      assert.equal(status, 500);
      assert.equal(body.error, 'Something went wrong. Please try again later.');
      assert.ok(!JSON.stringify(body).includes(secret));
    });


    assert.deepEqual(
      errorLog.mock.calls.map((call) => call.arguments[0]),
      [
        '[farmer] villages failed:',
        '[farmer] village failed:',
        '[farmer] nearby failed:',
        '[farmer] complaint failed:',
        '[farmer] complaint lookup failed:'
      ]
    );
    errorLog.mock.calls.forEach((call) => assert.equal(call.arguments[1].message, secret));
  } finally {
    errorLog.mock.restore();
  }
});

test('the existing complaint route still works alongside the farmer routes', async () => {
  const res = await fetch(`${origin}/api/complaints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Low water pressure in Ward 3', category: 'Low water pressure', description: 'Weak flow since morning' })
  });
  assert.equal(res.status, 201);
  assert.equal(created.length, 1);
  assert.equal(created[0].title, 'Low water pressure in Ward 3');
  assert.equal(created[0].status, 'Pending');
});

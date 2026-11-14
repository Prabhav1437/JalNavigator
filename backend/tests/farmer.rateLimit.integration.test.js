const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { requireTestDatabase } = require('./farmerTestDatabase');

const databaseUrl = process.env.FARMER_TEST_DATABASE_URL;

function run(limiter, ip) {
  return new Promise((resolve) => {
    const res = {
      headers: {},
      statusCode: 200,
      body: null,
      set(name, value) {
        this.headers[name] = value;
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve({ passed: false, res: this });
        return this;
      }
    };
    limiter({ ip }, res, () => resolve({ passed: true, res }));
  });
}

async function settles(check, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

function runSuite(url) {
  requireTestDatabase(url);
  process.env.DATABASE_URL = url;
  const prisma = require('../database');
  const { createRateLimiter } = require('../utils/rateLimiter');

  const build = (options) => createRateLimiter({ sweepIntervalMs: 1e12, ...options });
  const rowCount = () => prisma.farmerRateLimit.count();

  before(async () => {
    await prisma.farmerRateLimit.deleteMany();
  });

  after(async () => {
    await prisma.farmerRateLimit.deleteMany();
    await prisma.$disconnect();
  });

  test('two server processes and a restart share one allowance', async () => {
    await prisma.farmerRateLimit.deleteMany();
    let time = 1000000;
    const options = { limit: 3, windowMs: 60000, now: () => time };
    const processA = build(options);
    const processB = build(options);

    assert.equal((await run(processA, '198.51.100.1')).passed, true);
    assert.equal((await run(processB, '198.51.100.1')).passed, true);
    const restartedA = build(options);
    assert.equal((await run(restartedA, '198.51.100.1')).passed, true);

    const blockedOnA = await run(processA, '198.51.100.1');
    const blockedOnB = await run(processB, '198.51.100.1');
    const blockedAfterRestart = await run(build(options), '198.51.100.1');
    for (const blocked of [blockedOnA, blockedOnB, blockedAfterRestart]) {
      assert.equal(blocked.passed, false);
      assert.equal(blocked.res.statusCode, 429);
      assert.equal(blocked.res.headers['Retry-After'], '60');
    }
    assert.equal((await run(processA, '198.51.100.2')).passed, true);

    time += 59999;
    assert.equal((await run(processB, '198.51.100.1')).passed, false);
    time += 1;
    assert.equal((await run(processB, '198.51.100.1')).passed, true);
  });

  test('parallel requests from many processes never let more than the limit through', async () => {
    await prisma.farmerRateLimit.deleteMany();
    const options = { limit: 10, windowMs: 60000, now: () => 5000000 };
    const processes = Array.from({ length: 4 }, () => build(options));
    const results = await Promise.all(
      Array.from({ length: 80 }, (_, index) => run(processes[index % 4], '198.51.100.9'))
    );
    assert.equal(results.filter((result) => result.passed).length, 10);
    assert.equal(results.filter((result) => result.res.statusCode === 429).length, 70);
    const [row] = await prisma.farmerRateLimit.findMany({ where: { key: '198.51.100.9' } });
    assert.equal(row.count, 11);
  });

  test('a rotating IPv6 address inside one /64 still shares one allowance', async () => {
    await prisma.farmerRateLimit.deleteMany();
    const limiter = build({ limit: 2, windowMs: 60000, now: () => 7000000 });
    assert.equal((await run(limiter, '2001:db8:aa:bb::1')).passed, true);
    assert.equal((await run(limiter, '2001:db8:aa:bb:1:2:3:4')).passed, true);
    assert.equal((await run(limiter, '2001:db8:aa:bb:ffff::')).passed, false);
    assert.equal(await rowCount(), 1);
  });

  test('the sweep removes expired entries and keeps the table under the hard cap', async () => {
    await prisma.farmerRateLimit.deleteMany();
    let time = 10000000;
    const limiter = build({ limit: 5, windowMs: 100000, now: () => time, maxClients: 1000 });

    for (let batch = 0; batch < 15; batch += 1) {
      time += 1000;
      await Promise.all(Array.from({ length: 100 }, (_, index) => run(limiter, `10.${batch}.0.${index}`)));
    }
    assert.equal(await rowCount(), 1500);

    await limiter.sweepNow();
    assert.equal(await rowCount(), 1000);
    const oldest = await prisma.farmerRateLimit.findMany({ where: { key: { startsWith: '10.0.' } } });
    const newest = await prisma.farmerRateLimit.findMany({ where: { key: { startsWith: '10.14.' } } });
    assert.equal(oldest.length, 0);
    assert.equal(newest.length, 100);

    time += 1000000;
    await limiter.sweepNow();
    assert.equal(await rowCount(), 0);
  });

  test('a flood of distinct addresses stays bounded once the sweep runs', async () => {
    await prisma.farmerRateLimit.deleteMany();
    let time = 20000000;
    const limiter = createRateLimiter({ limit: 5, windowMs: 900000, now: () => time, maxClients: 500, sweepIntervalMs: 30000 });
    for (let wave = 0; wave < 12; wave += 1) {
      time += 31000;
      await Promise.all(Array.from({ length: 150 }, (_, index) => run(limiter, `172.${wave}.${Math.floor(index / 250)}.${index % 250}`)));
      assert.ok(await settles(() => rowCount().then((count) => count <= 500 + 150)), `wave ${wave}`);
    }
    await limiter.sweepNow();
    assert.ok((await rowCount()) <= 500);
  });
}

if (databaseUrl) {
  runSuite(databaseUrl);
} else {
  test('farmer rate limit integration tests need FARMER_TEST_DATABASE_URL', { skip: true }, () => {});
}

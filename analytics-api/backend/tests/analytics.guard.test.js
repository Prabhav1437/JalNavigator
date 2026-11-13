const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createGuard, withAnalyticsSession, readSettings, AnalyticsBusyError } = require('../utils/analyticsGuard');

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

test('a fresh result is computed once and then served from the cache until it expires', async () => {
  let time = 1000;
  let calls = 0;
  const guard = createGuard({ ttlMs: 10000, now: () => time });
  const loader = () => {
    calls += 1;
    return `value-${calls}`;
  };

  assert.deepEqual(await guard.run('k', loader), { value: 'value-1', source: 'fresh' });
  assert.deepEqual(await guard.run('k', loader), { value: 'value-1', source: 'cache' });
  time += 9999;
  assert.deepEqual(await guard.run('k', loader), { value: 'value-1', source: 'cache' });
  time += 1;
  assert.deepEqual(await guard.run('k', loader), { value: 'value-2', source: 'fresh' });
  assert.equal(calls, 2);
});

test('different keys never share a cached result', async () => {
  const guard = createGuard({ ttlMs: 10000, now: () => 0 });
  assert.equal((await guard.run('a', () => 'A')).value, 'A');
  assert.equal((await guard.run('b', () => 'B')).value, 'B');
  assert.equal((await guard.run('a', () => 'other')).value, 'A');
  assert.equal(guard.stats().cached, 2);
});

test('identical requests arriving together run one query between them', async () => {
  const gate = deferred();
  let calls = 0;
  const guard = createGuard({ ttlMs: 10000, now: () => 0 });
  const loader = () => {
    calls += 1;
    return gate.promise;
  };

  const all = Promise.all(Array.from({ length: 25 }, () => guard.run('same', loader)));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(guard.stats().inFlight, 1);
  gate.resolve('one');
  const results = await all;
  assert.equal(calls, 1);
  results.forEach((result) => assert.equal(result.value, 'one'));
  assert.deepEqual(
    [...new Set(results.map((result) => result.source))].sort(),
    ['fresh', 'shared']
  );
  assert.equal(guard.stats().inFlight, 0);
});

test('a shared in-flight failure reaches every waiter and is not cached', async () => {
  const gate = deferred();
  const guard = createGuard({ ttlMs: 10000, now: () => 0 });
  const waiters = [guard.run('k', () => gate.promise), guard.run('k', () => gate.promise)];
  gate.reject(new Error('database down'));
  await Promise.all(
    waiters.map((waiter) => assert.rejects(() => waiter, /database down/))
  );
  assert.equal(guard.stats().cached, 0);
  assert.equal(guard.stats().inFlight, 0);
  assert.equal((await guard.run('k', () => 'recovered')).value, 'recovered');
});

test('beyond the concurrency cap further distinct queries are refused instead of queued', async () => {
  const gates = [deferred(), deferred()];
  const guard = createGuard({ ttlMs: 0, maxConcurrent: 2, now: () => 0 });
  const first = guard.run('a', () => gates[0].promise);
  const second = guard.run('b', () => gates[1].promise);
  await new Promise((resolve) => setImmediate(resolve));

  await assert.rejects(() => guard.run('c', () => 'never'), AnalyticsBusyError);
  const busy = await guard.run('d', () => 'never').catch((err) => err);
  assert.equal(busy.retryAfterSeconds, 1);

  gates[0].resolve('A');
  await first;
  assert.equal((await guard.run('c', () => 'now allowed')).value, 'now allowed');
  gates[1].resolve('B');
  await second;
});

test('with caching off every request is fresh and nothing is remembered', async () => {
  let calls = 0;
  const guard = createGuard({ ttlMs: 0, now: () => 0 });
  for (let i = 0; i < 5; i += 1) {
    const result = await guard.run('k', () => {
      calls += 1;
      return calls;
    });
    assert.equal(result.source, 'fresh');
  }
  assert.equal(calls, 5);
  assert.equal(guard.stats().cached, 0);
});

test('the cache cannot grow without bound, however many distinct windows are asked for', async () => {
  let time = 0;
  const guard = createGuard({ ttlMs: 60000, maxEntries: 50, now: () => time });
  for (let i = 0; i < 5000; i += 1) {
    time += 1;
    await guard.run(`trends:${i}`, () => i);
  }
  assert.ok(guard.stats().cached <= 50, `cache held ${guard.stats().cached} entries`);
  assert.equal((await guard.run('trends:4999', () => 'recomputed')).source, 'cache');
  time += 60000;
  await guard.run('fresh', () => 1);
  assert.equal(guard.stats().cached, 1);
});

test('settings come from the environment and fall back when they are not plain numbers', () => {
  const saved = { ...process.env };
  try {
    delete process.env.ANALYTICS_CACHE_SECONDS;
    delete process.env.ANALYTICS_MAX_CONCURRENT;
    delete process.env.ANALYTICS_STATEMENT_TIMEOUT_MS;
    delete process.env.ANALYTICS_MAX_ASSET_ROWS;
    assert.deepEqual(readSettings(), {
      ttlMs: 10000,
      maxConcurrent: 4,
      statementTimeoutMs: 5000,
      maxAssetRows: 1000
    });

    process.env.ANALYTICS_CACHE_SECONDS = '0';
    process.env.ANALYTICS_MAX_CONCURRENT = '12';
    process.env.ANALYTICS_STATEMENT_TIMEOUT_MS = '250';
    process.env.ANALYTICS_MAX_ASSET_ROWS = '5';
    assert.deepEqual(readSettings(), { ttlMs: 0, maxConcurrent: 12, statementTimeoutMs: 250, maxAssetRows: 5 });

    for (const bad of ['abc', '-1', '1.5', ' 3', '1e3']) {
      process.env.ANALYTICS_CACHE_SECONDS = bad;
      assert.equal(readSettings().ttlMs, 10000, bad);
    }
    process.env.ANALYTICS_MAX_ASSET_ROWS = '0';
    assert.equal(readSettings().maxAssetRows, 1);
  } finally {
    process.env = saved;
  }
});

test('every analytics statement is wrapped in a UTC transaction with a timeout', async () => {
  const statements = [];
  const options = [];
  const prisma = {
    $transaction: (work, passed) => {
      options.push(passed);
      return work({
        $executeRawUnsafe: (sql) => {
          statements.push(sql);
          return Promise.resolve(0);
        },
        marker: 'tx'
      });
    }
  };

  const seen = await withAnalyticsSession(prisma, { statementTimeoutMs: 1500 }, (tx) => tx.marker);
  assert.equal(seen, 'tx');
  assert.deepEqual(statements, ["SET LOCAL TimeZone = 'UTC'", 'SET LOCAL statement_timeout = 1500']);
  assert.deepEqual(options, [undefined]);

  statements.length = 0;
  await withAnalyticsSession(prisma, { statementTimeoutMs: 0, isolationLevel: 'RepeatableRead' }, () => null);
  assert.deepEqual(statements, ["SET LOCAL TimeZone = 'UTC'"]);
  assert.deepEqual(options[1], { isolationLevel: 'RepeatableRead' });
});

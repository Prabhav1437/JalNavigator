# Analytics API

Four read-only endpoints under `/api/analytics` for officers: counts, per-asset readings, per-village health and daily trends.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/analytics` | Directory of the endpoints below |
| `GET` | `/api/analytics/summary` | Counts by asset type and status, complaint status and category, alert severity and status |
| `GET` | `/api/analytics/readings` | Per-asset min, average and max for water level, flow rate and pressure, lowest average first |
| `GET` | `/api/analytics/villages` | Per-village asset health and open alert counts |
| `GET` | `/api/analytics/trends` | Daily alerts, complaints and readings, zero-filled |

Full request and response details are in `docs/ANALYTICS_API.md` (copied into your repo by the installer).

## Install

The installer is **required**, not optional: a separate folder cannot mount itself into your `backend/routes/api.js`, so without this step every analytics URL answers `404`.

From the repository root (the folder that contains `backend/` and `frontend/`):

```bash
node path/to/analytics-api/install.js
cd backend
npx prisma db push
```

The installer:

1. copies the router, the helper, the tests and the docs into `backend/` and `docs/`,
2. adds two lines to `backend/routes/api.js` (the `require` and `router.use('/analytics', analyticsRoutes)`), so the endpoints answer instead of returning `404`,
3. adds the five analytics entries to the hard-coded endpoint list that `GET /api` returns, so API explorers and other tools discover them,
4. adds four indexes to `backend/prisma/schema.prisma` (listed below),
5. sets the backend `test` script to `node --test --test-concurrency=1` so test files that share one test database never overlap,
6. re-reads both files and **fails with a list of what is missing** if any of that did not apply, so a half-finished install cannot pass silently.

`npx prisma db push` then creates the four indexes. No table, column or existing index is changed. The installer is safe to run twice, works on CRLF files, and stops without changing anything if it is not run in a repository root. Restart the backend and open `http://localhost:3000/api/analytics`.

`backend/tests/analytics.wiring.test.js` checks the wiring from the outside: it starts the real `routes/api.js` and fails with instructions if any analytics URL 404s or is missing from the `/api` directory. So `npm test` tells you whether the install took.

By hand instead: copy `backend/` and `docs/` into the repo, add to `backend/routes/api.js`

```js
const analyticsRoutes = require('./analytics');
router.use('/analytics', analyticsRoutes);
```

add the five analytics endpoints to the `endpoints` array in the same file's `GET /` handler, and add to `backend/prisma/schema.prisma`:

```prisma
model SensorReading {
  // ...existing fields
  @@index([recordedAt])
  @@index([assetId, recordedAt])
}

model Alert {
  // ...existing fields
  @@index([createdAt])
}

model Complaint {
  // ...existing fields
  @@index([createdAt])
}
```

No new dependency.

## Files

```
analytics-api/
├── install.js
├── README.md
├── docs/ANALYTICS_API.md                           endpoint reference
└── backend/
    ├── routes/analytics.js                         the router
    ├── utils/analyticsGuard.js                     UTC session pin, statement timeout, cache, concurrency cap
    └── tests/
        ├── analytics.test.js                       unit tests, no database needed
        ├── analytics.guard.test.js                 unit tests for the cache, the cap and the session pin
        ├── analytics.cache.test.js                 route-level cache, sharing and 503 tests
        ├── analytics.wiring.test.js                checks the router is mounted and listed at /api
        ├── analytics.testDatabase.test.js          tests of the test-database safety check
        ├── analyticsTestDatabase.js                the safety check itself
        ├── analytics.integration.test.js           tests against a real PostgreSQL test database
        └── analytics.timezone.integration.test.js  the same answers under a non-UTC database session
```

## What changed in this revision

| # | Issue | Fix |
| :--- | :--- | :--- |
| 1 | A test run could wipe an ordinary database whose name contains "test" | `analyticsTestDatabase.js` accepts only `jalnavigator_test` or `jalnavigator_test_<suffix>` (lowercase letters and digits). Both integration files use it, and it has its own tests against `test`, `latest`, `contest_results`, `jalnavigator_prod` and similar names. |
| 2 | Endpoints returned `404` unless the optional installer ran | The install step is required and documented as such; the installer now verifies its own work and fails with a list of what is missing; and `analytics.wiring.test.js` starts the real `api.js` and fails with instructions if any analytics URL 404s. Mounting still needs those two lines in `api.js` — nothing a separate folder copies in can mount itself. |
| 3 | Village totals did not reconcile | A fourth bucket, `other`, counts every asset whose status is not `operational`, `maintenance` or `inactive`, including a blank one. `operational + maintenance + inactive + other` now always equals `totalAssets`, and the tests assert that for every row. |
| 4 | A non-UTC database session skewed dates | Every statement runs in a transaction that begins `SET LOCAL TimeZone = 'UTC'`, so windows and day buckets are UTC whatever the server or database is set to, and whether the columns are `timestamp` or `timestamptz`. `analytics.timezone.integration.test.js` proves it: it converts the date columns to `timestamptz`, connects with a non-UTC session time zone, and checks that a row at 23:30 UTC still counts on its own UTC day. |
| 5 | Tabs and newlines around a label were not trimmed | `BTRIM` is given the exact whitespace set that JavaScript's `trim()` removes (tab, newline, carriage return, vertical tab, form feed, no-break space, the Unicode spaces and the byte-order mark), so SQL and JavaScript agree on where a label starts and ends. |
| 6 | History queries had no supporting indexes | Four indexes: `SensorReading (recordedAt)` and `(assetId, recordedAt)`, `Alert (createdAt)`, `Complaint (createdAt)`. An integration test reads them back from the database, so it also confirms `prisma db push` applied them. |
| 7 | Public aggregate queries could exhaust the database | Answers are cached for a few seconds; identical simultaneous requests share one query; only a few queries may run at once and further ones get `503` with `Retry-After` instead of queueing; every statement carries a `statement_timeout`; and `/readings` returns at most `ANALYTICS_MAX_ASSET_ROWS` assets. All four are configurable, and the directory endpoint touches no table. |
| 8 | The new routes were undiscoverable | The installer adds all five analytics endpoints to the endpoint list that `GET /api` returns, and a test asserts that what `/api` advertises is exactly what answers. |
| 9 | A readings test depended on the time of day | The flaky assertion is gone. A self-contained test seeds its own asset with readings 2 hours, 23 h 59 min, 24 h 01 min and 26 hours before the moment of the request and asserts the rolling 24-hour window keeps exactly the first two. It gives the same answer at any time of day. |

## Settings

| Variable | Default | Effect |
| :--- | :--- | :--- |
| `ANALYTICS_CACHE_SECONDS` | `10` | How long an answer is reused. `0` turns caching off. |
| `ANALYTICS_MAX_CONCURRENT` | `4` | Analytics queries allowed at once; beyond this a request gets `503`. `0` means no limit. |
| `ANALYTICS_STATEMENT_TIMEOUT_MS` | `5000` | How long one statement may run before the database cancels it. `0` turns it off. |
| `ANALYTICS_MAX_ASSET_ROWS` | `1000` | Most assets `/readings` will return. |

## Notes for deployment

- **Figures can lag by up to `ANALYTICS_CACHE_SECONDS`.** That is the point of the cache, but set it to `0` if a screen must always show the newest numbers. The cache is per server process, so with several processes each keeps its own; the protection still scales, since each process does at most one query per key per interval.
- **The concurrency cap is also per process.** With N processes the database can see up to N times `ANALYTICS_MAX_CONCURRENT` analytics queries. Size it with your connection pool in mind.
- **A `503` is the intended answer under load**, not an error to retry immediately in a loop. Clients should honour `Retry-After`.
- **Still unauthenticated.** These endpoints remain open, like the rest of the project. The limits above stop them exhausting the database but do not hide the figures; real protection needs the authentication feature, which this does not add.
- **The indexes are created, not forced.** PostgreSQL still decides per query whether using one is cheaper than a scan; on a small table a sequential scan is the right choice. The test asserts the indexes exist, not which plan the planner picks.
- **The UTC pin costs two tiny statements per request** (`SET LOCAL`), inside the transaction that was already being opened.
- **`/readings` with no `days`** still reads the whole history for the matching assets. The statement timeout bounds it; add a `days` window for large tables.

## Running the tests

Unit tests need no database:

```bash
cd backend
npm test
```

The integration tests run only when `ANALYTICS_TEST_DATABASE_URL` points at a **dedicated test database**. They delete every row in it, so they refuse to run unless the database is named `jalnavigator_test` or `jalnavigator_test_<suffix>`. A database such as `latest_prod` or `my_test_db` is refused even though it contains "test".

```bash
createdb jalnavigator_test
cd backend
export ANALYTICS_TEST_DATABASE_URL="postgresql://postgres:password@localhost:5432/jalnavigator_test?schema=public"
DATABASE_URL="$ANALYTICS_TEST_DATABASE_URL" npx prisma db push
npm test
```

Two things worth knowing about the suites:

- The integration files set `ANALYTICS_CACHE_SECONDS=0` so every assertion reads fresh numbers. The cache itself is covered by `analytics.guard.test.js` and `analytics.cache.test.js`.
- `analytics.timezone.integration.test.js` temporarily changes the three date columns to `timestamptz` and changes them back when it finishes. If that run is killed halfway, the test database is left with `timestamptz` columns; `npx prisma db push` puts them back. It only ever touches the test database, which the name check above enforces. Set `ANALYTICS_TEST_TIME_ZONE` to try another session zone (default `-05:30`).

If you also use the farmer feature, point `FARMER_TEST_DATABASE_URL` at the same database. The two suites then run one after the other.

## How this was verified

- 62 tests pass against PostgreSQL 16 with the repo's schema plus the four indexes: 44 unit tests for the router, the guard, the wiring and the database-name check, and 18 integration tests against a real database, including the non-UTC session suite. The whole suite passed three runs in a row.
- Twelve bugs were put back one at a time (a loose database-name check, the router unmounted, the `other` bucket dropped and then pinned to zero, the UTC pin removed, `BTRIM` back to spaces only for villages and for alert statuses, the guard bypassed, the statement timeout removed, the `/api` directory entries removed, the indexes dropped from the database, and a midnight-anchored instead of rolling readings window), and each is caught by a test.
- Removing the UTC pin makes three of the four timezone tests fail with exactly the symptoms of issue 4: a row at 23:30 UTC counted on the wrong day, and a window that let an older row in. So that suite tests the behaviour, not just the presence of the `SET LOCAL`.
- The timezone behaviour was checked directly in `psql` first: with a session zone of `-05:30` and no pin, a row at 23:30 UTC buckets into the next day and a window bound shifts by five and a half hours. With the pin both are correct, for `timestamp` and `timestamptz` columns alike.
- The rolling-window test was run with the clock faked to 00:30, 06:00, 11:59, 12:01 and 23:45 UTC and passes at all five. The assertion it replaces was run at the same five times and fails at the first three, which is the behaviour issue 9 describes.
- The installer was run on your original upload, on the project zip where the previous version was already wired, and together with the farmer feature in both orders, twice in a row each. The resulting `schema.prisma` passes `prisma validate` and generates a working client.
- With the farmer feature installed alongside, the whole backend suite (147 tests) passes twice in a row, so the two features' routes, schema edits and test suites do not collide.
- The real `server.js` was started and called with `curl`: the `/api` directory lists all five endpoints, a village stored as `\tRampur\n` groups with `rampur ` under one clean `Rampur` label, a padded `Decommissioned` status lands in `other` with the buckets adding up, a padded `\n OPEN \t` alert counts as open, and a burst of requests against a cap of one returns `503` with `Retry-After: 1`.

Not checked: the project's own `new PrismaClient()` with Prisma's standard query engine, because its binary could not be downloaded in the build environment. The tests used Prisma's driver adapter for `pg` with the same generated client and the same queries, and the indexes were created with SQL matching the schema rather than by `prisma db push`. Run `npx prisma db push` and `npm test` against a test database on your machine to confirm with the standard engine.

Not included: a frontend page for the analytics. These are backend endpoints only.

# Analytics API

Four read-only endpoints under `/api/analytics`. The feature is **already wired into the backend**, so there is nothing to copy or patch: start the server and the endpoints answer.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/analytics` | Directory of the endpoints below |
| `GET` | `/api/analytics/summary` | Counts by asset type and status, complaint status and category, alert severity and status |
| `GET` | `/api/analytics/readings` | Per-asset min, average and max for water level, flow rate and pressure, lowest average first |
| `GET` | `/api/analytics/villages` | Per-village asset health and open alert counts |
| `GET` | `/api/analytics/trends` | Daily alerts, complaints and readings, zero-filled |

Full request and response details are in `docs/API.md`, section 7.

## Where the code lives

```
backend/
├── routes/analytics.js                          the router
├── routes/api.js                                mounts it: router.use('/analytics', analyticsRoutes)
├── package.json                                 adds "test": "node --test"
└── tests/
    ├── analytics.test.js                        19 unit tests, no database needed
    └── analytics.integration.test.js            11 tests against a real PostgreSQL test database
docs/API.md                                      section 7 documents the endpoints
```

No schema change and no new dependency.

## Behaviour worth knowing

- **Database-side aggregation.** `readings`, `villages` and `trends` are each one SQL statement that returns only the grouped result. No raw rows are loaded into Node, so memory stays flat as the tables grow.
- **Consistent snapshots.** `summary` runs its seven queries in one repeatable-read transaction, and the other three are single statements, so totals never disagree with each other when data is written mid-request.
- **Case-insensitive statuses and villages.** `Resolved` and `resolved` count as one status, `Open` and `open` as one alert state, and `Rampur` and ` rampur ` as one village. Blank villages and the literal `Unassigned` share one `Unassigned` row.
- **Stable labels.** Village rows use the same name on every request, and rows are fully ordered.
- **Future readings are ignored.** `readings` and `trends` only count rows dated up to now.
- **Input is validated strictly.** `days` must be 1 to 365 and `assetId` 1 to 2147483647, both plain digits. Anything else returns `400` before touching the database.
- **Failures are logged.** A database error is written to the server log as `[analytics] <endpoint> failed:` with the full error, and the caller gets `{ "error": "Failed to compute analytics" }` so internals are not exposed.
- **Odd labels are safe.** Values such as `__proto__` or `constructor` in a status column are counted like any other label.
- **Table names.** The SQL uses the default Prisma table names (`"Asset"`, `"Alert"`, `"Complaint"`, `"SensorReading"`). If you add `@@map` to the schema, update the queries in `routes/analytics.js`.

## Running the tests

Unit tests (no database, run anywhere):

```bash
cd backend
npm test
```

The integration tests are skipped unless you point them at a **dedicated test database**. They delete every row in it, so the suite refuses to run unless the database name contains `test`.

```bash
createdb jalnavigator_test
cd backend
export ANALYTICS_TEST_DATABASE_URL="postgresql://postgres:password@localhost:5432/jalnavigator_test?schema=public"
DATABASE_URL="$ANALYTICS_TEST_DATABASE_URL" npx prisma db push
npm test
```

They cover the raw SQL against real PostgreSQL, including a 30000-reading dataset and a test that reads the summary while another connection writes rows.

## What changed in this revision

| # | Issue | Fix |
| :--- | :--- | :--- |
| 1 | Endpoints returned 404 until patched | Router is mounted in `backend/routes/api.js`; a test checks every listed path answers 200 |
| 2 | Large tables loaded into Node | `readings`, `villages` and `trends` aggregate in SQL |
| 3 | `__proto__` / `constructor` labels corrupted counts | Counting uses a `Map`; results are built with `Object.fromEntries` |
| 4 | Totals could disagree under concurrent writes | Repeatable-read transaction for `summary`, single statements elsewhere |
| 5 | Oversized `assetId` returned 500 | Strict 1 to 2147483647 check returns 400 |
| 6 | Status matching was case-sensitive | Normalised in JavaScript and in SQL (`LOWER(BTRIM(...))`) |
| 7 | Blank and `Unassigned` villages split | Both map to one grouping key |
| 8 | Village label depended on row order | Label is `MIN` of the trimmed names, and ordering is total |
| 9 | Future readings skewed averages | Upper bound of "now" on `readings` and `trends` |
| 10 | Database failures not logged | Every handler logs through one `fail()` helper |
| 11 | Null trend buckets could pass | Tests assert strict `0` and `typeof number` for every quiet day |
| 12 | Wrong endpoint paths could pass | Test asserts the exact method and path of every endpoint |

## How this was verified

- All 19 unit tests and 11 integration tests pass, repeatedly, against PostgreSQL 16 with the repo's real schema and a generated Prisma client.
- Each fix was checked by putting the original bug back and confirming a test fails. This covered issues 3, 4, 5, 6, 7, 9, 10, 11 and 12.
- The patched backend was installed fresh from the zip and its unit tests run there.

Not checked: the project's own `new PrismaClient()` with the standard Prisma query engine, because the engine binary could not be downloaded in the build environment. The verification used Prisma's driver adapter for `pg` with the same generated client and the same queries. Run `npm test` with a test database on your machine to confirm with the standard engine.

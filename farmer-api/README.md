# Farmer API

The public, end-user side of JalNavigator. The existing endpoints are written for officers (list every asset, edit anything). These are for the villagers and farmers who rely on the water supply, and they answer in plain language, in English or Hindi.

| Method | Path | Answers |
| :--- | :--- | :--- |
| `GET` | `/api/farmer/villages` | Is the water supply working in each village? (`good`, `low`, `problem`, or `unknown` when nothing has been measured) |
| `GET` | `/api/farmer/villages/:name` | Which water points does my village have, how full are they, any problems? |
| `GET` | `/api/farmer/nearby?lat=&lng=` | Where is the nearest working tank, borewell or pump? |
| `POST` | `/api/farmer/complaints` | I have a problem: register a complaint, get a number and a tracking code |
| `GET` | `/api/farmer/complaints/:id` | What happened to my complaint? (needs the tracking code) |

All endpoints take `?lang=en` or `?lang=hi`. Full request and response details are in `docs/FARMER_API.md` (copied into your repo by the installer).

## Install

From the repository root (the folder that contains `backend/` and `frontend/`):

```bash
node path/to/farmer-api/install.js
cd backend
npx prisma db push
```

The installer:

1. copies the new files into `backend/` and `docs/`,
2. adds two lines to `backend/routes/api.js` (the `require` and `router.use('/farmer', farmerRoutes)`),
3. adds two models, a relation and two indexes to `backend/prisma/schema.prisma` (details below),
4. adds two lines to `backend/server.js` so a malformed JSON body gets a JSON error (the handler only touches `/api/farmer`),
5. sets the backend `test` script to `node --test --test-concurrency=1` so test files that share one test database never overlap,
6. changes one condition in `frontend/src/components/Complaints.jsx` so complaints located at latitude 0 or longitude 0 still show their location.

`npx prisma db push` then creates the two new tables and the two indexes (it also regenerates the Prisma client). Nothing existing is dropped or changed. The installer is safe to run twice, works on CRLF files, and stops without changing anything if it is not run in a repository root. Restart the backend and open `http://localhost:3000/api/farmer`.

If you apply it by hand, copy `backend/` and `docs/` into the repo and:

- `backend/routes/api.js`: `const farmerRoutes = require('./farmer');` and `router.use('/farmer', farmerRoutes);`
- `backend/server.js`: `const farmerJsonErrors = require('./utils/farmerJsonErrors');` after the other requires, and `app.use(farmerJsonErrors);` right after `app.use(express.json());`
- `Complaints.jsx`: change `item.latitude && item.longitude` to `item.latitude != null && item.longitude != null`
- `backend/prisma/schema.prisma`:

```prisma
model Complaint {
  // ...existing fields
  farmerAccess FarmerComplaintAccess?
}

model SensorReading {
  // ...existing fields
  @@index([assetId, recordedAt(sort: Desc), id(sort: Desc)])
}

model Alert {
  // ...existing fields
  @@index([assetId, createdAt])
}

model FarmerComplaintAccess {
  id             Int       @id @default(autoincrement())
  complaintId    Int       @unique
  token          String
  idempotencyKey String?   @unique
  requestHash    String?
  createdAt      DateTime  @default(now())
  complaint      Complaint @relation(fields: [complaintId], references: [id], onDelete: Cascade)
}

model FarmerRateLimit {
  key     String   @id
  count   Int
  resetAt DateTime

  @@index([resetAt])
}
```

## Files

```
farmer-api/
├── install.js
├── README.md
├── docs/FARMER_API.md                              endpoint reference
└── backend/
    ├── routes/farmer.js                            the router
    ├── utils/farmerMessages.js                     English and Hindi texts, complaint categories
    ├── utils/rateLimiter.js                        database-backed limiter for complaint submissions
    ├── utils/farmerJsonErrors.js                   JSON answer for malformed or oversized request bodies
    └── tests/
        ├── farmer.test.js                          unit tests, no database needed
        ├── farmer.rateLimit.test.js                limiter and router tests, no database needed
        ├── farmer.testDatabase.test.js             tests of the test-database safety check
        ├── farmerTestDatabase.js                   the safety check itself
        ├── farmer.integration.test.js              tests against a real PostgreSQL test database
        └── farmer.rateLimit.integration.test.js    limiter tests against that database
```

## How it fits the existing code

- **Same data.** Villages, water points, readings and alerts are read from the existing `Asset`, `SensorReading` and `Alert` models. Complaints are stored in the existing `Complaint` model; the tracking code and idempotency key live in a small side table, `FarmerComplaintAccess`, so the `Complaint` columns are untouched.
- **Same workflow.** A complaint filed by a farmer shows up in the existing Complaints screen, `GET /api/complaints` and the dashboard counts. When an officer changes its status with the existing `PUT /api/complaints/:id`, the farmer sees the new status and a message in their language. Deleting a complaint also deletes its tracking record. The integration tests run this whole loop through the real routes.
- **Same conventions.** Prisma only, routes under `backend/routes/`, no comments in the code, errors logged on the server and not leaked to the caller.
- **Less exposure.** The existing `GET /api/complaints` returns every complaint with its description and location. The farmer lookup needs the tracking code and returns only the title, category, status and date.
- **Same simulated-data rule.** Responses that show water levels say `"readingsAreSimulated": true`.

## What changed in this revision

| # | Issue | Fix |
| :--- | :--- | :--- |
| 1 | Complaint details readable by anyone who guesses an ID | Registering a complaint returns a random tracking code (192 bits). The lookup needs it in `X-Complaint-Token`, compares it in constant time, and answers `404` for both a wrong code and a missing complaint, `401` for no code. Complaints made through the officer endpoint have no code and cannot be read here. |
| 2 | Tests could wipe an ordinary database whose name contains "test" | `farmerTestDatabase.js` accepts only `jalnavigator_test` or `jalnavigator_test_<suffix>` (lowercase letters and digits). Both integration files use it, and it has its own tests against `test`, `latest`, `contest_results`, `jalnavigator_prod` and similar names. |
| 3 | Rate-limit table grew without bound and was rescanned per request | Each request is one indexed upsert; nothing is scanned. A sweep runs at most once per 30 seconds per process, deletes expired rows, then deletes the oldest rows beyond `FARMER_RATE_LIMIT_MAX_CLIENTS` (default 50000). IPv6 clients are counted by /64, so one network cannot mint millions of identities. |
| 4 | Limits reset on restart and differed per process | State lives in the `FarmerRateLimit` table, updated by one atomic statement. Tests run several limiter instances against one database, restart them, and send 80 parallel requests: exactly the limit gets through. |
| 5 | A village could be a `problem` with no notice | The open-alert count now uses the same "created by now" bound as the notices list. |
| 6 | Growing tables slowed farmer reads | Index on `SensorReading (assetId, recordedAt DESC, id DESC)` for the latest reading, and on `Alert (assetId, createdAt)` for open alerts. See the note on alert status below. |
| 7 | Directory ignored `?lang=` | Uses the same language check as every other endpoint (`400` for an unsupported one) and returns the endpoint descriptions in English or Hindi. |
| 8 | Impossible stored coordinates produced false "nearby" results | `nearby` skips assets outside -90 to 90 / -180 to 180 (and NaN or infinite values). Village details return `"mapUrl": null` for them. |
| 9 | Retries created duplicate complaints | Optional `Idempotency-Key` header. The complaint and its key are written together in one transaction, the key is unique in the database, and a request that loses a race is answered with the winner's complaint. The same key with a different complaint is `422`. |
| 10 | No readings looked like `good` | A village with working assets but no reading is `unknown`, with its own English and Hindi message. Real problems and maintenance still take priority. |
| 11 | Malformed JSON got an HTML error | `farmerJsonErrors` turns body-parser errors on `/api/farmer` into `400` or `413` JSON and never echoes the body. Other routes are unchanged. |
| 12 | A complaint at latitude or longitude 0 showed no location | The Complaints screen now tests `!= null` instead of truthiness. The installer makes the change. |

## Settings

| Variable | Default | Effect |
| :--- | :--- | :--- |
| `FARMER_COMPLAINT_LIMIT` | `20` | Complaints one client address may register per window. `0` turns the limit off. |
| `FARMER_COMPLAINT_WINDOW_MINUTES` | `15` | Length of that window. |
| `FARMER_RATE_LIMIT_MAX_CLIENTS` | `50000` | Most clients kept in the rate-limit table after each sweep. |

## Deployment notes

- **Behind a proxy or load balancer** (Render, Nginx, Cloudflare and similar), Express sees the proxy's address for every visitor unless you add `app.set('trust proxy', 1);` to `backend/server.js`. Without it all farmers share one rate-limit allowance. The installer does not change this for you, since the right value depends on your hosting.
- **Rate limiter and the database.** The limiter costs one small write per complaint submission. If the database cannot be reached the limiter lets the request through and logs `[farmer] rate limit failed:`; the complaint itself would fail in that case anyway. The table size is capped by the sweep: between two sweeps it can exceed the cap by at most the number of new addresses seen in those 30 seconds.
- **Tracking codes are bearer secrets.** Whoever has the number and the code can read the status. They are stored in plain text in `FarmerComplaintAccess`, so treat that table like any other credential store. Show the code once, and prefer the header over `?token=` because URLs are written to access logs.
- **Idempotency keys** should be random per complaint (a UUID generated when the form opens works well). Reusing one key for different complaints returns `422`.
- **Old complaints.** Complaints created before this revision, and those from `POST /api/complaints`, have no tracking code. Farmers who already hold a number can no longer look it up; officers still see everything in the existing screens.
- **Alert status filter.** The index on `Alert` covers the asset and date columns. The check that an alert is open compares a lower-cased, trimmed status, which Prisma cannot index, so it is applied as a filter on those rows. If you later store alert statuses in one fixed spelling, a partial index on `Alert (assetId) WHERE status = 'Open'` is the next step.
- **No login.** Like the rest of the project, the officer endpoints are open. Real protection for them needs the authentication feature, which this does not add.
- **Scale.** `nearby` measures the distance to every working asset in one SQL statement. That is fine for thousands of assets; for very large tables add a bounding-box filter and an index on latitude and longitude.
- **Hindi texts.** The Hindi wording is plain, short and consistent, but have a native speaker from your target region review it before a public launch, the new `unknown` message and the endpoint descriptions included. All texts are in `backend/utils/farmerMessages.js`.

## Running the tests

Unit tests need no database:

```bash
cd backend
npm test
```

The integration tests run only when `FARMER_TEST_DATABASE_URL` points at a **dedicated test database**. They delete every row in it, so they refuse to run unless the database is named `jalnavigator_test` or `jalnavigator_test_<suffix>`. A database such as `latest_prod` or `my_test_db` is refused even though it contains "test".

```bash
createdb jalnavigator_test
cd backend
export FARMER_TEST_DATABASE_URL="postgresql://postgres:password@localhost:5432/jalnavigator_test?schema=public"
DATABASE_URL="$FARMER_TEST_DATABASE_URL" npx prisma db push
npm test
```

The test that checks the indexes reads them from that database, so it also confirms that `prisma db push` applied the schema change.

If you also use the analytics feature, set `ANALYTICS_TEST_DATABASE_URL` to the same database. The two suites then run one after the other. The analytics suite only checks that the name contains "test", so give it the same `jalnavigator_test` database and never an ordinary one.

## How this was verified

- 85 farmer tests pass against PostgreSQL 16 with the repo's schema plus the changes above: 48 unit, 3 for the database-name check, 29 integration and 5 rate-limit integration.
- The complete backend suite, analytics included (115 tests), passes on a fresh install of your original upload and of the analytics-integrated zip.
- Seventeen bugs were put back one at a time (token not checked, token not required, no cap in the sweep, a sweep on every request, a counter that never grows, IPv6 not grouped, future alerts counted, directory ignoring the language, impossible coordinates, replay missing, race not recovered, key mismatch ignored, `unknown` turned back into `good`, a loose database-name check, a pass-through JSON handler and others), and each is caught by a test.
- The installer was run on your original upload twice in a row, and the resulting `schema.prisma` passes `prisma validate` and generates a working client.
- The real `server.js` was started and called with `curl`: malformed JSON, the Hindi directory, a complaint with location 0,0, a retry with the same key, tracking with no, a wrong and the right code, the `429`, and a server restart that kept the limit.

Not checked: the project's own `new PrismaClient()` with Prisma's standard query engine, because its binary could not be downloaded in the build environment. The tests used Prisma's driver adapter for `pg` with the same generated client and the same queries, and the tables were created from SQL matching the schema rather than by `prisma db push`. Run `npx prisma db push` and `npm test` against a test database on your machine to confirm with the standard engine. The frontend change is a one-line condition and was not run in a browser.

Not included: a frontend page for farmers. These are backend endpoints only.

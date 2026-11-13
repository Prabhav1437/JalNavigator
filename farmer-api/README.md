# Farmer API

The public, end-user side of JalNavigator. The existing endpoints are written for officers (list every asset, edit anything). These are for the villagers and farmers who rely on the water supply, and they answer in plain language, in English or Hindi.

| Method | Path | Answers |
| :--- | :--- | :--- |
| `GET` | `/api/farmer/villages` | Is the water supply working in each village? (`good`, `low`, `problem`) |
| `GET` | `/api/farmer/villages/:name` | Which water points does my village have, how full are they, any problems? |
| `GET` | `/api/farmer/nearby?lat=&lng=` | Where is the nearest working tank, borewell or pump? |
| `POST` | `/api/farmer/complaints` | I have a problem: register a complaint and get a number |
| `GET` | `/api/farmer/complaints/:id` | What happened to my complaint? |

All endpoints take `?lang=en` or `?lang=hi`. Full request and response details are in `docs/FARMER_API.md` (copied into your repo by the installer).

## Install

From the repository root (the folder that contains `backend/` and `frontend/`):

```bash
node path/to/farmer-api/install.js
```

That one command:

1. copies the new files into `backend/` and `docs/`,
2. adds two lines to `backend/routes/api.js` (the `require` and `router.use('/farmer', farmerRoutes)`),
3. sets the backend `test` script to `node --test --test-concurrency=1` so test files that share one test database never overlap.

It is safe to run twice, works on CRLF files, and changes nothing else. Restart the backend and open `http://localhost:3000/api/farmer`.

Doing it by hand instead: copy `backend/` and `docs/` into the repo, then add to `backend/routes/api.js`

```js
const farmerRoutes = require('./farmer');
router.use('/farmer', farmerRoutes);
```

No schema change, no new dependency.

## Files

```
farmer-api/
├── install.js
├── README.md
├── docs/FARMER_API.md                         endpoint reference
└── backend/
    ├── routes/farmer.js                       the router
    ├── utils/farmerMessages.js                English and Hindi texts, complaint categories
    ├── utils/rateLimiter.js                   per-client limiter for complaint submissions
    └── tests/
        ├── farmer.test.js                     24 unit tests, no database needed
        ├── farmer.rateLimit.test.js           7 unit and HTTP tests for the limiter
        └── farmer.integration.test.js         20 tests against a real PostgreSQL test database
```

## How it fits the existing code

- **Same data.** Villages, water points, readings and alerts are read from the existing `Asset`, `SensorReading` and `Alert` models. Complaints are stored in the existing `Complaint` model.
- **Same workflow.** A complaint filed by a farmer shows up in the existing Complaints screen, `GET /api/complaints` and the dashboard counts. When an officer changes its status with the existing `PUT /api/complaints/:id`, the farmer sees the new status and a message in their language. The integration tests run this whole loop through the real routes.
- **Same conventions.** Prisma only, routes under `backend/routes/`, no comments in the code, errors logged on the server and not leaked to the caller.
- **Less exposure.** The existing `GET /api/complaints` returns every complaint with its description and location. The farmer lookup returns only the title, category, status and date.
- **Same simulated-data rule.** Responses that show water levels say `"readingsAreSimulated": true`.

## Settings

| Variable | Default | Effect |
| :--- | :--- | :--- |
| `FARMER_COMPLAINT_LIMIT` | `20` | Complaints one client address may register per window. `0` turns the limit off. |
| `FARMER_COMPLAINT_WINDOW_MINUTES` | `15` | Length of that window. |

## Deployment notes

- **Behind a proxy or load balancer** (Render, Nginx, Cloudflare and similar), Express sees the proxy's address for every visitor unless you add `app.set('trust proxy', 1);` to `backend/server.js`. Without it all farmers share one rate-limit allowance. The installer does not change `server.js` for you, since the right value depends on your hosting.
- **No login.** Like the rest of the project, these endpoints are open. Complaint numbers are sequential, so anyone can look up another complaint's status, title and category, but nothing more. Real protection for the officer endpoints needs the authentication feature, which this does not add.
- **Scale.** `nearby` measures the distance to every working asset in one SQL statement. That is fine for thousands of assets; for very large tables add a bounding-box filter and an index on latitude and longitude.
- **Hindi texts.** The Hindi wording is plain, short and consistent, but have a native speaker from your target region review it before a public launch. All texts are in `backend/utils/farmerMessages.js`.

## Running the tests

Unit tests need no database:

```bash
cd backend
npm test
```

The integration tests run only when `FARMER_TEST_DATABASE_URL` points at a **dedicated test database**. They delete every row in it, so they refuse to run unless the database name contains `test`.

```bash
createdb jalnavigator_test
cd backend
export FARMER_TEST_DATABASE_URL="postgresql://postgres:password@localhost:5432/jalnavigator_test?schema=public"
DATABASE_URL="$FARMER_TEST_DATABASE_URL" npx prisma db push
npm test
```

If you also use the analytics feature, set `ANALYTICS_TEST_DATABASE_URL` to the same database. The two suites then run one after the other.

## How this was verified

- 31 unit tests and 20 integration tests pass against PostgreSQL 16 with the repo's real schema, and the complete backend suite (81 tests, analytics included) passes three times in a row.
- Ten bugs were put back one at a time (distance ignoring longitude, future readings counted, case-sensitive status checks, wildcard search, null bytes, a leaking tracking response, a lost 0,0 location and others), and each is caught by a test. Removing the shared database snapshot from the village detail is also caught, in 3 of 3 runs.
- The installer was run on your original upload and on the analytics-integrated zip, twice in a row, on CRLF files, in the wrong folder, and with a path argument.
- The real `server.js` was started against sample data and every endpoint was called with `curl`. The examples in `docs/FARMER_API.md` are copied from those real responses.

Not checked: the project's own `new PrismaClient()` with Prisma's standard query engine, because its binary could not be downloaded in the build environment. The tests used Prisma's driver adapter for `pg` with the same generated client and the same queries. Run `npm test` against a test database on your machine to confirm with the standard engine.

Not included: a frontend page for farmers. These are backend endpoints only.

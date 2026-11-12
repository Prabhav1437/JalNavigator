# Analytics API

Four read-only endpoints under `/api/analytics` that turn the existing data into numbers a chart or report can use. It needs **no schema change and no new dependency**: it reads the existing `Asset`, `SensorReading`, `Alert` and `Complaint` models through the shared Prisma client.

## Endpoints

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/analytics` | Directory of the endpoints below |
| `GET` | `/api/analytics/summary` | Counts grouped by asset type and status, complaint status and category, alert severity and status |
| `GET` | `/api/analytics/readings` | Per-asset min, average and max for water level, flow rate and pressure |
| `GET` | `/api/analytics/villages` | Per-village asset health and open alert counts |
| `GET` | `/api/analytics/trends` | Daily alerts, complaints and readings, zero-filled |

### Query parameters

- `/readings`: `days` (1 to 365, optional, default is all time) and `assetId` (positive integer, optional).
- `/trends`: `days` (1 to 365, default 7).
- Invalid values return `400` with `{ "error": "..." }`.

### Example: `GET /api/analytics/summary`

```json
{
  "assets": { "total": 5, "byType": { "tank": 1, "borewell": 2, "pump": 1, "pipeline": 1 }, "byStatus": { "Operational": 4, "Maintenance": 1 } },
  "complaints": { "total": 3, "resolvedPercent": 33.33, "byStatus": { "Pending": 1, "In Progress": 1, "Resolved": 1 }, "byCategory": { "Pipeline leakage": 1, "Low water pressure": 1, "Dirty water": 1 } },
  "alerts": { "total": 1, "bySeverity": { "Critical": 1 }, "byStatus": { "Open": 1 } },
  "readings": { "total": 3 }
}
```

### Example: `GET /api/analytics/readings?days=7`

Assets are sorted by average water level, lowest first, so the ones most at risk come first. `lowLevelReadings` counts readings under the app's 20% critical threshold.

```json
{
  "days": 7,
  "lowLevelThreshold": 20,
  "assets": [
    {
      "assetId": 1, "name": "Rampur Central Overhead Tank", "type": "tank", "village": "Rampur", "status": "Operational",
      "readingCount": 2, "lowLevelReadings": 1,
      "waterLevel": { "avg": 20, "min": 10, "max": 30 },
      "flowRate": { "avg": 6, "min": 5, "max": 7 },
      "pressure": { "avg": 1.5, "min": 1, "max": 2 }
    }
  ]
}
```

### Example: `GET /api/analytics/villages`

Village names are matched case-insensitively and trimmed, so `Rampur` and ` rampur ` count as one village. Assets with no village are grouped as `Unassigned`. Rows are sorted by open alerts, then asset count.

```json
[
  { "village": "Rampur", "totalAssets": 5, "operational": 4, "maintenance": 1, "inactive": 0, "openAlerts": 1 }
]
```

### Example: `GET /api/analytics/trends?days=3`

Days are UTC calendar days and include today. Days with no activity appear with zeros, so the series can be plotted directly.

```json
{
  "days": 3, "from": "2026-11-11", "to": "2026-11-13",
  "series": [
    { "date": "2026-11-11", "alerts": 0, "complaints": 1, "readings": 2 },
    { "date": "2026-11-12", "alerts": 1, "complaints": 0, "readings": 1 },
    { "date": "2026-11-13", "alerts": 0, "complaints": 0, "readings": 0 }
  ]
}
```

The numbers in these examples are illustrative; the shapes are exactly what the route returns.

## Files

```
analytics-api/
├── analytics-api.patch                    2 added lines in routes/api.js
└── backend/
    ├── routes/analytics.js                the router
    └── tests/analytics.test.js            10 tests, no database needed
```

## Install

From the repository root:

```bash
cp -r path/to/analytics-api/backend/. backend/
patch -p1 < path/to/analytics-api/analytics-api.patch
```

The patch adds these two lines to `backend/routes/api.js`; you can add them by hand instead:

```js
const analyticsRoutes = require('./analytics');
router.use('/analytics', analyticsRoutes);
```

Restart the backend (`npm start`) and open `http://localhost:3000/api/analytics/summary`.

Once deployed, the same paths are served under the production base URL from `docs/API.md` (for example `https://jalnavigator.prabhav.tech/api/analytics/summary`).

## Run the tests

```bash
cd backend
node --test tests/analytics.test.js
```

The tests mount the project's real `/api` router, so they also confirm the new route is wired in and the existing routes still respond. They replace the database with a small in-memory stand-in, so no PostgreSQL is required. Run them after installing, since they expect `routes/analytics.js` and the patched `routes/api.js` to be present.

## Notes

- Everything is read-only, so nothing here can change your data.
- The main endpoint list in `GET /api` and the API Explorer tab are left untouched. The Explorer only knows how to test the original routes, so listing the new ones there would show a misleading "requires payload" message. The analytics routes describe themselves at `GET /api/analytics`.
- Error handling follows the existing routes (`500` with `err.message`) to stay consistent with the codebase.
- Totals such as complaint counts are computed in the database with `groupBy`. The `/trends` and `/villages` endpoints do their final bucketing in JavaScript, which is fine at this project's data size. For very large tables you would push that into SQL.

## How this was verified

On a scratch copy of the uploaded repo, all 10 tests pass with the patch applied, and the patch applies cleanly to a pristine copy.

Not checked: running against a live PostgreSQL database, because Prisma's engine binaries couldn't be downloaded in the build environment. The route uses only standard Prisma calls (`groupBy` with `_count`, `_avg`, `_min` and `_max`, plus `findMany` and `count`), but run the four endpoints once against your seeded database to confirm.

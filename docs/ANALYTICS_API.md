# JalNavigator Analytics API

Read-only aggregates over assets, readings, alerts and complaints. All counting happens in the database.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/analytics` | Directory of the analytics endpoints |
| `GET` | `/api/analytics/summary` | Counts by asset type and status, complaint status and category, alert severity and status |
| `GET` | `/api/analytics/readings` | Per-asset min, average and max water level, flow rate and pressure |
| `GET` | `/api/analytics/villages` | Per-village asset health and open alert counts |
| `GET` | `/api/analytics/trends` | Daily alerts, complaints and readings, zero-filled |

These endpoints also appear in the directory at `GET /api`, so a client that reads that list finds them without being told about them.

**Query parameters (optional):**
- `/readings`: `days` (integer 1 to 365) limits readings to the **last N times 24 hours**, counted back from the moment of the request, and `assetId` (integer 1 to 2147483647) limits the result to one asset.
- `/trends`: `days` (integer 1 to 365, default 7), counted in **UTC calendar days** including today.

Invalid values return `400` with `{ "error": "..." }`. Readings dated in the future are ignored. Labels and statuses are matched without regard to case or surrounding whitespace, including tabs and newlines. A failed query returns `500` with `{ "error": "Failed to compute analytics" }` and the details are written to the server log as `[analytics] <endpoint> failed:`.

## Dates and time zones

Every statement runs in a transaction whose time zone is pinned to UTC, so a day is always a UTC day and the answers do not change with the server's or the database's local time zone. This holds whether the date columns are `timestamp` or `timestamptz`.

`/trends` buckets by UTC calendar day and its window starts at a UTC midnight. `/readings` uses a rolling window of `days` times 24 hours ending at the moment of the request, so it is not aligned to midnight.

## Load protection

These endpoints are unauthenticated, like the rest of the project, and each one aggregates over history. Four limits keep a burst of requests from exhausting the database:

| Limit | Default | Setting |
| :--- | :--- | :--- |
| Answers are cached for a few seconds and identical simultaneous requests share one query | 10 seconds | `ANALYTICS_CACHE_SECONDS` (`0` turns caching off) |
| Queries running at once; beyond this a request is refused rather than queued | 4 | `ANALYTICS_MAX_CONCURRENT` (`0` means no limit) |
| Time one statement may run in the database before it is cancelled | 5000 ms | `ANALYTICS_STATEMENT_TIMEOUT_MS` (`0` turns it off) |
| Assets returned by `/readings` | 1000 | `ANALYTICS_MAX_ASSET_ROWS` |

A refused request answers `503` with a `Retry-After` header:

```json
{ "error": "Analytics is busy with other requests. Please try again shortly.", "retryAfterSeconds": 1 }
```

Because answers may be up to `ANALYTICS_CACHE_SECONDS` old, a figure can lag a write by that many seconds. Set `ANALYTICS_CACHE_SECONDS=0` if a page must always show the newest numbers. `GET /api/analytics` never touches the database, so it is never cached, never refused and never stale.

## `GET /api/analytics/summary`

Counts for every table, read inside one `RepeatableRead` snapshot, so the totals agree with each other even while rows are being written. `resolvedPercent` is the share of complaints whose status is `Resolved`, in any case. Labels that collide with inherited object properties (`__proto__`, `constructor`) are counted correctly.

## `GET /api/analytics/readings`

Per-asset `readingCount`, `lowLevelReadings` (below `lowLevelThreshold`, 20) and the minimum, average and maximum of `waterLevel`, `flowRate` and `pressure`. Lowest average water level first, so the assets needing attention are at the top. `maxAssets` in the response says how many assets could be returned at most.

The `name`, `type`, `village` and `status` of each asset are returned exactly as they are stored, so a village saved with a stray tab comes back with it. Whitespace and case are ignored when labels are grouped or matched, which is what `/villages` does; this endpoint reports one row per asset and does not group.

## `GET /api/analytics/villages`

One row per village, matching names without regard to case or whitespace. Assets with a blank village and assets whose village is the literal text `Unassigned` are reported together as `Unassigned`.

```json
[
  { "village": "Rampur", "totalAssets": 6, "operational": 4, "maintenance": 1, "inactive": 0, "other": 1, "openAlerts": 3 }
]
```

`operational`, `maintenance`, `inactive` and `other` always add up to `totalAssets`. `other` holds assets with any further status, including a blank one, so no asset is silently left out of the health buckets. `openAlerts` counts alerts whose status is `Open`, in any case.

## `GET /api/analytics/trends`

```json
{
  "days": 3,
  "from": "2026-11-11",
  "to": "2026-11-13",
  "series": [
    { "date": "2026-11-11", "alerts": 0, "complaints": 1, "readings": 2 },
    { "date": "2026-11-12", "alerts": 1, "complaints": 0, "readings": 1 },
    { "date": "2026-11-13", "alerts": 0, "complaints": 0, "readings": 0 }
  ]
}
```

Every day in the window is present and a quiet day is a real `0`, never `null` or a missing key.

## Errors

| Code | Meaning |
| :--- | :--- |
| `400` | `days` or `assetId` is malformed or out of range. `{ "error": "..." }` says which. |
| `500` | The query failed. The caller gets `{ "error": "Failed to compute analytics" }`; details go to the server log. |
| `503` | Too many analytics queries are already running. Retry after the `Retry-After` header says. |

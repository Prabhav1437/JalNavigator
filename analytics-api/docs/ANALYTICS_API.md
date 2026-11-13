# JalNavigator Analytics API


Read-only aggregates over assets, readings, alerts and complaints. All counting happens in the database.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/analytics` | Directory of the analytics endpoints |
| `GET` | `/api/analytics/summary` | Counts by asset type and status, complaint status and category, alert severity and status |
| `GET` | `/api/analytics/readings` | Per-asset min, average and max water level, flow rate and pressure |
| `GET` | `/api/analytics/villages` | Per-village asset health and open alert counts |
| `GET` | `/api/analytics/trends` | Daily alerts, complaints and readings, zero-filled |

**Query parameters (optional):**
- `/readings`: `days` (integer 1 to 365) limits readings to the last N days, `assetId` (integer 1 to 2147483647) limits to one asset.
- `/trends`: `days` (integer 1 to 365, default 7), counted in UTC calendar days including today.

Invalid values return `400` with `{ "error": "..." }`. Readings dated in the future are ignored. Status values are matched case-insensitively. A failed query returns `500` with `{ "error": "Failed to compute analytics" }` and the details are written to the server log.

**`GET /api/analytics/trends?days=3` response `200 OK`**:
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

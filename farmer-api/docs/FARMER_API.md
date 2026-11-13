# JalNavigator Farmer API

Public, read-mostly endpoints for the people who use the water supply: farmers and villagers. They answer three questions in plain language: *Is my village's water supply working? Where is the nearest working water point? What happened to my complaint?*

Everything is under `/api/farmer`. All endpoints accept `?lang=en` (default) or `?lang=hi` and return the human-readable texts in that language. Any other `lang` returns `400`.

Sensor values are simulated for demonstration (see `agents.md`), so responses that include water levels carry `"readingsAreSimulated": true`.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/farmer` | Directory: languages, complaint categories and endpoints |
| `GET` | `/api/farmer/villages` | Villages with a water supply status |
| `GET` | `/api/farmer/villages/:name` | One village: status, water points and notices |
| `GET` | `/api/farmer/nearby` | Closest working water points to a location |
| `POST` | `/api/farmer/complaints` | Register a complaint |
| `GET` | `/api/farmer/complaints/:id` | Check a complaint's status |

---

## Village status

Each village gets one of three statuses, worked out from the existing assets, readings and alerts. Names are matched ignoring case and surrounding spaces, so `Rampur` and ` rampur ` are one village. Assets with a blank village or the literal village `Unassigned` are not listed as villages.

| Status | When |
| :--- | :--- |
| `problem` | An alert is open for one of its assets, **or** no asset is operational, **or** a working tank or borewell is below 20% |
| `low` | A working tank or borewell is below 40%, **or** an asset is under maintenance |
| `good` | None of the above |

Water level bands shown for each water point: `critical` (below 20%), `low` (below 40%), `medium` (below 70%), `good` (70% and above). The level is the newest reading that is not dated in the future.

### `GET /api/farmer/villages`

**Query parameters (optional):**
- `q`: village name prefix, case-insensitive (1 to 80 characters). Wildcard characters are treated as plain text.
- `limit`: 1 to 500 (default 100).

**Response `200 OK`**:
```json
{
  "lang": "en",
  "count": 2,
  "villages": [
    {
      "village": "Rampur",
      "status": "low",
      "message": "Water level is low or a water source is under maintenance. Please use water carefully.",
      "totalWaterPoints": 3,
      "workingWaterPoints": 2
    },
    {
      "village": "Sonpur",
      "status": "problem",
      "message": "A problem has been reported with the water supply in this village.",
      "totalWaterPoints": 1,
      "workingWaterPoints": 1
    }
  ]
}
```

### `GET /api/farmer/villages/:name`

Returns `404` when no village has that name. URL-encode names that contain spaces or non-Latin text (for example `/api/farmer/villages/%E0%A4%B0%E0%A4%BE%E0%A4%AE%E0%A4%AA%E0%A5%81%E0%A4%B0`).

**Response `200 OK`** (`?lang=hi`, shortened):
```json
{
  "lang": "hi",
  "village": "Rampur",
  "status": "low",
  "message": "पानी का स्तर कम है या कोई जल स्रोत मरम्मत में है। कृपया पानी सोच-समझकर इस्तेमाल करें।",
  "totalWaterPoints": 3,
  "workingWaterPoints": 2,
  "underMaintenance": 1,
  "openProblems": 0,
  "waterPoints": [
    {
      "id": 1,
      "name": "Rampur Central Overhead Tank",
      "type": "tank",
      "typeText": "पानी की टंकी",
      "working": true,
      "waterLevel": { "percent": 72, "band": "good", "text": "अच्छा", "updatedAt": "2026-11-13T19:54:01.245Z" },
      "mapUrl": "https://www.openstreetmap.org/?mlat=26.8467&mlon=80.9462#map=17/26.8467/80.9462"
    }
  ],
  "notices": [],
  "readingsAreSimulated": true
}
```

`waterLevel` is `null` for a water point with no reading. `notices` lists up to 5 open problems, newest first, each as `{ "severity", "since", "text" }`.

---

## Nearby water points

### `GET /api/farmer/nearby`

Working (`Operational`) tanks, borewells and pumps, nearest first. Pipelines and assets under maintenance are not listed. Distance is the straight-line (great-circle) distance in kilometres.

**Query parameters:**
- `lat` (required): -90 to 90, plain decimal number.
- `lng` (required): -180 to 180, plain decimal number.
- `radiusKm` (optional): 0.1 to 100 (default 10).
- `type` (optional): `tank`, `borewell` or `pump`.
- `limit` (optional): 1 to 20 (default 5).

**Response `200 OK`**:
```json
{
  "lang": "en",
  "query": { "lat": 26.845, "lng": 80.945, "radiusKm": 10, "type": null, "limit": 2 },
  "count": 2,
  "waterPoints": [
    {
      "id": 1,
      "name": "Rampur Central Overhead Tank",
      "type": "tank",
      "typeText": "Water tank",
      "village": "Rampur",
      "distanceKm": 0.22,
      "waterLevel": { "percent": 72, "band": "good", "text": "Good", "updatedAt": "2026-11-13T19:54:01.245Z" },
      "latitude": 26.8467,
      "longitude": 80.9462,
      "mapUrl": "https://www.openstreetmap.org/?mlat=26.8467&mlon=80.9462#map=17/26.8467/80.9462"
    }
  ],
  "readingsAreSimulated": true
}
```

---

## Complaints

### `POST /api/farmer/complaints`

Creates a normal complaint, so it appears in the existing Complaints screen, `GET /api/complaints` and the dashboard counts, where officers can change its status.

**Request body**:
```json
{
  "category": "Dirty water",
  "description": "Hand pump water is brown",
  "village": "Rampur",
  "latitude": 26.8467,
  "longitude": 80.9462
}
```

| Field | Required | Rules |
| :--- | :--- | :--- |
| `description` | yes | 5 to 500 characters |
| `category` | no | One of `Pipeline leakage`, `No water supply`, `Dirty water`, `Low water pressure`, `Damaged infrastructure`, `Other` (case-insensitive, default `Other`) |
| `village` | no | Up to 80 characters; stored in the complaint title as `Category - Village` |
| `latitude`, `longitude` | no | Send both or neither; latitude -90 to 90, longitude -180 to 180 |

Control characters (such as a null byte) are removed from text before saving.

**Response `201 Created`**:
```json
{
  "lang": "en",
  "complaintId": 1,
  "status": "Pending",
  "message": "Your complaint has been registered. Keep your complaint number to check its status.",
  "trackPath": "/api/farmer/complaints/1"
}
```

**Rate limit:** each client address may register 20 complaints per 15 minutes. Beyond that the API answers `429` with a `Retry-After` header and `{ "error": "...", "retryAfterSeconds": 600 }`. Set `FARMER_COMPLAINT_LIMIT` and `FARMER_COMPLAINT_WINDOW_MINUTES` to change it, or `FARMER_COMPLAINT_LIMIT=0` to switch it off.

### `GET /api/farmer/complaints/:id`

Looks a complaint up by its number. Only safe fields are returned: the description and location are never included. Works for any complaint, including ones registered through `POST /api/complaints`.

**Response `200 OK`**:
```json
{
  "lang": "en",
  "complaintId": 1,
  "title": "Dirty water - Rampur",
  "category": "Dirty water",
  "status": "Pending",
  "message": "Your complaint has been received and is waiting for review.",
  "createdAt": "2026-11-13T20:04:03.387Z"
}
```

`status` is the stored value (`Pending`, `In Progress`, `Resolved`, or any other text an officer set). Unknown values get a neutral message.

---

## Errors

| Code | Meaning |
| :--- | :--- |
| `400` | A parameter or body field is missing or invalid. `{ "error": "..." }` says which. |
| `404` | Unknown village or complaint number. |
| `429` | Complaint rate limit reached (see above). |
| `500` | Database failure. The caller gets `{ "error": "Something went wrong. Please try again later." }`; the details are written to the server log as `[farmer] <endpoint> failed:`. |

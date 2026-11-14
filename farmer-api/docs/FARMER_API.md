# JalNavigator Farmer API

Public, read-mostly endpoints for the people who use the water supply: farmers and villagers. They answer three questions in plain language: *Is my village's water supply working? Where is the nearest working water point? What happened to my complaint?*

Everything is under `/api/farmer`. All endpoints, the directory included, accept `?lang=en` (default) or `?lang=hi` and return the human-readable texts in that language. Any other `lang` returns `400`.

Sensor values are simulated for demonstration (see `agents.md`), so responses that include water levels carry `"readingsAreSimulated": true`.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/farmer` | Directory: languages, complaint categories and endpoint descriptions in the requested language |
| `GET` | `/api/farmer/villages` | Villages with a water supply status |
| `GET` | `/api/farmer/villages/:name` | One village: status, water points and notices |
| `GET` | `/api/farmer/nearby` | Closest working water points to a location |
| `POST` | `/api/farmer/complaints` | Register a complaint; returns a complaint number and a tracking code |
| `GET` | `/api/farmer/complaints/:id` | Check a complaint's status (needs the tracking code) |

---

## Village status

Each village gets one of four statuses, worked out from the existing assets, readings and alerts. Names are matched ignoring case and surrounding spaces, so `Rampur` and ` rampur ` are one village. Assets with a blank village or the literal village `Unassigned` are not listed as villages.

| Status | When |
| :--- | :--- |
| `problem` | An alert is open for one of its assets, **or** no asset is operational, **or** a working tank or borewell is below 20% |
| `low` | A working tank or borewell is below 40%, **or** an asset is under maintenance |
| `unknown` | None of the above, but no asset in the village has a sensor reading yet (readings dated in the future do not count) |
| `good` | None of the above, and at least one asset has a reading |

An open alert counts only once it has been created: alerts dated after the moment of the request are ignored everywhere, so a `problem` village always has a matching entry in `notices`.

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

Working (`Operational`) tanks, borewells and pumps, nearest first. Pipelines and assets under maintenance are not listed. Assets whose stored coordinates are impossible (latitude outside -90 to 90, longitude outside -180 to 180, or not a number) are skipped, and in a village detail such a water point has `"mapUrl": null`. Distance is the straight-line (great-circle) distance in kilometres.

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

A complaint is a normal row in the existing complaint table, so it appears in the existing Complaints screen, `GET /api/complaints` and the dashboard counts, where officers can change its status. What the farmer gets back is a **complaint number** and a secret **tracking code**. Both are needed to read the status: complaint numbers are sequential and easy to guess, the tracking code is not.

### `POST /api/farmer/complaints`

**Headers (optional):**
- `Idempotency-Key`: 16 to 64 letters, digits, `-` or `_`; a random UUID works. Send the same key when you retry the same complaint after a timeout or a dropped connection and you get the original complaint back instead of a duplicate (see below).

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
| `latitude`, `longitude` | no | Send both or neither; latitude -90 to 90, longitude -180 to 180. `0` is a valid value and is kept. |

Control characters (such as a null byte) are removed from text before saving. A body that is not valid JSON gets `400` with `{ "error": "The request body is not valid JSON." }`, and one larger than the server's body limit gets `413` with `{ "error": "The request body is too large." }`, both as JSON.

**Response `201 Created`**:
```json
{
  "lang": "en",
  "complaintId": 1,
  "status": "Pending",
  "message": "Your complaint has been registered. Keep your complaint number and tracking code to check its status.",
  "trackPath": "/api/farmer/complaints/1",
  "trackingToken": "tf5TkYp1b7DYWHUwE3kvyYEXT3fzTTip"
}
```

The tracking code is returned here and again on an idempotent replay. It is never returned by any other endpoint, so show it to the farmer once and ask them to keep it.

**Retries with an `Idempotency-Key`:**

| Situation | Answer |
| :--- | :--- |
| First request with the key | `201`, the complaint is stored |
| Same key, same complaint again (also when sent at the same moment) | `200` with the same `complaintId` and `trackingToken` and `"replayed": true`; nothing new is stored |
| Same key, different complaint | `422`; nothing is stored |
| No `Idempotency-Key` header | Every request creates a new complaint |

"Same complaint" means the same category, description, village and location after cleaning, so extra spaces do not make a retry look different.

**Rate limit:** each client address may register 20 complaints per 15 minutes; a replay counts as a request. The allowance is kept in the database, so it is shared by every server process and survives restarts. IPv6 clients are counted by their /64 network. Beyond the limit the API answers `429` with a `Retry-After` header and `{ "error": "...", "retryAfterSeconds": 600 }`. Set `FARMER_COMPLAINT_LIMIT` and `FARMER_COMPLAINT_WINDOW_MINUTES` to change it, or `FARMER_COMPLAINT_LIMIT=0` to switch it off.

### `GET /api/farmer/complaints/:id`

Looks a complaint up by its number. The tracking code goes in the `X-Complaint-Token` header (a `?token=` query parameter also works, but URLs end up in logs, so prefer the header). Only safe fields are returned: the description and location are never included.

Only complaints registered through `POST /api/farmer/complaints` have a tracking code. Complaints registered through the officer endpoint `POST /api/complaints` cannot be read here.

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

A missing code is `401`. A wrong code and a complaint number that does not exist both give the same `404`, so the answer does not reveal which numbers are in use.

---

## Errors

| Code | Meaning |
| :--- | :--- |
| `400` | A parameter or body field is missing or invalid. `{ "error": "..." }` says which. |
| `401` | A complaint lookup without a tracking code. |
| `404` | Unknown village, or a complaint number and tracking code that do not match. |
| `413` | Request body too large (JSON). |
| `422` | An `Idempotency-Key` that was already used for a different complaint. |
| `429` | Complaint rate limit reached (see above). |
| `500` | Database failure. The caller gets `{ "error": "Something went wrong. Please try again later." }`; the details are written to the server log as `[farmer] <endpoint> failed:`. |

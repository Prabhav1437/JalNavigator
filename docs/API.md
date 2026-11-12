# REST API Specification - JalNavigator

## Base URL

- **Production:** `https://jalnavigator.prabhav.tech/api`
- **Local Development:** `http://localhost:3000/api`

---

## Endpoints Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api` | API health check and endpoint directory |
| `GET` | `/api/dashboard` | High-level metrics for dashboard cards and activity feeds |
| `GET` | `/api/assets` | Retrieve registered water assets with optional filters |
| `POST` | `/api/assets` | Register a new water asset |
| `PUT` | `/api/assets/:id` | Update an existing asset |
| `DELETE` | `/api/assets/:id` | Delete an asset and cascade cleanup |
| `GET` | `/api/complaints` | Retrieve complaints with optional status filter |
| `POST` | `/api/complaints` | Register a new grievance complaint |
| `PUT` | `/api/complaints/:id` | Update complaint status |
| `GET` | `/api/sensors` | Retrieve recent sensor telemetry stream |
| `POST` | `/api/sensors/simulate` | Generate simulated telemetry readings and threshold alerts |
| `GET` | `/api/alerts` | Retrieve active and resolved alerts |
| `PUT` | `/api/alerts/:id` | Update alert status |

---

## 1. System Health & Directory

### `GET /api`
Returns server operational status and directory of available endpoints.

**Response `200 OK`**:
```json
{
  "name": "JalNavigator REST API",
  "version": "1.0.0",
  "status": "healthy",
  "timestamp": "2026-11-12T07:25:00.000Z",
  "endpoints": [
    {
      "method": "GET",
      "path": "/api",
      "description": "API health and endpoint directory"
    }
  ]
}
```

---

## 2. Dashboard

### `GET /api/dashboard`
Returns total counts and latest activity items.

**Response `200 OK`**:
```json
{
  "waterTanks": 1,
  "borewells": 2,
  "pipelines": 1,
  "totalComplaints": 3,
  "pendingComplaints": 1,
  "unresolvedAlerts": 1,
  "recentAlerts": [
    {
      "id": 1,
      "assetId": 1,
      "message": "Critical low water level (15.5%) detected at Rampur Central Overhead Tank",
      "severity": "Critical",
      "status": "Open",
      "createdAt": "2026-11-10T08:55:09.608Z",
      "asset": {
        "id": 1,
        "name": "Rampur Central Overhead Tank",
        "type": "tank",
        "latitude": 26.8467,
        "longitude": 80.9462,
        "status": "Operational",
        "village": "Rampur"
      }
    }
  ],
  "recentComplaints": [
    {
      "id": 1,
      "title": "Severe pipeline leakage near primary school",
      "category": "Pipeline leakage",
      "description": "Main distribution pipe is leaking clean drinking water onto the street.",
      "latitude": 26.8475,
      "longitude": 80.947,
      "status": "Pending",
      "createdAt": "2026-11-10T08:55:09.605Z"
    }
  ]
}
```

---

## 3. Water Infrastructure Assets

### `GET /api/assets`
Returns assets list.

**Query Parameters (Optional):**
- `type`: Filter by asset type (`tank`, `borewell`, `pump`, `pipeline`)
- `village`: Filter by village name

**Response `200 OK`**:
```json
[
  {
    "id": 1,
    "name": "Rampur Central Overhead Tank",
    "type": "tank",
    "latitude": 26.8467,
    "longitude": 80.9462,
    "status": "Operational",
    "village": "Rampur"
  }
]
```

### `POST /api/assets`
Registers a new asset.

**Request Body**:
```json
{
  "name": "East Ward Borewell",
  "type": "borewell",
  "village": "Rampur",
  "latitude": 26.8520,
  "longitude": 80.9510,
  "status": "Operational"
}
```

**Response `201 Created`**:
```json
{
  "id": 6,
  "name": "East Ward Borewell",
  "type": "borewell",
  "latitude": 26.852,
  "longitude": 80.951,
  "status": "Operational",
  "village": "Rampur"
}
```

### `PUT /api/assets/:id`
Updates an existing asset.

**Request Body**:
```json
{
  "status": "Maintenance"
}
```

### `DELETE /api/assets/:id`
Deletes an asset and associated telemetry/alert records.

**Response `200 OK`**:
```json
{
  "message": "Asset deleted successfully",
  "id": 6
}
```

---

## 4. Grievance Complaints

### `GET /api/complaints`
Returns complaints list.

**Query Parameters (Optional):**
- `status`: Filter by status (`Pending`, `In Progress`, `Resolved`)

### `POST /api/complaints`
Submits a citizen grievance.

**Request Body**:
```json
{
  "title": "Low water pressure in Ward 3",
  "category": "Low water pressure",
  "description": "Very weak flow from municipal taps since morning.",
  "latitude": 26.8450,
  "longitude": 80.9520
}
```

### `PUT /api/complaints/:id`
Updates complaint status.

**Request Body**:
```json
{
  "status": "In Progress"
}
```

---

## 5. Telemetry & Sensors

### `GET /api/sensors`
Returns telemetry readings in descending chronological order.

### `POST /api/sensors/simulate`
Generates simulated telemetry values (water level, flow rate, pressure). Automatically triggers a critical alert if `waterLevel < 20%`.

**Request Body (Optional)**:
```json
{
  "assetId": 1
}
```

**Response `201 Created`**:
```json
{
  "reading": {
    "id": 14,
    "assetId": 1,
    "waterLevel": 16.4,
    "flowRate": 18.2,
    "pressure": 1.5,
    "recordedAt": "2026-11-12T07:20:00.000Z"
  },
  "alert": {
    "id": 5,
    "assetId": 1,
    "message": "Critical low water level (16.4%) detected at Rampur Central Overhead Tank",
    "severity": "Critical",
    "status": "Open",
    "createdAt": "2026-11-12T07:20:00.000Z"
  }
}
```

---

## 6. Alerts

### `GET /api/alerts`
Returns system anomaly alerts.

### `PUT /api/alerts/:id`
Resolves an alert.

**Request Body**:
```json
{
  "status": "Resolved"
}
```


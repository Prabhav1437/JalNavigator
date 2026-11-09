# Agent Guidelines - JalNavigator

## Reference Document

If you are getting confused at any point, refer to `JalNavigator_PRD.md`.
That document contains the complete Product Requirements Document (PRD), specifications, user flows, database schemas, and acceptance criteria for JalNavigator.

---

## Project Overview

JalNavigator is a lightweight web application designed for rural drinking-water infrastructure mapping and monitoring.
It includes:
- GIS mapping of water assets using Leaflet and OpenStreetMap.
- Asset management (tanks, borewells, pumps, pipelines).
- Simulated sensor monitoring and automated alert generation.
- Citizen grievance registration and status tracking.
- Central administrator dashboard.

---

## Strict Coding Conventions

1. **No Comments in Code:** Do not include comments (`//`, `/* */`, `<!-- -->`, `#`) anywhere in the code across any file. The code must be self-explanatory, clean, and concise.
2. **Simplicity First:** Keep the implementation simple and direct. Avoid premature optimizations, complex abstractions, or heavy external frameworks.
3. **Vanilla Frontend:** Use standard HTML5, CSS3, and modern vanilla JavaScript without frontend build tools or bundlers.
4. **Express Backend:** Modular REST API endpoints organized under `backend/routes/`.
5. **No Physical Hardware:** All IoT sensor values and alerts are strictly simulated for demonstration purposes.

---

## Project Structure

```
jalnavigator/
├── backend/
│   ├── server.js
│   ├── database.js
│   ├── package.json
│   └── routes/
│       ├── dashboard.js
│       ├── assets.js
│       ├── complaints.js
│       ├── sensors.js
│       └── alerts.js
├── frontend/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js
│       ├── dashboard.js
│       ├── map.js
│       ├── monitoring.js
│       └── complaints.js
├── .gitignore
├── agents.md
└── README.md
```

---

## API Endpoints

- `GET /api/dashboard` - Summary statistics for assets, complaints, and alerts.
- `GET /api/assets` - List all water assets.
- `POST /api/assets` - Register a new asset.
- `PUT /api/assets/:id` - Update an existing asset.
- `DELETE /api/assets/:id` - Delete an asset.
- `GET /api/complaints` - List complaints.
- `POST /api/complaints` - Register a new complaint.
- `PUT /api/complaints/:id` - Update complaint status (Pending, In Progress, Resolved).
- `GET /api/sensors` - Fetch latest sensor readings.
- `POST /api/sensors/simulate` - Generate simulated sensor readings.
- `GET /api/alerts` - List active alerts.

---

## Core Entities

- **Asset:** `id`, `name`, `type`, `latitude`, `longitude`, `status`, `village`
- **Complaint:** `id`, `title`, `category`, `description`, `latitude`, `longitude`, `status`, `created_at`
- **Sensor Reading:** `id`, `asset_id`, `water_level`, `flow_rate`, `pressure`, `recorded_at`
- **Alert:** `id`, `asset_id`, `message`, `severity`, `status`, `created_at`

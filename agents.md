# Agent Guidelines - JalNavigator

## Reference Document

If you are getting confused at any point, refer to `JalNavigator_PRD.md`.
That document contains the complete Product Requirements Document (PRD), specifications, user flows, database schemas, and acceptance criteria for JalNavigator.

---

## Project Overview

JalNavigator is a lightweight web application designed for rural drinking-water infrastructure mapping and monitoring.
It combines:
- GIS mapping of water infrastructure assets using Leaflet and OpenStreetMap.
- Asset management (water tanks, borewells, pumps, pipelines).
- Simulated IoT sensor monitoring (water level, flow rate, pressure) and threshold alerts.
- Citizen grievance registration and status tracking.
- Central administrator dashboard.

---

## Technology Stack

- **Frontend:** React, Vite, CSS3, Leaflet, OpenStreetMap
- **Backend:** Node.js, Express.js
- **Database & ORM:** PostgreSQL with Prisma ORM

---

## Strict Coding Conventions

1. **No Comments in Code:** Do not include comments (`//`, `/* */`, `<!-- -->`, `#`) anywhere in the code across any file. The code must be self-explanatory, clean, and concise.
2. **Simplicity First:** Keep the implementation simple and direct. Avoid premature optimizations, complex abstractions, or heavy external frameworks.
3. **Prisma ORM:** All database access must go through Prisma Client. Database models are defined in `backend/prisma/schema.prisma`.
4. **React Frontend:** Use clean functional components with standard React hooks (`useState`, `useEffect`, `useRef`) and Vite without unnecessary state management libraries.
5. **Modular Express Backend:** REST API endpoints organized under `backend/routes/`.
6. **Simulated IoT:** All IoT sensor values and alerts are strictly simulated for demonstration purposes and clearly distinguished from real data.

---

## Project Structure

```
jalnavigator/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.js
│   │   └── seed-osm.js
│   ├── routes/
│   │   ├── api.js
│   │   ├── dashboard.js
│   │   ├── assets.js
│   │   ├── complaints.js
│   │   ├── sensors.js
│   │   └── alerts.js
│   ├── .env.example
│   ├── database.js
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── MapView.jsx
│   │   │   ├── Monitoring.jsx
│   │   │   ├── Complaints.jsx
│   │   │   └── ApiExplorer.jsx
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── App.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── DATABASE.md
├── .gitignore
├── agents.md
└── README.md
```

---

## Database Models (Prisma)

- **Asset:** `id`, `name`, `type`, `latitude`, `longitude`, `status`, `village`, `sensorReadings`, `alerts`
- **Complaint:** `id`, `title`, `category`, `description`, `latitude`, `longitude`, `status`, `createdAt`
- **SensorReading:** `id`, `assetId`, `waterLevel`, `flowRate`, `pressure`, `recordedAt`, `asset`
- **Alert:** `id`, `assetId`, `message`, `severity`, `status`, `createdAt`, `asset`

---

## API Endpoints

- `GET /api` - API health check and endpoint directory.
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
- `PUT /api/alerts/:id` - Update alert status (Open, Resolved).

# JalNavigator

Smart Rural Drinking Water Supply Mapping & Telemetry Monitoring System.

**Live Deployment:** [https://jalnavigator.prabhav.tech](https://jalnavigator.prabhav.tech)  
**API Health & Directory:** [https://jalnavigator.prabhav.tech/api](https://jalnavigator.prabhav.tech/api)

JalNavigator is a web application designed for rural water authorities, field maintenance workers, and citizens. It centralizes GIS-based asset mapping, simulated IoT telemetry monitoring, automated threshold alerts, and grievance redressal into a unified system.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Client["Frontend Client (React 19 + Vite)"]
        Dashboard["Admin Dashboard"]
        GISMap["Leaflet GIS Map"]
        Telemetry["IoT Telemetry Stream"]
        Grievance["Grievance Portal"]
        Explorer["API Explorer"]
        ApiClient["API Client (services/api.js)"]
    end

    subgraph Server["Backend Server (Node.js + Express)"]
        ApiRouter["Master API Router (/api)"]
        Controllers["Module Controllers"]
    end

    subgraph Database["Database Tier (PostgreSQL + Prisma ORM)"]
        Prisma["Prisma ORM Client"]
        Postgres[("PostgreSQL Database")]
    end

    Dashboard --> ApiClient
    GISMap --> ApiClient
    Telemetry --> ApiClient
    Grievance --> ApiClient
    Explorer --> ApiClient

    ApiClient -->|HTTP JSON| ApiRouter
    ApiRouter --> Controllers
    Controllers --> Prisma
    Prisma --> Postgres
```

---

## Entity-Relationship (ER) Model

```mermaid
erDiagram
    Asset ||--o{ SensorReading : "records telemetry"
    Asset ||--o{ Alert : "triggers anomaly"

    Asset {
        Int id PK "Unique asset identifier"
        String name "Descriptive asset name"
        String type "tank, borewell, pump, pipeline"
        Float latitude "Geographic coordinate"
        Float longitude "Geographic coordinate"
        String status "Operational, Maintenance, Inactive"
        String village "Target habitation/village"
    }

    Complaint {
        Int id PK "Unique grievance identifier"
        String title "Summary of problem"
        String category "Grievance classification"
        String description "Detailed description"
        Float latitude "Optional coordinate"
        Float longitude "Optional coordinate"
        String status "Pending, In Progress, Resolved"
        DateTime createdAt "Submission timestamp"
    }

    SensorReading {
        Int id PK "Unique telemetry reading identifier"
        Int assetId FK "References Asset.id"
        Float waterLevel "Water capacity percentage"
        Float flowRate "Delivery rate (L/min)"
        Float pressure "Pipeline pressure (bar)"
        DateTime recordedAt "Telemetry timestamp"
    }

    Alert {
        Int id PK "Unique alert identifier"
        Int assetId FK "References Asset.id"
        String message "Alert notification text"
        String severity "Critical or Warning"
        String status "Open or Resolved"
        DateTime createdAt "Trigger timestamp"
    }
```

Detailed database documentation, schema specifications, and constraints are available in [docs/DATABASE.md](docs/DATABASE.md).

---

## Core Functional Modules

### 1. Central Admin Dashboard
- Live count of registered water tanks, borewells, and pipeline networks.
- Real-time tally of pending citizen grievances and unresolved alerts.
- Live stream of recent system alerts and reported grievances.

### 2. GIS Infrastructure Mapping (Leaflet & OpenStreetMap)
- Color-coded markers for different asset types:
  - **Water Tanks:** Blue markers
  - **Borewells:** Green markers
  - **Pumps:** Orange markers
  - **Pipelines:** Purple markers and connected network lines
- Click anywhere on the map to automatically populate latitude and longitude coordinates.
- Filter map assets in real time by asset type and village name.
- Complete CRUD: register new assets, edit existing assets, and delete assets with cascade cleanup.

### 3. Water Telemetry Monitoring & Alerts (Simulated IoT)
- Telemetry simulation engine generating water level (%), flow rate (L/min), and water pressure (bar).
- Visual trend chart showing historical water level fluctuations over time with a 20% critical threshold marker.
- Automated alert trigger: when water level drops below 20%, an anomaly alert is created.
- Administrative alert management with one-click resolution.
- Clear disclosure banners highlighting simulated telemetry.

### 4. Citizen Grievance Management
- Form for reporting water supply disruptions (Pipeline leakage, No water supply, Dirty water, Low pressure, Damaged infrastructure).
- Filter grievances by workflow status (`Pending`, `In Progress`, `Resolved`).
- Direct status transitions for administrators and field workers.

### 5. Interactive REST API Explorer
- Built-in API console inspecting available backend endpoints.
- Real-time backend connectivity status indicator.
- Live JSON response inspection.

---

## Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19, Vite | Single-page application UI |
| **Mapping Engine** | Leaflet, OpenStreetMap | Spatial GIS infrastructure visualization |
| **Backend Framework** | Node.js, Express.js | Modular REST API server |
| **Database & ORM** | PostgreSQL, Prisma ORM | Relational data persistence & migrations |
| **Styling** | Modern CSS3 | Responsive layouts and visual badges |

---

## Project Structure

```text
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

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm
- PostgreSQL database

---

### Step 1: Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Copy the environment configuration:
   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your PostgreSQL connection URL:
   ```env
   PORT=3000
   DATABASE_URL="postgresql://username:password@localhost:5432/jalnavigator?schema=public"
   ```

4. Install backend dependencies:
   ```bash
   npm install
   ```

5. Push the Prisma schema to the database:
   ```bash
   npx prisma db push
   ```

6. Seed sample village infrastructure and grievance records:
   ```bash
   npm run seed
   ```

   To import a wider real-world dataset directly from OpenStreetMap Overpass API:
   ```bash
   npm run seed:osm
   ```

7. Start the backend server:
   ```bash
   npm start
   ```

---

### Step 2: Frontend Setup (Development Mode)

In a new terminal window:

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Launch the Vite development server:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:5173` in your browser. All API requests are automatically proxied to `http://localhost:3000`.

---

### Step 3: Production Build

To build the React application for production and serve everything from Express:

1. Build the React frontend:
   ```bash
   cd frontend
   npm run build
   ```

2. Start the Express server:
   ```bash
   cd ../backend
   npm start
   ```

3. Open `http://localhost:3000` in your browser.

---

## API Reference Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api` | API health check and endpoint directory |
| `GET` | `/api/dashboard` | Aggregated dashboard statistics and recent activity |
| `GET` | `/api/assets` | List water assets (supports `?type=` and `?village=`) |
| `POST` | `/api/assets` | Register a new water asset |
| `PUT` | `/api/assets/:id` | Update an existing asset |
| `DELETE` | `/api/assets/:id` | Delete an asset and related records |
| `GET` | `/api/complaints` | List citizen complaints (supports `?status=`) |
| `POST` | `/api/complaints` | Register a new grievance |
| `PUT` | `/api/complaints/:id` | Update grievance status |
| `GET` | `/api/sensors` | List latest sensor readings |
| `POST` | `/api/sensors/simulate` | Generate simulated readings and evaluate alerts |
| `GET` | `/api/alerts` | List system alerts |
| `PUT` | `/api/alerts/:id` | Update alert status |

Full API specifications with request and response payloads are available in [docs/API.md](docs/API.md).

---

## Documentation

- [System Architecture](docs/ARCHITECTURE.md)
- [REST API Specifications](docs/API.md)
- [Database & ER Modeling](docs/DATABASE.md)
- [Agent Guidelines](agents.md)

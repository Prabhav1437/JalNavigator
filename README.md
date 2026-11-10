# JalNavigator

Smart Rural Water Supply Mapping & Monitoring System.

JalNavigator is a web application designed to help rural water authorities view, monitor, and manage drinking-water infrastructure.

## Modules

- **Dashboard:** Centralized operational overview with infrastructure and complaint statistics.
- **GIS Map:** Interactive Leaflet map displaying water infrastructure assets (tanks, borewells, pumps, pipelines).
- **Water Monitoring:** Simulated IoT sensor readings (water level, flow rate, pressure) and threshold alerts.
- **Complaint Management:** Citizen grievance submission and status tracking (Pending, In Progress, Resolved).

## Tech Stack

- **Frontend:** React 19, Vite, Leaflet, CSS3
- **Backend:** Node.js, Express.js
- **Database & ORM:** PostgreSQL with Prisma ORM

## Project Structure

```
jalnavigator/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── routes/
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
│   │   │   └── Complaints.jsx
│   │   ├── App.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── .gitignore
├── agents.md
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm
- PostgreSQL database

### 1. Backend Setup

```bash
cd backend
cp .env.example .env
npm install
npx prisma db push
npm run seed
npm start
```

### 2. Frontend Development Setup

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` for Vite hot-module reloading with API proxy to the backend.

### 3. Production Build

To build the React application for Express production serving:

```bash
cd frontend
npm run build
cd ../backend
npm start
```

Open `http://localhost:3000`.

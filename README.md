# JalNavigator

Smart Rural Water Supply Mapping & Monitoring System.

JalNavigator is a web application designed to help rural water authorities view, monitor, and manage drinking-water infrastructure.

## Modules

- **Dashboard:** Centralized operational overview with infrastructure and complaint statistics.
- **GIS Map:** Interactive map displaying water infrastructure assets (tanks, borewells, pumps, pipelines).
- **Water Monitoring:** Simulated IoT sensor readings (water level, flow rate, pressure) and threshold alerts.
- **Complaint Management:** Citizen grievance submission and status tracking (Pending, In Progress, Resolved).

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

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm

### Installation & Run

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

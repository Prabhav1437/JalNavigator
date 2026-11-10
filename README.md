# JalNavigator

Smart Rural Water Supply Mapping & Monitoring System.

JalNavigator is a web application designed to help rural water authorities view, monitor, and manage drinking-water infrastructure.

## Modules

- **Dashboard:** Centralized operational overview with infrastructure and complaint statistics.
- **GIS Map:** Interactive map displaying water infrastructure assets (tanks, borewells, pumps, pipelines).
- **Water Monitoring:** Simulated IoT sensor readings (water level, flow rate, pressure) and threshold alerts.
- **Complaint Management:** Citizen grievance submission and status tracking (Pending, In Progress, Resolved).

## Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript, Leaflet, Chart.js
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
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── app.js
│   │   ├── dashboard.js
│   │   ├── map.js
│   │   ├── monitoring.js
│   │   └── complaints.js
│   └── index.html
├── .gitignore
├── agents.md
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm
- PostgreSQL database

### Installation & Run

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Copy environment file and set your database connection:
   ```bash
   cp .env.example .env
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Generate Prisma client and push schema:
   ```bash
   npx prisma db push
   ```

5. Seed sample demonstration data:
   ```bash
   npm run seed
   ```

6. Start the server:
   ```bash
   npm start
   ```

7. Open your browser:
   ```
   http://localhost:3000
   ```

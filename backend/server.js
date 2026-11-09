const express = require('express');
const cors = require('cors');
const path = require('path');

const dashboardRoutes = require('./routes/dashboard');
const assetsRoutes = require('./routes/assets');
const complaintsRoutes = require('./routes/complaints');
const sensorsRoutes = require('./routes/sensors');
const alertsRoutes = require('./routes/alerts');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/complaints', complaintsRoutes);
app.use('/api/sensors', sensorsRoutes);
app.use('/api/alerts', alertsRoutes);

app.listen(PORT, () => {
  console.log(`JalNavigator running on http://localhost:${PORT}`);
});

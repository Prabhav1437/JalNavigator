const express = require('express');
const router = express.Router();

const dashboardRoutes = require('./dashboard');
const assetsRoutes = require('./assets');
const complaintsRoutes = require('./complaints');
const sensorsRoutes = require('./sensors');
const alertsRoutes = require('./alerts');

router.get('/', (req, res) => {
  res.json({
    name: 'JalNavigator REST API',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    endpoints: [
      { method: 'GET', path: '/api', description: 'API health and endpoint directory' },
      { method: 'GET', path: '/api/dashboard', description: 'Summary statistics for assets, complaints, and alerts' },
      { method: 'GET', path: '/api/assets', description: 'List water assets with optional type and village filters' },
      { method: 'POST', path: '/api/assets', description: 'Register a new infrastructure asset' },
      { method: 'PUT', path: '/api/assets/:id', description: 'Update an existing asset' },
      { method: 'DELETE', path: '/api/assets/:id', description: 'Delete an asset' },
      { method: 'GET', path: '/api/complaints', description: 'List complaints with optional status filter' },
      { method: 'POST', path: '/api/complaints', description: 'Register a new citizen grievance complaint' },
      { method: 'PUT', path: '/api/complaints/:id', description: 'Update complaint status' },
      { method: 'GET', path: '/api/sensors', description: 'Fetch latest sensor telemetry readings' },
      { method: 'POST', path: '/api/sensors/simulate', description: 'Generate simulated sensor readings and threshold alerts' },
      { method: 'GET', path: '/api/alerts', description: 'List active and resolved alerts' },
      { method: 'PUT', path: '/api/alerts/:id', description: 'Update alert status' }
    ]
  });
});

router.use('/dashboard', dashboardRoutes);
router.use('/assets', assetsRoutes);
router.use('/complaints', complaintsRoutes);
router.use('/sensors', sensorsRoutes);
router.use('/alerts', alertsRoutes);

module.exports = router;

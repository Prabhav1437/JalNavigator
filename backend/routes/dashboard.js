const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const waterTanks = db.assets.filter(a => a.type && a.type.toLowerCase() === 'tank').length;
  const borewells = db.assets.filter(a => a.type && a.type.toLowerCase() === 'borewell').length;
  const pipelines = db.assets.filter(a => a.type && a.type.toLowerCase() === 'pipeline').length;
  const totalComplaints = db.complaints.length;
  const pendingComplaints = db.complaints.filter(c => c.status === 'Pending').length;
  const unresolvedAlerts = db.alerts.filter(al => al.status === 'Open').length;

  res.json({
    waterTanks,
    borewells,
    pipelines,
    totalComplaints,
    pendingComplaints,
    unresolvedAlerts
  });
});

module.exports = router;

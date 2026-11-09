const express = require('express');
const router = express.Router();
const prisma = require('../database');

router.get('/', async (req, res) => {
  try {
    const waterTanks = await prisma.asset.count({
      where: { type: 'tank' }
    });
    const borewells = await prisma.asset.count({
      where: { type: 'borewell' }
    });
    const pipelines = await prisma.asset.count({
      where: { type: 'pipeline' }
    });
    const totalComplaints = await prisma.complaint.count();
    const pendingComplaints = await prisma.complaint.count({
      where: { status: 'Pending' }
    });
    const unresolvedAlerts = await prisma.alert.count({
      where: { status: 'Open' }
    });

    res.json({
      waterTanks,
      borewells,
      pipelines,
      totalComplaints,
      pendingComplaints,
      unresolvedAlerts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const prisma = require('../database');

router.get('/', async (req, res) => {
  try {
    const [
      waterTanks,
      borewells,
      pipelines,
      totalComplaints,
      pendingComplaints,
      unresolvedAlerts,
      recentAlerts,
      recentComplaints
    ] = await Promise.all([
      prisma.asset.count({
        where: { type: { equals: 'tank', mode: 'insensitive' } }
      }),
      prisma.asset.count({
        where: { type: { equals: 'borewell', mode: 'insensitive' } }
      }),
      prisma.asset.count({
        where: { type: { equals: 'pipeline', mode: 'insensitive' } }
      }),
      prisma.complaint.count(),
      prisma.complaint.count({
        where: { status: 'Pending' }
      }),
      prisma.alert.count({
        where: { status: 'Open' }
      }),
      prisma.alert.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { asset: true }
      }),
      prisma.complaint.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' }
      })
    ]);

    res.json({
      waterTanks,
      borewells,
      pipelines,
      totalComplaints,
      pendingComplaints,
      unresolvedAlerts,
      recentAlerts,
      recentComplaints
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

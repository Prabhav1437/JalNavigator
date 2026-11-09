const express = require('express');
const router = express.Router();
const prisma = require('../database');

router.get('/', async (req, res) => {
  try {
    const readings = await prisma.sensorReading.findMany({
      take: 50,
      orderBy: { recordedAt: 'desc' }
    });
    res.json(readings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/simulate', async (req, res) => {
  try {
    const assetId = parseInt(req.body.assetId, 10) || 1;
    const waterLevel = Math.floor(Math.random() * 100);
    const flowRate = parseFloat((Math.random() * 20).toFixed(1));
    const pressure = parseFloat((Math.random() * 3).toFixed(1));

    const reading = await prisma.sensorReading.create({
      data: {
        assetId,
        waterLevel,
        flowRate,
        pressure
      }
    });

    if (waterLevel < 20) {
      await prisma.alert.create({
        data: {
          assetId,
          message: `Low water level (${waterLevel}%) detected`,
          severity: 'Critical',
          status: 'Open'
        }
      });
    }

    res.status(201).json(reading);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const prisma = require('../database');

router.get('/', async (req, res) => {
  try {
    const readings = await prisma.sensorReading.findMany({
      take: 50,
      orderBy: { recordedAt: 'desc' },
      include: { asset: true }
    });
    res.json(readings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/simulate', async (req, res) => {
  try {
    let targetAsset = null;
    if (req.body.assetId) {
      targetAsset = await prisma.asset.findUnique({
        where: { id: parseInt(req.body.assetId, 10) }
      });
    }
    if (!targetAsset) {
      targetAsset = await prisma.asset.findFirst({
        orderBy: { id: 'asc' }
      });
    }
    if (!targetAsset) {
      return res.status(400).json({ error: 'No assets available for simulation. Please register an asset first.' });
    }

    const waterLevel = +(Math.random() * 100).toFixed(1);
    const flowRate = +(Math.random() * 25).toFixed(1);
    const pressure = +(Math.random() * 3.5).toFixed(1);

    const reading = await prisma.sensorReading.create({
      data: {
        assetId: targetAsset.id,
        waterLevel,
        flowRate,
        pressure
      },
      include: { asset: true }
    });

    let generatedAlert = null;
    if (waterLevel < 20) {
      generatedAlert = await prisma.alert.create({
        data: {
          assetId: targetAsset.id,
          message: `Critical low water level (${waterLevel}%) detected at ${targetAsset.name}`,
          severity: 'Critical',
          status: 'Open'
        },
        include: { asset: true }
      });
    }

    res.status(201).json({ reading, alert: generatedAlert });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

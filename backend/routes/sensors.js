const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  res.json(db.sensorReadings);
});

router.post('/simulate', (req, res) => {
  const assetId = parseInt(req.body.assetId, 10) || 1;
  const waterLevel = Math.floor(Math.random() * 100);
  const flowRate = parseFloat((Math.random() * 20).toFixed(1));
  const pressure = parseFloat((Math.random() * 3).toFixed(1));
  const recordedAt = new Date().toISOString();

  const reading = {
    id: Date.now(),
    assetId,
    waterLevel,
    flowRate,
    pressure,
    recordedAt
  };
  db.sensorReadings.push(reading);

  if (waterLevel < 20) {
    db.alerts.push({
      id: Date.now() + 1,
      assetId,
      message: `Low water level (${waterLevel}%) detected`,
      severity: 'Critical',
      status: 'Open',
      createdAt: recordedAt
    });
  }

  res.status(201).json(reading);
});

module.exports = router;

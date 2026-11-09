const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  res.json(db.alerts);
});

router.put('/:id', (req, res) => {
  const alertId = parseInt(req.params.id, 10);
  const index = db.alerts.findIndex(a => a.id === alertId);
  if (index === -1) {
    return res.status(404).json({ error: 'Alert not found' });
  }
  db.alerts[index] = { ...db.alerts[index], ...req.body, id: alertId };
  res.json(db.alerts[index]);
});

module.exports = router;

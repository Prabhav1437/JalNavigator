const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  res.json(db.assets);
});

router.post('/', (req, res) => {
  const { name, type, latitude, longitude, status, village } = req.body;
  const newAsset = {
    id: Date.now(),
    name: name || '',
    type: type || 'tank',
    latitude: parseFloat(latitude) || 0,
    longitude: parseFloat(longitude) || 0,
    status: status || 'Operational',
    village: village || ''
  };
  db.assets.push(newAsset);
  res.status(201).json(newAsset);
});

router.put('/:id', (req, res) => {
  const assetId = parseInt(req.params.id, 10);
  const index = db.assets.findIndex(a => a.id === assetId);
  if (index === -1) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  db.assets[index] = { ...db.assets[index], ...req.body, id: assetId };
  res.json(db.assets[index]);
});

router.delete('/:id', (req, res) => {
  const assetId = parseInt(req.params.id, 10);
  const index = db.assets.findIndex(a => a.id === assetId);
  if (index === -1) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  db.assets.splice(index, 1);
  res.json({ message: 'Asset deleted successfully', id: assetId });
});

module.exports = router;

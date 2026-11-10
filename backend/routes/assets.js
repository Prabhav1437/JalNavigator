const express = require('express');
const router = express.Router();
const prisma = require('../database');

router.get('/', async (req, res) => {
  try {
    const { type, village } = req.query;
    const where = {};
    if (type) {
      where.type = { equals: type, mode: 'insensitive' };
    }
    if (village) {
      where.village = { equals: village, mode: 'insensitive' };
    }
    const assets = await prisma.asset.findMany({
      where,
      orderBy: { id: 'desc' }
    });
    res.json(assets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, type, latitude, longitude, status, village } = req.body;
    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Name, latitude, and longitude are required' });
    }
    const asset = await prisma.asset.create({
      data: {
        name: name.trim(),
        type: (type || 'tank').toLowerCase().trim(),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        status: status || 'Operational',
        village: (village || '').trim()
      }
    });
    res.status(201).json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, type, latitude, longitude, status, village } = req.body;
    const asset = await prisma.asset.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(type !== undefined && { type: type.toLowerCase().trim() }),
        ...(latitude !== undefined && { latitude: parseFloat(latitude) }),
        ...(longitude !== undefined && { longitude: parseFloat(longitude) }),
        ...(status !== undefined && { status }),
        ...(village !== undefined && { village: village.trim() })
      }
    });
    res.json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.alert.deleteMany({ where: { assetId: id } });
    await prisma.sensorReading.deleteMany({ where: { assetId: id } });
    await prisma.asset.delete({ where: { id } });
    res.json({ message: 'Asset deleted successfully', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

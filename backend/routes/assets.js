const express = require('express');
const router = express.Router();
const prisma = require('../database');

router.get('/', async (req, res) => {
  try {
    const assets = await prisma.asset.findMany();
    res.json(assets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, type, latitude, longitude, status, village } = req.body;
    const asset = await prisma.asset.create({
      data: {
        name: name || '',
        type: type || 'tank',
        latitude: parseFloat(latitude) || 0,
        longitude: parseFloat(longitude) || 0,
        status: status || 'Operational',
        village: village || ''
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
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(latitude !== undefined && { latitude: parseFloat(latitude) }),
        ...(longitude !== undefined && { longitude: parseFloat(longitude) }),
        ...(status !== undefined && { status }),
        ...(village !== undefined && { village })
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
    await prisma.asset.delete({
      where: { id }
    });
    res.json({ message: 'Asset deleted successfully', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

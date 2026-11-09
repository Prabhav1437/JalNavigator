const express = require('express');
const router = express.Router();
const prisma = require('../database');

router.get('/', async (req, res) => {
  try {
    const complaints = await prisma.complaint.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, category, description, latitude, longitude } = req.body;
    const complaint = await prisma.complaint.create({
      data: {
        title: title || '',
        category: category || 'Other',
        description: description || '',
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        status: 'Pending'
      }
    });
    res.status(201).json(complaint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;
    const complaint = await prisma.complaint.update({
      where: { id },
      data: { status }
    });
    res.json(complaint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

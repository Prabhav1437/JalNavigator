const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  res.json(db.complaints);
});

router.post('/', (req, res) => {
  const { title, category, description, latitude, longitude } = req.body;
  const newComplaint = {
    id: Date.now(),
    title: title || '',
    category: category || 'Other',
    description: description || '',
    latitude: latitude ? parseFloat(latitude) : null,
    longitude: longitude ? parseFloat(longitude) : null,
    status: 'Pending',
    createdAt: new Date().toISOString()
  };
  db.complaints.push(newComplaint);
  res.status(201).json(newComplaint);
});

router.put('/:id', (req, res) => {
  const complaintId = parseInt(req.params.id, 10);
  const index = db.complaints.findIndex(c => c.id === complaintId);
  if (index === -1) {
    return res.status(404).json({ error: 'Complaint not found' });
  }
  db.complaints[index] = { ...db.complaints[index], ...req.body, id: complaintId };
  res.json(db.complaints[index]);
});

module.exports = router;

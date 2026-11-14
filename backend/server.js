const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const farmerJsonErrors = require('./utils/farmerJsonErrors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(farmerJsonErrors);
app.use(express.static(path.join(__dirname, '../frontend/dist')));

app.use('/api', apiRoutes);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'), (err) => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(`JalNavigator running on http://localhost:${PORT}`);
});

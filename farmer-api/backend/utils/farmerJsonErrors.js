const MESSAGES = {
  'entity.parse.failed': 'The request body is not valid JSON.',
  'entity.too.large': 'The request body is too large.'
};

module.exports = function farmerJsonErrors(err, req, res, next) {
  const path = req.originalUrl || req.url || '';
  const isFarmerRoute = path === '/api/farmer' || path.startsWith('/api/farmer/') || path.startsWith('/api/farmer?');
  const status = err && Number.isInteger(err.status) ? err.status : 0;
  if (!isFarmerRoute || status < 400 || status > 499) return next(err);
  return res.status(status).json({ error: MESSAGES[err.type] || 'The request body could not be read.' });
};

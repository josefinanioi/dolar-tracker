const router = require('express').Router();
const { getLatest } = require('../scheduler');
const { getHistory } = require('../storage');

router.get('/', (req, res) => {
  const data = getLatest();
  if (!data) return res.status(503).json({ error: 'Datos no disponibles aún. Intentá en unos segundos.' });
  res.json(data);
});

router.get('/historial', (req, res) => {
  res.json(getHistory());
});

module.exports = router;

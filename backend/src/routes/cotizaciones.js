const router = require('express').Router();
const { getLatest } = require('../scheduler');
const { getHistory } = require('../storage');
const { fetchBancos } = require('../dolar');

// Cache de bancos en memoria (se refresca cada 10 min)
let bancosCache = { data: [], updatedAt: null };

async function getBancos() {
  const TEN_MIN = 10 * 60 * 1000;
  if (bancosCache.updatedAt && Date.now() - bancosCache.updatedAt < TEN_MIN) {
    return bancosCache.data;
  }
  try {
    bancosCache.data = await fetchBancos();
    bancosCache.updatedAt = Date.now();
  } catch (err) {
    console.warn('No se pudieron obtener cotizaciones de bancos:', err.message);
  }
  return bancosCache.data;
}

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const data = getLatest();
  if (!data) return res.status(503).json({ error: 'Datos no disponibles aún. Intentá en unos segundos.' });
  res.json(data);
});

router.get('/historial', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getHistory());
});

router.get('/bancos', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const bancos = await getBancos();
  res.json(bancos);
});

module.exports = router;

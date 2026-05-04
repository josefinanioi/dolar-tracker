const router = require('express').Router();
const { getLatest } = require('../scheduler');
const { getHistory } = require('../storage');
const { fetchBancos } = require('../dolar');

// ── Cache de bancos en memoria ──────────────────────────────────────────────
// updatedAt sólo se actualiza en éxito. lastErrorAt se actualiza en cada fallo
// para implementar backoff de 1 min antes de reintentar.
let bancosCache = {
  data:         [],       // última respuesta válida
  updatedAt:    null,     // cuándo se obtuvo esa respuesta
  lastErrorAt:  null,     // cuándo ocurrió el último error
};

const BANCOS_TTL    = 10 * 60 * 1000;  // 10 min: tiempo de vida del caché
const BANCOS_RETRY  =  1 * 60 * 1000;  // 1 min: backoff entre reintentos fallidos

/**
 * Devuelve datos de bancos con caché.
 * - Si el caché está fresco → retorna sin tocar la red.
 * - Si el caché expiró → intenta refrescar.
 *   - Éxito: guarda y devuelve nuevos datos.
 *   - Error: si hay datos viejos, los devuelve (datos rancios > vacío).
 *            si no hay datos viejos, re-lanza el error → route devuelve 503.
 * - Si el último error fue hace < BANCOS_RETRY → no reintenta (backoff).
 */
async function getBancos() {
  const now = Date.now();

  // Caché fresco y con datos
  if (bancosCache.data.length > 0 && bancosCache.updatedAt && now - bancosCache.updatedAt < BANCOS_TTL) {
    return bancosCache.data;
  }

  // Backoff: no reintentar si el error fue reciente
  if (bancosCache.lastErrorAt && now - bancosCache.lastErrorAt < BANCOS_RETRY) {
    if (bancosCache.data.length > 0) {
      console.log('[getBancos] Backoff activo — devolviendo caché vencido');
      return bancosCache.data;
    }
    throw new Error('Fuente de datos temporalmente no disponible (backoff activo)');
  }

  // Intentar refrescar
  try {
    const freshData = await fetchBancos();
    bancosCache.data        = freshData;
    bancosCache.updatedAt   = now;
    bancosCache.lastErrorAt = null;
    return freshData;
  } catch (err) {
    bancosCache.lastErrorAt = now;
    console.error('[getBancos] Fallo al refrescar:', err.message);

    if (bancosCache.data.length > 0) {
      console.warn('[getBancos] Devolviendo datos rancios de', new Date(bancosCache.updatedAt).toLocaleTimeString('es-AR'));
      return bancosCache.data;
    }

    // No hay nada en caché → propagar el error
    throw err;
  }
}

// ── Rutas ───────────────────────────────────────────────────────────────────

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
  try {
    const bancos = await getBancos();
    res.json(bancos);
  } catch (err) {
    console.error('[GET /bancos] Error:', err.message);
    res.status(503).json({ error: 'No se pudieron obtener cotizaciones de bancos.', detail: err.message });
  }
});

module.exports = router;

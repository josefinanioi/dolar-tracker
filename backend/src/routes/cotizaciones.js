const router = require('express').Router();
const { getLatest, setLatest } = require('../scheduler');
const { getHistory, getHistoryRange } = require('../storage');
const { fetchCotizaciones } = require('../dolar');

// ── Cotizaciones ──────────────────────────────────────────────────────────────
//
// Cache on-demand: 2 min TTL. Si el scheduler hibernó (Render free), esta ruta
// refresca sola sin esperar el cron.

const CACHE_TTL = 2 * 60 * 1000; // 2 minutos

function cacheAge() {
  const d = getLatest();
  if (!d?.updatedAt) return Infinity;
  return Date.now() - new Date(d.updatedAt).getTime();
}

router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const age     = cacheAge();
  const current = getLatest();
  const ageStr  = isFinite(age) ? `${Math.round(age / 1000)}s` : '∞';

  if (current && age < CACHE_TTL) {
    console.log(`[GET /cotizaciones] cache HIT (${ageStr})`);
    return res.json(current);
  }

  const reason = current ? `vencido (${ageStr})` : 'vacío';
  console.log(`[GET /cotizaciones] cache ${reason} → fetching DolarAPI...`);

  try {
    const cotizaciones = await fetchCotizaciones();
    const fresh = { ...cotizaciones, updatedAt: new Date().toISOString() };
    setLatest(fresh);

    console.log('[GET /cotizaciones] ✅ cache actualizado:',
      Object.entries(cotizaciones).map(([k, v]) => `${k} c=$${v.compra} v=$${v.venta}`).join(' | ')
    );
    return res.json(fresh);

  } catch (err) {
    console.error('[GET /cotizaciones] ❌ fetch error:', err.message);
    if (current) {
      console.warn('[GET /cotizaciones] ⚠️ sirviendo datos rancios de', current.updatedAt);
      return res.json({ ...current, stale: true });
    }
    return res.status(503).json({ error: 'No se pudieron obtener las cotizaciones.', detail: err.message });
  }
});

// ── Historial ─────────────────────────────────────────────────────────────────
//
// GET /api/cotizaciones/historial
//   → últimas 24h (sin params — backward compat)
//
// GET /api/cotizaciones/historial?from=<ts_ms>&to=<ts_ms>
//   → rango explícito, con downsampling automático a ≤300 puntos

router.get('/historial', (req, res) => {
  res.set('Cache-Control', 'no-store');

  const from = req.query.from ? parseInt(req.query.from, 10) : null;
  const to   = req.query.to   ? parseInt(req.query.to,   10) : null;

  const history = (from != null || to != null)
    ? getHistoryRange(from, to, 300)
    : getHistory();

  console.log(`[GET /historial] from=${from ?? 'default'} to=${to ?? 'now'} → ${history.length} puntos`);
  res.json(history);
});

module.exports = router;

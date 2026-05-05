const router = require('express').Router();
const { getLatest, setLatest } = require('../scheduler');
const { getHistory } = require('../storage');
const { fetchCotizaciones } = require('../dolar');

// ── Cache de cotizaciones ─────────────────────────────────────────────────────
//
// El scheduler actualiza `latest` cada 5 min.
// Esta ruta actualiza `latest` on-demand si tiene > CACHE_TTL de antigüedad.
// Resultado garantizado: máximo 2 min de staleness sin importar el scheduler.
//
// Formato de `latest`:
//   { updatedAt: ISO, oficial: {compra, venta}, blue: {...}, mep: {...}, ccl: {...} }
//
// Respuesta al cliente:
//   200 — igual que `latest`            (datos frescos o del cache)
//   200 — { ...latest, stale: true }    (datos rancios al fallar el refresh)
//   503 — { error, detail }             (sin datos disponibles en absoluto)

const CACHE_TTL = 2 * 60 * 1000;  // 2 minutos

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

  // ── Cache fresco → responder sin tocar la red ─────────────────────────────
  if (current && age < CACHE_TTL) {
    console.log(`[GET /cotizaciones] cache HIT (${ageStr})`);
    return res.json(current);
  }

  // ── Cache vencido/vacío → fetch on-demand ─────────────────────────────────
  const reason = current ? `vencido (${ageStr})` : 'vacío';
  console.log(`[GET /cotizaciones] cache ${reason} → fetching DolarAPI...`);

  try {
    const cotizaciones = await fetchCotizaciones();
    // cotizaciones = { oficial, blue, mep, ccl }

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

    return res.status(503).json({
      error:  'No se pudieron obtener las cotizaciones.',
      detail: err.message,
    });
  }
});

router.get('/historial', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getHistory());
});

module.exports = router;

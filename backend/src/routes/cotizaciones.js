const router = require('express').Router();
const { getLatest, setLatest } = require('../scheduler');
const { getHistory } = require('../storage');
const { fetchCotizaciones } = require('../dolar');

// ── Caché de cotizaciones ─────────────────────────────────────────────────────
//
// DISEÑO:
//   - El scheduler actualiza el caché cada 5 min (para history y alertas).
//   - PERO esta ruta también lo actualiza on-demand si el caché tiene > 2 min.
//   - Resultado: máximo 2 min de staleness sin importar el scheduler.
//   - Si DolarAPI falla, se sirven datos rancios con flag { stale: true }.
//   - Si no hay datos en absoluto, 503.
//
// LOGGING:
//   - Cada request loguea si sirvió desde caché o hizo fetch.
//   - Cada fetch loguea los valores exactos retornados.

const CACHE_TTL = 2 * 60 * 1000;  // 2 minutos

function getCacheAge() {
  const data = getLatest();
  if (!data?.updatedAt) return Infinity;
  return Date.now() - new Date(data.updatedAt).getTime();
}

router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const age     = getCacheAge();
  const current = getLatest();
  const ageStr  = isFinite(age) ? `${Math.round(age / 1000)}s` : '∞';

  // ── Caché fresco → devolver sin tocar la red ──────────────────────────────
  if (current && age < CACHE_TTL) {
    console.log(`[GET /cotizaciones] Caché fresco (${ageStr}) → directo`);
    return res.json(current);
  }

  // ── Caché vencido o vacío → fetch on-demand ───────────────────────────────
  console.log(`[GET /cotizaciones] Caché ${current ? `vencido (${ageStr})` : 'vacío'} → fetching DolarAPI...`);

  try {
    const cotizaciones = await fetchCotizaciones();
    const fresh = { cotizaciones, updatedAt: new Date().toISOString() };
    setLatest(fresh);

    // Log de los valores reales para verificar que cambian
    console.log(`[GET /cotizaciones] ✅ Actualizado OK:`,
      cotizaciones.map(c => `${c.nombre}: compra=$${c.compra} venta=$${c.venta}`).join(' | ')
    );

    return res.json(fresh);
  } catch (err) {
    console.error('[GET /cotizaciones] ❌ Error al hacer fetch:', err.message);

    // Si hay datos rancios disponibles, servirlos antes que nada
    if (current) {
      console.warn('[GET /cotizaciones] ⚠️ Sirviendo datos rancios de', current.updatedAt);
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

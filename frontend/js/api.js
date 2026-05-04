// ─── API client ───────────────────────────────────────────────────
//
// DISEÑO INTENCIONAL:
//   - Fuente única: SIEMPRE el backend propio (CONFIG.BACKEND_URL).
//   - SIN fallback a DolarAPI desde el browser.
//     Motivo: dos fuentes distintas producen timestamps diferentes por tipo de
//     dólar, que el usuario ve como inconsistencia en la UI.
//   - Si el backend no responde, se muestra error. No se inventan datos.
//
// Timeout de 15 s para cubrir el cold-start de Render (free tier).

const TIPOS_VISIBLES = ['blue', 'oficial', 'bolsa', 'contadoconliqui'];
const NOMBRE_MAP = { blue: 'Blue', oficial: 'Oficial', bolsa: 'MEP', contadoconliqui: 'CCL' };

// Nunca usar caché HTTP para datos de cotizaciones
const NO_CACHE = { cache: 'no-store' };

// Agrega ?_t=<timestamp> para romper cachés de CDN/proxy intermedios
function bust(url) {
  return `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
}

// fetch con AbortController para garantizar timeout real
function fetchWithTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// ─── Cotizaciones ─────────────────────────────────────────────────
//
// Retorna el objeto completo del backend: { cotizaciones, updatedAt, stale? }
// El llamador usa `updatedAt` para mostrar UN timestamp unificado en el UI,
// en lugar del `fechaActualizacion` por tipo que viene de DolarAPI.

async function fetchCotizaciones() {
  if (!CONFIG.BACKEND_URL) {
    throw new Error('CONFIG.BACKEND_URL no está definido');
  }

  const url = bust(`${CONFIG.BACKEND_URL}/api/cotizaciones`);
  console.log('[api] fetchCotizaciones →', url);

  let res;
  try {
    res = await fetchWithTimeout(url, NO_CACHE, 15000);
  } catch (err) {
    const reason = err.name === 'AbortError'
      ? 'timeout de 15s (Render puede estar en cold-start)'
      : err.message;
    console.error('[api] fetchCotizaciones ✗', reason);
    throw new Error(`No se pudo conectar al backend: ${reason}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[api] fetchCotizaciones ✗ HTTP ${res.status}:`, body.slice(0, 200));
    throw new Error(`Backend respondió ${res.status}`);
  }

  const data = await res.json();
  console.log('[api] fetchCotizaciones ✓ updatedAt:', data.updatedAt,
    '| stale:', data.stale ?? false,
    '| tipos:', (data.cotizaciones || []).map(c => `${c.nombre}=$${c.venta}`).join(', '));

  return data; // { cotizaciones: [...], updatedAt: "...", stale?: true }
}

// ─── Historial ────────────────────────────────────────────────────

async function fetchHistorial() {
  if (!CONFIG.BACKEND_URL) return [];
  try {
    const res = await fetchWithTimeout(
      bust(`${CONFIG.BACKEND_URL}/api/cotizaciones/historial`),
      NO_CACHE,
      8000
    );
    if (res.ok) return await res.json();
    console.warn('[api] fetchHistorial HTTP', res.status);
  } catch (err) {
    console.warn('[api] fetchHistorial ✗', err.name === 'AbortError' ? 'timeout' : err.message);
  }
  return [];
}

// ─── Push / Alertas ───────────────────────────────────────────────

async function apiGetVapidKey() {
  if (!CONFIG.BACKEND_URL) return null;
  try {
    const res = await fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/push/vapid-public-key`, NO_CACHE, 8000);
    if (res.ok) return (await res.json()).key;
  } catch { /* sin backend */ }
  return null;
}

async function apiSubscribePush(subscription, userId) {
  if (!CONFIG.BACKEND_URL) return false;
  try {
    const res = await fetch(`${CONFIG.BACKEND_URL}/api/push/subscribe`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ subscription, userId }),
    });
    return res.ok;
  } catch { return false; }
}

async function apiCreateAlerta(alert) {
  if (!CONFIG.BACKEND_URL) return null;
  try {
    const res = await fetch(`${CONFIG.BACKEND_URL}/api/alertas`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(alert),
    });
    if (res.ok) return await res.json();
  } catch { /* sin backend */ }
  return null;
}

async function apiDeleteAlerta(id) {
  if (!CONFIG.BACKEND_URL) return;
  try {
    await fetch(`${CONFIG.BACKEND_URL}/api/alertas/${id}`, { method: 'DELETE' });
  } catch { /* sin backend */ }
}

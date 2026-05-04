// ─── API client ───────────────────────────────────────────────────
// Intenta el backend propio primero; si no está configurado o falla,
// llama a DolarAPI directamente (modo standalone).

const TIPOS_VISIBLES = ['blue', 'oficial', 'bolsa', 'contadoconliqui'];
const NOMBRE_MAP = { blue: 'Blue', oficial: 'Oficial', bolsa: 'MEP', contadoconliqui: 'CCL' };

// Nunca usar caché del browser para datos de cotizaciones
const NO_CACHE = { cache: 'no-store' };

// Agrega ?_t=<timestamp> para romper cachés intermedias (CDN, proxy, Render edge)
function bust(url) {
  return `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
}

/**
 * fetch con timeout via AbortController.
 * Si el servidor no responde en `ms` milisegundos, lanza AbortError.
 */
function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// ─── Cotizaciones ─────────────────────────────────────────────────

async function fetchCotizaciones() {
  // 1. Intentar backend propio (timeout 8s para no bloquear en cold-start de Render)
  if (CONFIG.BACKEND_URL) {
    try {
      const res = await fetchWithTimeout(
        bust(`${CONFIG.BACKEND_URL}/api/cotizaciones`),
        NO_CACHE,
        8000
      );
      if (res.ok) {
        const data = await res.json();
        return data.cotizaciones || data;
      }
      console.warn(`[fetchCotizaciones] Backend respondió ${res.status} — usando DolarAPI`);
    } catch (err) {
      const reason = err.name === 'AbortError' ? 'timeout (8s)' : err.message;
      console.warn(`[fetchCotizaciones] Backend no disponible (${reason}) — usando DolarAPI`);
    }
  }

  // 2. Fallback directo a DolarAPI (timeout 12s)
  const res = await fetchWithTimeout(
    bust(`${CONFIG.DOLAR_API_URL}/dolares`),
    NO_CACHE,
    12000
  );
  if (!res.ok) throw new Error(`DolarAPI respondió ${res.status}`);
  const data = await res.json();
  return data
    .filter(d => TIPOS_VISIBLES.includes(d.casa))
    .map(d => ({
      casa:               d.casa,
      nombre:             NOMBRE_MAP[d.casa] || d.nombre,
      compra:             d.compra ?? null,
      venta:              d.venta  ?? null,
      fechaActualizacion: d.fechaActualizacion,
    }));
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
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    console.warn(`[fetchHistorial] ${reason}`);
  }
  return [];
}

// ─── Bancos ───────────────────────────────────────────────────────
// IMPORTANTE: NO existe fallback directo al browser para Ambito porque
// esa API no tiene cabeceras CORS — la petición sería bloqueada siempre.
// El único origen confiable es el backend (servidor Node, sin CORS).
//
// Retorna:
//   Array<{banco, compra, venta}>  → datos válidos
//   null                           → error (backend no disponible o fuente caída)

async function fetchBancos() {
  if (!CONFIG.BACKEND_URL) return null;

  try {
    const res = await fetchWithTimeout(
      bust(`${CONFIG.BACKEND_URL}/api/cotizaciones/bancos`),
      NO_CACHE,
      10000
    );

    if (res.ok) {
      const data = await res.json();
      // Sanity check: la respuesta debe ser un array
      if (!Array.isArray(data)) {
        console.warn('[fetchBancos] Respuesta inesperada del backend:', data);
        return null;
      }
      return data;
    }

    // 503 = fuente (Ambito) caída; el backend ya lo loguea
    console.warn(`[fetchBancos] Backend respondió ${res.status} — fuente de bancos no disponible`);
    return null;
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout (10s)' : err.message;
    console.warn(`[fetchBancos] Error: ${reason}`);
    return null;
  }
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

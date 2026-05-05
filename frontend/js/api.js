// ─── API client ───────────────────────────────────────────────────
//
// Fuente única: backend propio (CONFIG.BACKEND_URL → Render).
//
// Respuesta esperada de GET /api/cotizaciones:
//   {
//     updatedAt: "ISO string",
//     oficial:   { compra, venta },
//     blue:      { compra, venta },
//     mep:       { compra, venta },
//     ccl:       { compra, venta },
//     stale?:    true
//   }

const NO_CACHE = { cache: 'no-store' };

// Agrega ?t=<timestamp> para romper cachés de CDN/proxy
function bust(url) {
  return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
}

// fetch con AbortController — garantiza timeout real
function fetchWithTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// ─── Cotizaciones ─────────────────────────────────────────────────

async function fetchCotizaciones() {
  if (!CONFIG.BACKEND_URL) throw new Error('CONFIG.BACKEND_URL no está definido');

  const url = bust(`${CONFIG.BACKEND_URL}/api/cotizaciones`);
  console.log('[api] fetchCotizaciones →', url);

  let res;
  try {
    res = await fetchWithTimeout(url, NO_CACHE, 15000);
  } catch (err) {
    const reason = err.name === 'AbortError'
      ? 'timeout 15s (Render puede estar en cold-start)'
      : err.message;
    console.error('[api] fetchCotizaciones ✗', reason);
    throw new Error(`Sin conexión al backend: ${reason}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[api] fetchCotizaciones ✗ HTTP ${res.status}:`, body.slice(0, 200));
    throw new Error(`Backend respondió ${res.status}`);
  }

  const data = await res.json();

  if (!data.updatedAt || !data.oficial || !data.blue || !data.mep || !data.ccl) {
    console.error('[api] fetchCotizaciones ✗ respuesta inesperada:', data);
    throw new Error('Respuesta del backend con formato inválido');
  }

  console.log('[api] fetchCotizaciones ✓',
    `updatedAt=${data.updatedAt}`,
    `stale=${data.stale ?? false}`,
    `blue=$${data.blue.venta}`
  );

  return data;
}

// ─── Historial ────────────────────────────────────────────────────
//
// from / to: timestamps en milisegundos.
// Sin params → backend devuelve últimas 24h (backward compat).

async function fetchHistorial(from = null, to = null) {
  if (!CONFIG.BACKEND_URL) return [];

  let url = `${CONFIG.BACKEND_URL}/api/cotizaciones/historial`;
  const params = [];
  if (from != null) params.push(`from=${from}`);
  if (to   != null) params.push(`to=${to}`);
  if (params.length) url += '?' + params.join('&');

  try {
    const res = await fetchWithTimeout(bust(url), NO_CACHE, 10000);
    if (res.ok) {
      const data = await res.json();
      console.log(`[api] fetchHistorial ✓ ${data.length} puntos`);
      return data;
    }
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
    const res = await fetchWithTimeout(
      `${CONFIG.BACKEND_URL}/api/push/vapid-public-key`, NO_CACHE, 8000
    );
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

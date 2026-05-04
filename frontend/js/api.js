// ─── API client ───────────────────────────────────────────────────
// Intenta el backend propio primero; si no está configurado o falla,
// llama a DolarAPI directamente (modo standalone).

const TIPOS_VISIBLES = ['blue', 'oficial', 'bolsa', 'contadoconliqui'];
const NOMBRE_MAP = { blue: 'Blue', oficial: 'Oficial', bolsa: 'MEP', contadoconliqui: 'CCL' };

async function fetchCotizaciones() {
  if (CONFIG.BACKEND_URL) {
    try {
      const res = await fetch(`${CONFIG.BACKEND_URL}/api/cotizaciones`);
      if (res.ok) {
        const data = await res.json();
        return data.cotizaciones || data;
      }
    } catch {
      console.warn('Backend no disponible, usando DolarAPI directo');
    }
  }

  const res = await fetch(`${CONFIG.DOLAR_API_URL}/dolares`);
  if (!res.ok) throw new Error(`DolarAPI error ${res.status}`);
  const data = await res.json();
  return data
    .filter(d => TIPOS_VISIBLES.includes(d.casa))
    .map(d => ({
      casa: d.casa,
      nombre: NOMBRE_MAP[d.casa] || d.nombre,
      compra: d.compra ?? null,
      venta: d.venta ?? null,
      fechaActualizacion: d.fechaActualizacion,
    }));
}

async function fetchHistorial() {
  if (!CONFIG.BACKEND_URL) return [];
  try {
    const res = await fetch(`${CONFIG.BACKEND_URL}/api/cotizaciones/historial`);
    if (res.ok) return await res.json();
  } catch { /* backend no disponible */ }
  return [];
}

async function apiGetVapidKey() {
  if (!CONFIG.BACKEND_URL) return null;
  try {
    const res = await fetch(`${CONFIG.BACKEND_URL}/api/push/vapid-public-key`);
    if (res.ok) return (await res.json()).key;
  } catch { /* sin backend */ }
  return null;
}

async function apiSubscribePush(subscription, userId) {
  if (!CONFIG.BACKEND_URL) return false;
  try {
    const res = await fetch(`${CONFIG.BACKEND_URL}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, userId }),
    });
    return res.ok;
  } catch { return false; }
}

async function apiCreateAlerta(alert) {
  if (!CONFIG.BACKEND_URL) return null;
  try {
    const res = await fetch(`${CONFIG.BACKEND_URL}/api/alertas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
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

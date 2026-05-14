// ─── Dólar AR – Aplicación principal ─────────────────────────────

window.__runtimeId = window.__runtimeId || Math.random().toString(36).slice(2);
console.log('[RUNTIME]', window.__runtimeId);

// ── Estado global ────────────────────────────────────────────────

const state = {
  cotizaciones: {},
  history:      [],
  lastUpdate:   null,
  chartRange: {
    key:  '24h',
    from: null,
    to:   null,
    ms:   24 * 60 * 60 * 1000,
  },
};

// ── Tipos de dólar ───────────────────────────────────────────────

const TIPOS = [
  { key: 'oficial', label: 'Oficial', accent: '#3b82f6' },
  { key: 'blue',    label: 'Blue',    accent: '#f59e0b' },
  { key: 'mep',     label: 'MEP',     accent: '#8b5cf6' },
  { key: 'ccl',     label: 'CCL',     accent: '#10b981' },
];

// ── Helpers ──────────────────────────────────────────────────────

function formatPrice(n) {
  if (n == null) return '—';
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}

function getRangeTimestamps() {
  const { key, from, to } = state.chartRange;
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  switch (key) {
    case '24h':  return { from: now - DAY,      to: null, ms: DAY };
    case '7d':   return { from: now - 7  * DAY, to: null, ms: 7  * DAY };
    case '30d':  return { from: now - 30 * DAY, to: null, ms: 30 * DAY };
    case '3m':   return { from: now - 90 * DAY, to: null, ms: 90 * DAY };
    case 'custom': {
      const f = from ?? (now - DAY);
      const t = to   ?? now;
      return { from: f, to: t, ms: t - f };
    }
    default:     return { from: now - DAY,       to: null, ms: DAY };
  }
}

// ══════════════════════════════════════════════════════════════════
// Render — Cotizaciones
// ══════════════════════════════════════════════════════════════════

function renderCotizaciones(data, prev = {}) {
  const grid = document.getElementById('cotizaciones-grid');

  grid.innerHTML = TIPOS.map(({ key, label, accent }) => {
    const curr = data[key] || {};
    const old  = prev[key] || {};

    const diff = old.venta && curr.venta
      ? ((curr.venta - old.venta) / old.venta) * 100
      : null;

    let badge = '';
    if (diff !== null && Math.abs(diff) >= 0.01) {
      const cls  = diff > 0 ? 'badge-up' : 'badge-down';
      const sign = diff > 0 ? '+' : '';
      badge = `<span class="card-badge ${cls}">${sign}${diff.toFixed(2)}%</span>`;
    } else if (old.venta !== undefined) {
      badge = `<span class="card-badge badge-neutral">sin cambio</span>`;
    }

    return `
      <div class="card" style="--accent:${accent}">
        <div class="card-header">
          <span class="card-title">${label}</span>
          ${badge}
        </div>
        <div class="card-prices">
          <div class="price-item">
            <span class="price-label">Compra</span>
            <span class="price-value compra">${formatPrice(curr.compra)}</span>
          </div>
          <div class="price-item">
            <span class="price-label">Venta</span>
            <span class="price-value venta">${formatPrice(curr.venta)}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════
// Render — Alertas
// ══════════════════════════════════════════════════════════════════

function renderAlertas() {
  const list    = document.getElementById('alerts-list');
  const emptyEl = document.getElementById('alerts-empty');

  const alerts = getAlertas();

  if (!alerts.length) {
    list.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  list.innerHTML = alerts.map(a => {
    try {
      const isTriggered = a.state === 'triggered';
      const statusCls   = isTriggered ? 'status-triggered' : 'status-active';
      const statusLbl   = isTriggered ? '✓ disparada' : '⏳ activa';

      let fecha = '—';
      try { fecha = new Date(a.createdAt).toLocaleDateString('es-AR'); } catch {}

      return `
        <div class="alert-item${isTriggered ? ' triggered' : ''}">
          <div class="alert-info">
            <span class="alert-title">${alertaTitle(a)}</span>
            <span class="alert-meta">${a.repeating ? 'Repetitiva · ' : ''}Creada el ${fecha}</span>
          </div>
          <div class="alert-actions">
            <span class="alert-status ${statusCls}">${statusLbl}</span>
            ${isTriggered
              ? `<button class="btn-icon btn-sm" title="Reactivar" onclick="handleResetAlerta('${a.id}')">↺</button>`
              : ''}
            <button class="btn-icon btn-sm" title="Editar" onclick="handleEditAlerta('${a.id}')">✎</button>
            <button class="btn-danger btn-sm" title="Eliminar" onclick="handleDeleteAlerta('${a.id}')">🗑</button>
          </div>
        </div>`;
    } catch (err) {
      console.error('[renderAlertas] error:', a?.id, err);
      return '';
    }
  }).join('');
}

// ══════════════════════════════════════════════════════════════════
// Status bar
// ══════════════════════════════════════════════════════════════════

function setStatus(st, text) {
  document.querySelector('.status-dot').className = `status-dot ${st}`;
  document.getElementById('update-text').textContent = text;
}

// ══════════════════════════════════════════════════════════════════
// Toast
// ══════════════════════════════════════════════════════════════════

function showToast(msg, type = 'info', ms = 3500) {
  const c     = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  c.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity .3s, transform .3s';
    toast.style.opacity    = '0';
    toast.style.transform  = 'translateX(16px)';
    setTimeout(() => toast.remove(), 300);
  }, ms);
}

// ══════════════════════════════════════════════════════════════════
// Persistencia de últimas cotizaciones conocidas (cold-start cache)
// ══════════════════════════════════════════════════════════════════

const LAST_DATA_KEY  = 'dolar-ar-last-cotizaciones';
const LAST_DATA_MAX_AGE = 4 * 60 * 60 * 1000; // 4 horas

function saveLastCotizaciones(data) {
  try {
    localStorage.setItem(LAST_DATA_KEY, JSON.stringify({ data, savedAt: Date.now() }));
  } catch { /* quota exceeded u otro error — no crítico */ }
}

function loadLastCotizaciones() {
  try {
    const stored = JSON.parse(localStorage.getItem(LAST_DATA_KEY));
    if (!stored?.data || !stored?.savedAt) return null;
    if (Date.now() - stored.savedAt > LAST_DATA_MAX_AGE) return null; // demasiado viejo
    return stored.data;
  } catch {
    return null;
  }
}

// ── Configuración de reintentos ────────────────────────────────────
// Timeouts crecientes: el 1.° es corto (servidor ya activo);
// el 3.° es generoso para sobrevivir al cold-start de Render (~30 s).
const RETRY_TIMEOUTS  = [20000, 35000, 60000]; // ms por intento
const RETRY_DELAY_MS  = 5000;                   // pausa entre intentos
const MAX_RETRIES     = RETRY_TIMEOUTS.length;

// ══════════════════════════════════════════════════════════════════
// Fetch de cotizaciones
// ══════════════════════════════════════════════════════════════════

async function updateCotizaciones() {
  console.count('[updateCotizaciones] llamado'); // si aparece > 1 simultáneo → problema
  const btn = document.getElementById('refresh-btn');
  btn?.classList.add('spinning');

  // ── 1. Fetch con reintentos — tolerante al cold-start de Render ──
  //
  // Intento 1 (20 s): el servidor ya estaba activo.
  // Intento 2 (35 s): el servidor se está despertando.
  // Intento 3 (60 s): cold-start lento, espera generosa.
  // Entre intentos: 5 s de pausa + mensaje informativo en el status bar.

  const STATUS_MSG = [
    'Conectando al backend...',
    'Despertando servidor... (puede tardar ~30 s)',
    `Reintentando conexión (3/${MAX_RETRIES})...`,
  ];

  let cotizaciones, updatedAtDate, stale;
  let lastError = null;

  for (let i = 0; i < MAX_RETRIES; i++) {
    setStatus('loading', STATUS_MSG[i]);
    console.log(`[app] 🔄 intento ${i + 1}/${MAX_RETRIES} (timeout ${RETRY_TIMEOUTS[i] / 1000}s)`);

    try {
      const response = await fetchCotizaciones(RETRY_TIMEOUTS[i]);
      ({ stale, ...cotizaciones } = response);
      const { updatedAt } = response;
      delete cotizaciones.updatedAt;
      updatedAtDate = updatedAt ? new Date(updatedAt) : new Date();
      console.log(`[app] ✅ cotizaciones OK (intento ${i + 1}):`, Object.keys(cotizaciones).join(', '));
      lastError = null;
      break; // éxito — salir del loop
    } catch (err) {
      lastError = err;
      console.warn(`[app] ⚠️ intento ${i + 1} falló:`, err.message);
      if (i < MAX_RETRIES - 1) {
        console.log(`[app] ⏳ esperando ${RETRY_DELAY_MS / 1000}s antes del siguiente intento...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  // ── 2. Reintentos agotados sin éxito ─────────────────────────
  if (lastError) {
    console.error('[app] ❌ todos los reintentos fallaron:', lastError.message);
    const hayDatos = Object.keys(state.cotizaciones).length > 0;
    if (hayDatos) {
      // Tenemos datos previos (del mismo ciclo o de localStorage) — mostrarlos como rancios
      setStatus('error', 'Sin conexión · mostrando últimos datos guardados');
    } else {
      setStatus('error', 'No se pudo conectar al servidor');
      showToast(
        `Sin respuesta tras ${MAX_RETRIES} intentos. Verificá tu conexión o intentá en unos minutos.`,
        'error', 10000
      );
    }
    btn?.classList.remove('spinning');
    return;
  }

  // ── 3. Actualizar state ───────────────────────────────────────
  const prev         = state.cotizaciones;
  state.cotizaciones = cotizaciones;
  state.lastUpdate   = updatedAtDate;
  saveLastCotizaciones(cotizaciones); // persiste para próximos cold-starts

  // ── 4. Render cotizaciones — aislado ─────────────────────────
  try {
    renderCotizaciones(cotizaciones, prev);
    const hora = updatedAtDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    setStatus('', `Actualizado a las ${hora}${stale ? ' · datos rancios' : ''}`);
    console.log('[app] ✅ render cotizaciones OK');
  } catch (err) {
    console.error('[app] ❌ ERROR EN RENDER:', err);
    setStatus('error', 'Error al mostrar cotizaciones');
  }

  // ── 5. Evaluar alertas — aislado, nunca rompe el render ──────
  try {
    if (!isNotifEnabled()) {
      console.log('[alerts] notifications disabled — skipping evaluation');
    } else {
      const disparadas = evalAlertas(cotizaciones);
      for (const { tipo, mensaje } of disparadas) {
        try {
          showLocalNotification(`📊 Alerta Dólar ${TIPO_LABEL[tipo] || tipo}`, mensaje);
          showToast(`Alerta: ${mensaje}`, 'success', 7000);
        } catch { /* error de notificación — no crítico */ }
      }
      if (disparadas.length) renderAlertas();
      console.log(`[app] ✅ alertas OK (${disparadas.length} disparadas)`);
    }
  } catch (err) {
    console.error('[app] ❌ ERROR EN ALERTAS:', err);
  }

  btn?.classList.remove('spinning');
}

async function updateHistorial() {
  console.log('[app] 📊 updateHistorial start, rango:', state.chartRange.key);

  // ── 1. Fetch historial ───────────────────────────────────────
  let history = [];
  let ms = state.chartRange.ms;
  try {
    const range = getRangeTimestamps();
    ms = range.ms;
    console.log('[app] 📊 fetching historial from:', range.from, 'to:', range.to);
    history = await fetchHistorial(range.from, range.to);
    state.history       = history;
    state.chartRange.ms = ms;
    console.log(`[app] ✅ historial OK: ${history.length} snapshots`);
  } catch (err) {
    console.error('[app] ❌ fetch historial:', err.message);
    return;
  }

  // ── 2. Render chart — aislado del fetch ───────────────────────
  try {
    const tipo  = document.getElementById('chart-tipo').value;
    const campo = document.getElementById('chart-campo').value;
    renderChart(history, tipo, campo, ms);
    console.log('[app] ✅ renderChart OK');
  } catch (err) {
    console.error('[app] ❌ ERROR EN CHART:', err);
  }
}

// ══════════════════════════════════════════════════════════════════
// Selector de rango del historial
// ══════════════════════════════════════════════════════════════════

function setRange(key) {
  state.chartRange.key  = key;
  state.chartRange.from = null;
  state.chartRange.to   = null;

  document.querySelectorAll('.btn-range').forEach(b => {
    b.classList.toggle('active', b.dataset.range === key);
  });

  const customEl = document.getElementById('custom-date-range');
  customEl.classList.toggle('hidden', key !== 'custom');

  if (key !== 'custom') updateHistorial();
}

function applyCustomRange() {
  const fromInput = document.getElementById('range-from').value;
  const toInput   = document.getElementById('range-to').value;
  if (!fromInput || !toInput) {
    showToast('Seleccioná fechas de inicio y fin', 'warning'); return;
  }
  const from = new Date(fromInput).getTime();
  const to   = new Date(toInput + 'T23:59:59').getTime();
  if (from >= to) {
    showToast('La fecha de inicio debe ser anterior a la de fin', 'warning'); return;
  }
  state.chartRange.from = from;
  state.chartRange.to   = to;
  updateHistorial();
}

// ══════════════════════════════════════════════════════════════════
// Modal de alerta — Create & Edit
// ══════════════════════════════════════════════════════════════════

// null = modo creación | string ID = modo edición
let editingAlertId = null;

function openModal() {
  editingAlertId = null;
  document.getElementById('modal-title').textContent      = 'Nueva alerta';
  document.getElementById('modal-submit-btn').textContent = 'Crear alerta';
  document.getElementById('alert-form').reset();
  document.getElementById('modal-overlay').classList.remove('hidden');
  updatePriceHint();
}

function openModalEdit(id) {
  const alerta = getAlertas().find(a => a.id === id);
  if (!alerta) { showToast('No se encontró la alerta', 'error'); return; }

  editingAlertId = id;
  document.getElementById('modal-title').textContent      = 'Editar alerta';
  document.getElementById('modal-submit-btn').textContent = 'Guardar cambios';
  document.getElementById('alert-form').reset();
  document.getElementById('modal-overlay').classList.remove('hidden');

  document.getElementById('alert-tipo').value         = alerta.tipo      || 'oficial';
  document.getElementById('alert-campo').value        = alerta.campo     || 'venta';
  document.getElementById('alert-condicion').value    = alerta.condicion || 'baja';
  document.getElementById('alert-valor').value        = alerta.valor     || '';
  document.getElementById('alert-repeating').checked  = !!alerta.repeating;

  updatePriceHint();
}

function closeModal() {
  editingAlertId = null;
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('alert-form').reset();
  // Resetear títulos para la próxima apertura
  document.getElementById('modal-title').textContent      = 'Nueva alerta';
  document.getElementById('modal-submit-btn').textContent = 'Crear alerta';
}


function updatePriceHint() {
  const tipo  = document.getElementById('alert-tipo').value;
  const campo = document.getElementById('alert-campo').value;
  const hint  = document.getElementById('current-price-hint');
  const prices = state.cotizaciones[tipo];
  const p      = prices ? prices[campo] : null;
  hint.textContent = p != null ? `actual: ${formatPrice(p)}` : '';
}

function handleDeleteAlerta(id) {
  deleteAlerta(id);
  renderAlertas();
  showToast('Alerta eliminada', 'info');
}

function handleResetAlerta(id) {
  resetAlerta(id);
  renderAlertas();
  showToast('Alerta reactivada', 'info');
}

function handleEditAlerta(id) {
  openModalEdit(id);
}

function handleAlertSubmit(e) {
  e.preventDefault();

  const tipo      = document.getElementById('alert-tipo').value;
  const campo     = document.getElementById('alert-campo').value;
  const condicion = document.getElementById('alert-condicion').value;
  const valor     = parseFloat(document.getElementById('alert-valor').value);
  const repeating = document.getElementById('alert-repeating').checked;

  if (!valor || valor <= 0) {
    showToast('Ingresá un valor válido', 'error');
    return;
  }

  const params = { tipo, campo, condicion, valor, repeating };

  if (editingAlertId) {
    updateAlerta(editingAlertId, params);
    closeModal();
    renderAlertas();
    showToast('Alerta actualizada ✓', 'success');
  } else {
    createAlerta(params, state.cotizaciones);
    closeModal();
    renderAlertas();
    showToast('Alerta creada ✓', 'success');
  }
}

// ══════════════════════════════════════════════════════════════════
// Notificaciones
// ══════════════════════════════════════════════════════════════════

// Sincroniza la campanita con el flag interno.
// Solo refleja isNotifEnabled() — el permiso del navegador es independiente.
//   active  → notificaciones ON  (azul)
//   muted   → notificaciones OFF (gris tenue)
function updateNotifBtn() {
  const btn     = document.getElementById('notif-btn');
  const enabled = isNotifEnabled();

  btn.classList.toggle('active', enabled);
  btn.classList.toggle('muted', !enabled);
  btn.title = enabled ? 'Desactivar notificaciones' : 'Activar notificaciones';
  btn.setAttribute('aria-label', btn.title);
}

// Toggle real: controla el engine de alertas completo.
// Activar: pide permiso al sistema si hace falta, luego enciende el flag.
// Desactivar: apaga el flag — evalAlertas no se ejecuta hasta reactivar.
async function toggleNotifications() {
  const perm = getNotifPermission();

  if (perm === 'unsupported') {
    showToast('Tu navegador no soporta notificaciones', 'error');
    return;
  }

  if (!isNotifEnabled()) {
    // ── Activar ───────────────────────────────────────────────
    if (perm === 'denied') {
      showToast('Permiso bloqueado en el navegador. Habilitalo en Configuración.', 'warning', 6000);
      return;
    }
    if (perm !== 'granted') {
      const result = await requestNotifPermission();
      if (result !== 'granted') {
        showToast('Permiso de notificaciones denegado', 'error');
        return;
      }
      await subscribePushNotifications(getUserId());
    }
    setNotifEnabled(true);
    updateNotifBtn();
    showToast('Notificaciones activadas ✓', 'success');
  } else {
    // ── Desactivar ────────────────────────────────────────────
    setNotifEnabled(false);
    updateNotifBtn();
    showToast('Notificaciones desactivadas', 'info');
  }
}

// ══════════════════════════════════════════════════════════════════
// Tema
// ══════════════════════════════════════════════════════════════════

function toggleTheme() {
  const isDark = document.body.classList.contains('dark');
  document.body.classList.toggle('dark',  !isDark);
  document.body.classList.toggle('light',  isDark);
  localStorage.setItem('dolar-ar-theme', isDark ? 'light' : 'dark');
  const { ms } = getRangeTimestamps();
  renderChart(state.history, document.getElementById('chart-tipo').value,
              document.getElementById('chart-campo').value, ms);
}

function loadTheme() {
  const saved = localStorage.getItem('dolar-ar-theme') || 'dark';
  document.body.className = saved;
}

// ══════════════════════════════════════════════════════════════════
// Event listeners
// ══════════════════════════════════════════════════════════════════

function setupListeners() {
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);
  document.getElementById('notif-btn').addEventListener('click', toggleNotifications);
  document.getElementById('refresh-btn').addEventListener('click', refreshAll);

  document.getElementById('new-alert-btn').addEventListener('click', openModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('cancel-alert').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  document.getElementById('alert-tipo').addEventListener('change', updatePriceHint);
  document.getElementById('alert-campo').addEventListener('change', updatePriceHint);

  document.getElementById('alert-form').addEventListener('submit', handleAlertSubmit);

  document.getElementById('chart-tipo').addEventListener('change', () => {
    const { ms } = getRangeTimestamps();
    renderChart(state.history, document.getElementById('chart-tipo').value,
                document.getElementById('chart-campo').value, ms);
  });
  document.getElementById('chart-campo').addEventListener('change', () => {
    const { ms } = getRangeTimestamps();
    renderChart(state.history, document.getElementById('chart-tipo').value,
                document.getElementById('chart-campo').value, ms);
  });

  document.querySelectorAll('.btn-range').forEach(btn => {
    btn.addEventListener('click', () => setRange(btn.dataset.range));
  });

  document.getElementById('apply-range').addEventListener('click', applyCustomRange);
}

// ══════════════════════════════════════════════════════════════════
// Auto-refresh robusto
// ══════════════════════════════════════════════════════════════════

const STALE_MS = 2 * 60 * 1000;

// Lock de concurrencia: evita que múltiples visibilitychange/focus/setInterval
// que llegan al mismo tiempo (o en ms de diferencia) lancen refrescos paralelos.
// El lock dura hasta que updateCotizaciones termine (la operación más larga).
let _refreshInProgress = false;

async function refreshAll() {
  if (_refreshInProgress) {
    console.log('[refreshAll] ya en progreso — descartando llamada duplicada');
    return;
  }
  _refreshInProgress = true;
  try {
    // Lanzar en paralelo pero esperar a updateCotizaciones para liberar el lock
    // updateHistorial puede correr concurrentemente — no afecta alertas
    await Promise.all([updateCotizaciones(), updateHistorial()]);
  } finally {
    _refreshInProgress = false;
  }
}

// Guard: setupAutoRefresh solo debe llamarse UNA vez por ciclo de vida de la página.
// Si se llama más de una vez → múltiples setInterval → múltiples evalAlertas por ciclo.
let _autoRefreshInitialized = false;

function setupAutoRefresh() {
  if (_autoRefreshInitialized) {
    console.error('[auto-refresh] ⚠️ setupAutoRefresh llamado más de una vez — IGNORANDO. Revisar si init() se ejecuta múltiples veces.');
    return;
  }
  _autoRefreshInitialized = true;
  console.log('[auto-refresh] iniciando — intervalo:', CONFIG.UPDATE_INTERVAL, 'ms');

  const intervalId = setInterval(refreshAll, CONFIG.UPDATE_INTERVAL);
  console.log('[AUTOREFRESH CREATED]', {
    intervalId,
    runtime: window.__runtimeId,
    timestamp: new Date().toISOString(),
  });

  // visibilitychange cubre TODOS los casos: cambio de tab, PWA al frente,
  // Alt+Tab de regreso al browser, etc.
  // window.focus se ELIMINA — era redundante y causaba llamadas dobles/triples
  // (ambos eventos se disparan simultáneamente al volver a la tab).
  document.addEventListener('visibilitychange', (event) => {
    console.log('[EVENT]', event.type, {
      runtime: window.__runtimeId,
      visibilityState: document.visibilityState,
      timestamp: new Date().toISOString(),
    });
    if (document.visibilityState !== 'visible') return;
    const elapsed = state.lastUpdate ? Date.now() - state.lastUpdate.getTime() : Infinity;
    if (elapsed > STALE_MS) {
      console.log(`[auto-refresh] Tab visible, datos de ${Math.round(elapsed / 1000)}s → refrescando`);
      refreshAll();
    }
  });
}

// ══════════════════════════════════════════════════════════════════
// Init
// ══════════════════════════════════════════════════════════════════

async function init() {
  console.log('[app] 🚀 init start');
  console.count('[app] init llamado'); // detecta si init() corre más de una vez

  // ── Limpiar claves legacy de storage ──────────────────────────
  try {
    localStorage.removeItem('dolar-ar-last-prices');
  } catch { /* no crítico */ }

  loadTheme();

  try { setupListeners(); }
  catch (err) { console.error('[app] ❌ setupListeners:', err); }

  try { await initServiceWorker(); }
  catch (err) { console.warn('[app] ⚠️ initServiceWorker:', err.message); }

  try {
    updateNotifBtn();
    if (getNotifPermission() === 'granted') {
      subscribePushNotifications(getUserId());
    }
  } catch (err) { console.warn('[app] ⚠️ notif init:', err.message); }

  // ── Mostrar últimas cotizaciones guardadas ANTES del fetch ─────
  // Así la PWA nunca muestra pantalla en blanco durante el cold-start.
  try {
    const cached = loadLastCotizaciones();
    if (cached) {
      state.cotizaciones = cached;
      renderCotizaciones(cached, {});
      setStatus('loading', 'Conectando al backend...');
      console.log('[app] 💾 cotizaciones previas cargadas desde localStorage');
    }
  } catch (err) {
    console.warn('[app] ⚠️ no se pudieron cargar cotizaciones guardadas:', err.message);
  }

  // Cotizaciones es el núcleo — si falla tras los retries, reporta y sigue
  await updateCotizaciones();

  try { await updateHistorial(); }
  catch (err) { console.error('[app] ❌ updateHistorial en init:', err); }

  try {
    renderAlertas();
    console.log('[app] ✅ renderAlertas inicial OK');
  } catch (err) { console.error('[app] ❌ renderAlertas en init:', err); }

  startAlertsEngine();
  setupAutoRefresh();
  console.log('[app] ✅ init complete');
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();

// ─── Dólar AR – Aplicación principal ─────────────────────────────

const state = {
  cotizaciones: [],
  history:      [],
  lastUpdate:   null,   // Date del updatedAt que devolvió el backend
};

// ══════════════════════════════════════════════════════════════════
// Renderizado — Cotizaciones
// ══════════════════════════════════════════════════════════════════

const ACCENTS = {
  blue:            '#f59e0b',
  oficial:         '#3b82f6',
  bolsa:           '#8b5cf6',
  contadoconliqui: '#10b981',
};

function formatPrice(n) {
  if (n == null) return '—';
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}

/**
 * Renderiza las tarjetas de cotizaciones.
 *
 * Timestamp por card ELIMINADO intencionalmente:
 *   El campo `fechaActualizacion` de DolarAPI es distinto por tipo (blue,
 *   oficial, MEP, CCL se actualizan en momentos diferentes en su sistema).
 *   Mostrar ese valor por card crea la ilusión de fuentes o cachés distintos.
 *   El timestamp unificado se muestra UNA vez en la status bar.
 *
 * @param {Array} cotizaciones  Datos nuevos.
 * @param {Array} prev          Datos anteriores para calcular variación.
 *                              Se pasa explícitamente — state ya fue sobreescrito.
 */
function renderCotizaciones(cotizaciones, prev = []) {
  const grid = document.getElementById('cotizaciones-grid');
  grid.innerHTML = cotizaciones.map(d => {
    const p     = prev.find(p => p.casa === d.casa);
    const diff  = p?.venta && d.venta ? ((d.venta - p.venta) / p.venta) * 100 : null;
    const color = ACCENTS[d.casa] || '#3b82f6';

    let badge = '';
    if (diff !== null && Math.abs(diff) >= 0.01) {
      const cls  = diff > 0 ? 'badge-up' : 'badge-down';
      const sign = diff > 0 ? '+' : '';
      badge = `<span class="card-badge ${cls}">${sign}${diff.toFixed(2)}%</span>`;
    } else if (p) {
      badge = `<span class="card-badge badge-neutral">sin cambio</span>`;
    }

    return `
      <div class="card" style="--accent:${color}">
        <div class="card-header">
          <span class="card-title">${d.nombre}</span>
          ${badge}
        </div>
        <div class="card-prices">
          <div class="price-item">
            <span class="price-label">Compra</span>
            <span class="price-value compra">${formatPrice(d.compra)}</span>
          </div>
          <div class="price-item">
            <span class="price-label">Venta</span>
            <span class="price-value venta">${formatPrice(d.venta)}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════
// Renderizado — Alertas
// ══════════════════════════════════════════════════════════════════

function renderAlertas() {
  const list    = document.getElementById('alerts-list');
  const emptyEl = document.getElementById('alerts-empty');
  const alerts  = getAlertas();

  if (!alerts.length) {
    list.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  list.innerHTML = alerts.map(a => {
    const tipoLbl  = TIPO_LABEL[a.tipo] || a.tipo;
    const campoLbl = a.campo === 'compra' ? 'Compra' : 'Venta';
    const condLbl  = a.condicion === 'baja' ? '↓ baja de' : '↑ sube a';
    const statusCls = a.triggered ? 'status-triggered' : 'status-active';
    const statusLbl = a.triggered ? '✓ disparada' : '⏳ activa';
    const fecha     = new Date(a.createdAt).toLocaleDateString('es-AR');

    return `
      <div class="alert-item${a.triggered ? ' triggered' : ''}">
        <div class="alert-info">
          <span class="alert-title">${tipoLbl} ${campoLbl} ${condLbl} $${a.valor.toLocaleString('es-AR')}</span>
          <span class="alert-meta">${a.repeating ? 'Repetitiva · ' : ''}Creada el ${fecha}</span>
        </div>
        <div class="alert-actions">
          <span class="alert-status ${statusCls}">${statusLbl}</span>
          ${a.triggered
            ? `<button class="btn-icon btn-sm" title="Reactivar" onclick="handleResetAlerta('${a.id}')">↺</button>`
            : ''}
          <button class="btn-danger" title="Eliminar" onclick="handleDeleteAlerta('${a.id}')">🗑</button>
        </div>
      </div>`;
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
// Fetch de cotizaciones
// ══════════════════════════════════════════════════════════════════

async function updateCotizaciones() {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  setStatus('loading', 'Actualizando...');

  try {
    // fetchCotizaciones retorna { cotizaciones, updatedAt, stale? }
    const response      = await fetchCotizaciones();
    const cotizaciones  = response.cotizaciones || response;

    // updatedAt es el timestamp de CUANDO EL BACKEND HIZO EL FETCH a DolarAPI.
    // Es uniforme para todos los tipos — no existe inconsistencia posible.
    const updatedAt = response.updatedAt
      ? new Date(response.updatedAt)
      : new Date();

    // Evaluar alertas con los datos nuevos
    const disparadas = evalAlertas(cotizaciones);
    for (const { alert, dolar, precio } of disparadas) {
      const campoLbl = alert.campo === 'compra' ? 'Compra' : 'Venta';
      const dirLbl   = alert.condicion === 'baja' ? 'bajó a' : 'subió a';
      showLocalNotification(
        `📊 Alerta Dólar ${dolar.nombre}`,
        `${campoLbl} ${dirLbl} ${formatPrice(precio)} (límite: ${formatPrice(alert.valor)})`
      );
      showToast(
        `Alerta: ${dolar.nombre} ${campoLbl} ${dirLbl} ${formatPrice(precio)}`,
        'success', 7000
      );
      renderAlertas();
    }

    // Guardar estado ANTERIOR antes de sobreescribir para comparación de badges
    const prev         = state.cotizaciones;
    state.cotizaciones = cotizaciones;
    state.lastUpdate   = updatedAt;

    renderCotizaciones(cotizaciones, prev);

    // ── Status bar: timestamp unificado del backend ───────────────────────
    const hora = updatedAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const staleTxt = response.stale ? ' · datos rancios' : '';
    setStatus('', `Actualizado a las ${hora}${staleTxt}`);

  } catch (err) {
    console.error('[updateCotizaciones]', err.message);
    setStatus('error', 'Error al obtener cotizaciones');
    showToast(`Error: ${err.message}`, 'error', 6000);
  } finally {
    btn.classList.remove('spinning');
  }
}

async function updateHistorial() {
  try {
    state.history = await fetchHistorial();
    const tipo  = document.getElementById('chart-tipo').value;
    const campo = document.getElementById('chart-campo').value;
    renderChart(state.history, tipo, campo);
  } catch (err) {
    console.warn('[updateHistorial]', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// Modal de alerta
// ══════════════════════════════════════════════════════════════════

function openModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
  updatePriceHint();
  document.getElementById('alert-valor').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('alert-form').reset();
}

function updatePriceHint() {
  const tipo  = document.getElementById('alert-tipo').value;
  const campo = document.getElementById('alert-campo').value;
  const hint  = document.getElementById('current-price-hint');
  const d     = state.cotizaciones.find(c => c.casa === tipo);
  const p     = d ? (campo === 'compra' ? d.compra : d.venta) : null;
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

// ══════════════════════════════════════════════════════════════════
// Notificaciones
// ══════════════════════════════════════════════════════════════════

async function toggleNotifications() {
  const perm = getNotifPermission();
  if (perm === 'unsupported') {
    showToast('Tu navegador no soporta notificaciones', 'error'); return;
  }
  if (perm === 'denied') {
    showToast('Notificaciones bloqueadas. Habilitarlas en la configuración del navegador.', 'warning', 6000); return;
  }
  if (perm === 'granted') {
    showToast('Notificaciones ya activadas ✓', 'info'); return;
  }
  const result = await requestNotifPermission();
  if (result === 'granted') {
    document.getElementById('notif-btn').classList.add('active');
    showToast('Notificaciones activadas ✓', 'success');
    await subscribePushNotifications(getUserId());
  } else {
    showToast('Permiso de notificaciones denegado', 'error');
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
  const tipo  = document.getElementById('chart-tipo').value;
  const campo = document.getElementById('chart-campo').value;
  renderChart(state.history, tipo, campo);
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

  document.getElementById('alert-form').addEventListener('submit', e => {
    e.preventDefault();
    const tipo      = document.getElementById('alert-tipo').value;
    const campo     = document.getElementById('alert-campo').value;
    const condicion = document.getElementById('alert-condicion').value;
    const valor     = parseFloat(document.getElementById('alert-valor').value);
    const repeating = document.getElementById('alert-repeating').checked;

    if (!valor || valor <= 0) {
      showToast('Ingresá un valor válido', 'error'); return;
    }
    createAlerta({ tipo, campo, condicion, valor, repeating });
    closeModal();
    renderAlertas();
    showToast('Alerta creada ✓', 'success');
  });

  document.getElementById('chart-tipo').addEventListener('change', () =>
    renderChart(state.history, document.getElementById('chart-tipo').value, document.getElementById('chart-campo').value)
  );
  document.getElementById('chart-campo').addEventListener('change', () =>
    renderChart(state.history, document.getElementById('chart-tipo').value, document.getElementById('chart-campo').value)
  );
}

// ══════════════════════════════════════════════════════════════════
// Auto-refresh robusto
// ══════════════════════════════════════════════════════════════════

const STALE_MS = 2 * 60 * 1000;

function refreshAll() {
  updateCotizaciones();
  updateHistorial();
}

function setupAutoRefresh() {
  // Ciclo normal cada UPDATE_INTERVAL (5 min)
  setInterval(refreshAll, CONFIG.UPDATE_INTERVAL);

  // Al volver al tab: refrescar si los datos tienen > STALE_MS de antigüedad.
  // Cubre el caso donde el browser pausó/throttleó el setInterval en background.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const elapsed = state.lastUpdate ? Date.now() - state.lastUpdate.getTime() : Infinity;
    if (elapsed > STALE_MS) {
      console.log(`[auto-refresh] Tab visible con datos de ${Math.round(elapsed / 1000)}s → refrescando`);
      refreshAll();
    }
  });

  // Edge case desktop: foco de ventana
  window.addEventListener('focus', () => {
    const elapsed = state.lastUpdate ? Date.now() - state.lastUpdate.getTime() : Infinity;
    if (elapsed > STALE_MS) refreshAll();
  });
}

// ══════════════════════════════════════════════════════════════════
// Init
// ══════════════════════════════════════════════════════════════════

async function init() {
  loadTheme();
  setupListeners();
  await initServiceWorker();

  if (getNotifPermission() === 'granted') {
    document.getElementById('notif-btn').classList.add('active');
    subscribePushNotifications(getUserId());
  }

  await updateCotizaciones();
  await updateHistorial();
  renderAlertas();

  setupAutoRefresh();
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();

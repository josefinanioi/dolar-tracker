// ─── Dólar AR – Aplicación principal ─────────────────────────────

const state = {
  cotizaciones: [],
  history:      [],
  lastUpdate:   null,
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
 * @param {Array}  cotizaciones  Datos nuevos a mostrar.
 * @param {Array}  prev          Datos anteriores para calcular variación.
 *                               Se pasa explícitamente para no depender del estado global,
 *                               que ya fue sobreescrito antes de llamar a esta función.
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

    const hora = d.fechaActualizacion
      ? new Date(d.fechaActualizacion).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      : '';

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
        ${hora ? `<div class="card-footer">Act. ${hora}</div>` : ''}
      </div>`;
  }).join('');
}

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
  setStatus('loading', 'Actualizando cotizaciones...');

  try {
    const cotizaciones = await fetchCotizaciones();

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

    // IMPORTANTE: guardar el estado ANTERIOR antes de sobreescribir,
    // para que renderCotizaciones pueda calcular la variación correctamente.
    const prev         = state.cotizaciones;
    state.cotizaciones = cotizaciones;
    state.lastUpdate   = new Date();

    renderCotizaciones(cotizaciones, prev);

    const hora = state.lastUpdate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    setStatus('', `Actualizado a las ${hora}`);
  } catch (err) {
    console.error('[updateCotizaciones]', err);
    setStatus('error', 'Error al obtener cotizaciones');
    showToast('No se pudieron cargar las cotizaciones', 'error');
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
// Tabla de bancos
// ══════════════════════════════════════════════════════════════════

const bancosState = { data: [], sortCol: 'venta', sortDir: 'asc' };

/**
 * Renderiza la tabla de bancos.
 * @param {Array|null} data
 *   - Array con elementos → mostrar tabla
 *   - Array vacío         → mostrar "sin datos"
 *   - null                → mostrar error (backend o fuente caída)
 */
function renderBancos(data) {
  const section   = document.getElementById('bancos-section');
  const tbody     = document.getElementById('bancos-tbody');
  const updatedEl = document.getElementById('bancos-updated');

  section.style.display = '';   // siempre visible cuando se llama esta función

  if (data === null) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="bancos-status-row bancos-status-error">
          ⚠️ No se pudieron obtener los datos. La fuente puede estar temporalmente inaccesible.
        </td>
      </tr>`;
    updatedEl.textContent = 'Sin datos';
    bancosState.data = [];
    return;
  }

  if (data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="bancos-status-row">
          Sin datos disponibles en este momento.
        </td>
      </tr>`;
    updatedEl.textContent = '';
    bancosState.data = [];
    return;
  }

  bancosState.data = data;
  _paintBancos();

  const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  updatedEl.textContent = `Act. ${hora}`;
}

function _paintBancos() {
  const { data, sortCol, sortDir } = bancosState;
  if (!data.length) return;

  const mul    = sortDir === 'asc' ? 1 : -1;
  const sorted = [...data].sort((a, b) => {
    const av = a[sortCol] ?? Infinity;
    const bv = b[sortCol] ?? Infinity;
    return (av - bv) * mul;
  });

  const ventas   = sorted.map(b => b.venta).filter(Boolean);
  const compras  = sorted.map(b => b.compra).filter(Boolean);
  const minVenta  = Math.min(...ventas);
  const maxCompra = Math.max(...compras);

  document.getElementById('bancos-tbody').innerHTML = sorted.map(b => {
    const ventaCls  = b.venta  === minVenta  ? ' best-buy'  : '';
    const compraCls = b.compra === maxCompra ? ' best-sell' : '';
    return `<tr>
      <td class="col-banco">${b.banco}</td>
      <td class="col-precio${compraCls}">${formatPrice(b.compra)}</td>
      <td class="col-precio${ventaCls}">${formatPrice(b.venta)}</td>
    </tr>`;
  }).join('');

  document.querySelectorAll('.bancos-table th.sortable').forEach(th => {
    const col = th.dataset.col;
    th.classList.toggle('active', col === sortCol);
    th.classList.toggle('asc',   col === sortCol && sortDir === 'asc');
    th.classList.toggle('desc',  col === sortCol && sortDir === 'desc');
  });
}

function setupBancosSort() {
  document.querySelectorAll('.bancos-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (bancosState.sortCol === col) {
        bancosState.sortDir = bancosState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        bancosState.sortCol = col;
        bancosState.sortDir = 'asc';
      }
      _paintBancos();
    });
  });
}

async function updateBancos() {
  // Sin backend no hay manera de obtener datos de bancos (CORS impide llamar a Ambito desde browser)
  if (!CONFIG.BACKEND_URL) {
    document.getElementById('bancos-section').style.display = 'none';
    return;
  }

  // Mostrar sección con estado de carga antes de hacer el fetch
  const section = document.getElementById('bancos-section');
  const tbody   = document.getElementById('bancos-tbody');
  section.style.display = '';
  tbody.innerHTML = `
    <tr>
      <td colspan="3" class="bancos-status-row bancos-status-loading">
        Cargando cotizaciones de bancos…
      </td>
    </tr>`;

  const data = await fetchBancos();   // nunca lanza — devuelve Array | null
  renderBancos(data);
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

  // Un único listener en el botón de refresh que ejecuta todo
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

  setupBancosSort();
}

// ══════════════════════════════════════════════════════════════════
// Auto-refresh robusto
// ══════════════════════════════════════════════════════════════════

// Si al volver al tab los datos tienen más de STALE_MS, refrescar inmediatamente
const STALE_MS = 2 * 60 * 1000;

function refreshAll() {
  updateCotizaciones();
  updateHistorial();
  updateBancos();
}

function setupAutoRefresh() {
  // Ciclo periódico cada UPDATE_INTERVAL (5 min por defecto)
  setInterval(refreshAll, CONFIG.UPDATE_INTERVAL);

  // Cuando el usuario vuelve al tab (celular en segundo plano, cambio de pestaña)
  // el setInterval pudo haber sido pausado/throttleado por el browser.
  // Si los datos están viejos, refrescar inmediatamente.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const elapsed = state.lastUpdate ? Date.now() - state.lastUpdate.getTime() : Infinity;
    if (elapsed > STALE_MS) {
      console.log(`[auto-refresh] Tab visible con datos de ${Math.round(elapsed / 1000)}s → refrescando`);
      refreshAll();
    }
  });

  // Cubre edge cases de desktop (volver al foco de la ventana)
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
  updateBancos();
  renderAlertas();

  setupAutoRefresh();
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();

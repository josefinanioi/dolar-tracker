// ─── Gráfico de historial ─────────────────────────────────────────
//
// Snapshot: { ts: number, oficial: {compra, venta}, blue, mep, ccl }
// rangeMs: duración del rango en ms — determina formato de labels.

let chartInst = null;

const CHART_COLORS = {
  blue:    '#f59e0b',
  oficial: '#3b82f6',
  mep:     '#8b5cf6',
  ccl:     '#10b981',
};

const CHART_LABELS = {
  blue:    'Dólar Blue',
  oficial: 'Dólar Oficial',
  mep:     'Dólar MEP',
  ccl:     'Dólar CCL',
};

/**
 * Renderiza el gráfico de historial.
 * @param {Array}  history   Snapshots del backend.
 * @param {string} tipo      'blue' | 'oficial' | 'mep' | 'ccl'
 * @param {string} campo     'compra' | 'venta'
 * @param {number} rangeMs   Duración del rango en ms (para formatear labels).
 */
function renderChart(history, tipo, campo, rangeMs = 24 * 60 * 60 * 1000) {
  const canvas  = document.getElementById('history-chart');
  const emptyEl = document.getElementById('chart-empty');

  const relevant = (history || []).filter(s => s[tipo] != null);

  if (relevant.length < 2) {
    canvas.style.display = 'none';
    emptyEl.classList.remove('hidden');
    if (chartInst) { chartInst.destroy(); chartInst = null; }
    _updateStats(null, null, null);
    return;
  }

  canvas.style.display = 'block';
  emptyEl.classList.add('hidden');

  // ── Formato de labels según rango ─────────────────────────────
  const DAY_MS    = 24 * 60 * 60 * 1000;
  const isMultiDay = rangeMs > DAY_MS;
  const labels = relevant.map(s => {
    const d = new Date(s.ts);
    if (isMultiDay) {
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
        + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  });

  const data = relevant.map(s => {
    const prices = s[tipo];
    return prices ? (prices[campo] ?? null) : null;
  });

  // ── Stats min/máx/variación ───────────────────────────────────
  const vals = data.filter(v => v != null);
  if (vals.length >= 2) {
    const min  = Math.min(...vals);
    const max  = Math.max(...vals);
    const var_ = ((vals[vals.length - 1] - vals[0]) / vals[0]) * 100;
    _updateStats(min, max, var_);
  } else {
    _updateStats(null, null, null);
  }

  // ── Chart.js config ───────────────────────────────────────────
  const color    = CHART_COLORS[tipo] || '#3b82f6';
  const isDark   = document.body.classList.contains('dark');
  const grid     = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const tick     = isDark ? '#94a3b8' : '#475569';
  const campoLbl = campo === 'venta' ? 'Venta' : 'Compra';
  const maxTicks = isMultiDay ? 6 : 8;

  const tooltipCallbacks = {
    title: ctx => {
      if (!isMultiDay) return ctx[0].label;
      const s = relevant[ctx[0].dataIndex];
      const d = new Date(s.ts);
      return d.toLocaleString('es-AR', {
        weekday: 'short', day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    },
    label: ctx =>
      ctx.parsed.y != null
        ? `$${ctx.parsed.y.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
        : 'N/A',
  };

  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label:            `${CHART_LABELS[tipo] || tipo} — ${campoLbl}`,
        data,
        borderColor:      color,
        backgroundColor:  `${color}20`,
        borderWidth:      2,
        fill:             true,
        tension:          0.3,
        pointRadius:      relevant.length > 40 ? 0 : 3,
        pointHoverRadius: 5,
        spanGaps:         true,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: tooltipCallbacks },
      },
      scales: {
        x: {
          grid:  { color: grid },
          ticks: { color: tick, maxTicksLimit: maxTicks, maxRotation: 0 },
        },
        y: {
          grid:  { color: grid },
          ticks: { color: tick, callback: v => `$${Math.round(v).toLocaleString('es-AR')}` },
        },
      },
    },
  };

  try {
    if (chartInst) {
      chartInst.data = cfg.data;
      chartInst.options.scales.x.grid.color          = grid;
      chartInst.options.scales.x.ticks.color         = tick;
      chartInst.options.scales.x.ticks.maxTicksLimit = maxTicks;
      chartInst.options.scales.y.grid.color          = grid;
      chartInst.options.scales.y.ticks.color         = tick;
      chartInst.options.plugins.tooltip.callbacks    = tooltipCallbacks;
      chartInst.update('active');
    } else {
      chartInst = new Chart(canvas, cfg);
    }
  } catch (err) {
    console.error('[chart] ❌ ERROR al renderizar Chart.js:', err);
    // Intentar destruir instancia rota para no bloquear futuros renders
    try { if (chartInst) { chartInst.destroy(); chartInst = null; } } catch {}
  }
}

// ── Stats (mín/máx/variación) ─────────────────────────────────────

function _updateStats(min, max, varPct) {
  const statsEl = document.getElementById('chart-stats');
  if (!statsEl) return;

  if (min == null) {
    statsEl.classList.add('hidden');
    return;
  }

  statsEl.classList.remove('hidden');
  document.getElementById('stat-min').textContent = `$${Math.round(min).toLocaleString('es-AR')}`;
  document.getElementById('stat-max').textContent = `$${Math.round(max).toLocaleString('es-AR')}`;

  const varEl = document.getElementById('stat-var');
  const sign  = varPct > 0 ? '+' : '';
  varEl.textContent = `${sign}${varPct.toFixed(2)}%`;
  varEl.className   = 'stat-value ' + (varPct > 0.01 ? 'var-up' : varPct < -0.01 ? 'var-down' : 'var-neutral');
}

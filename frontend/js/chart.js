// ─── Gráfico de historial ─────────────────────────────────────────

let chartInst = null;

const CHART_COLORS = {
  blue:            '#f59e0b',
  oficial:         '#3b82f6',
  bolsa:           '#8b5cf6',
  contadoconliqui: '#10b981',
};

const CHART_LABELS = {
  blue:            'Dólar Blue',
  oficial:         'Dólar Oficial',
  bolsa:           'Dólar MEP',
  contadoconliqui: 'Dólar CCL',
};

function renderChart(history, tipo, campo) {
  const canvas  = document.getElementById('history-chart');
  const emptyEl = document.getElementById('chart-empty');

  const relevant = (history || []).filter(s =>
    s.cotizaciones && s.cotizaciones.some(c => c.casa === tipo)
  );

  if (relevant.length < 2) {
    canvas.style.display = 'none';
    emptyEl.classList.remove('hidden');
    if (chartInst) { chartInst.destroy(); chartInst = null; }
    return;
  }

  canvas.style.display = 'block';
  emptyEl.classList.add('hidden');

  const labels = relevant.map(s => {
    const d = new Date(s.ts || s.timestamp);
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  });

  const data = relevant.map(s => {
    const d = s.cotizaciones.find(c => c.casa === tipo);
    return d ? (d[campo] ?? null) : null;
  });

  const color    = CHART_COLORS[tipo] || '#3b82f6';
  const isDark   = document.body.classList.contains('dark');
  const grid     = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const tick     = isDark ? '#94a3b8' : '#475569';
  const campoLbl = campo === 'venta' ? 'Venta' : 'Compra';

  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label:           `${CHART_LABELS[tipo]} – ${campoLbl}`,
        data,
        borderColor:     color,
        backgroundColor: `${color}20`,
        borderWidth:     2,
        fill:            true,
        tension:         0.3,
        pointRadius:     relevant.length > 30 ? 0 : 3,
        pointHoverRadius: 5,
        spanGaps:        true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx =>
              ctx.parsed.y != null
                ? `$${ctx.parsed.y.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                : 'N/A',
          },
        },
      },
      scales: {
        x: { grid: { color: grid }, ticks: { color: tick, maxTicksLimit: 8, maxRotation: 0 } },
        y: {
          grid: { color: grid },
          ticks: { color: tick, callback: v => `$${v.toLocaleString('es-AR')}` },
        },
      },
    },
  };

  if (chartInst) {
    chartInst.data             = cfg.data;
    chartInst.options.scales.x.grid.color  = grid;
    chartInst.options.scales.x.ticks.color = tick;
    chartInst.options.scales.y.grid.color  = grid;
    chartInst.options.scales.y.ticks.color = tick;
    chartInst.update('active');
  } else {
    chartInst = new Chart(canvas, cfg);
  }
}

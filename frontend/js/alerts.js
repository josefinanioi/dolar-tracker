// ─── Sistema de Alertas — Dólar AR ────────────────────────────────
//
// Modelo único. Fuente de verdad: localStorage.
//
//   {
//     id,                   // 'a-{timestamp}-{random}'
//     tipo,                 // 'oficial' | 'blue' | 'mep' | 'ccl'
//     campo,                // 'compra' | 'venta'
//     condicion,            // 'baja' | 'sube'
//     valor,                // number — precio objetivo
//     repeating,            // boolean
//     state,                // 'armed' | 'triggered'
//     lastEvaluationPrice,  // number | null
//     lastTriggeredAt,      // ISO string | null
//     createdAt,            // ISO string
//   }
//
// ESTADOS: 'armed' | 'triggered'. Sin 'completed'. Sin boolean legacy.
//
// LÓGICA "baja de X":
//   armed    + precio <  X  →  DISPARA → triggered
//   armed    + precio >= X  →  sin cambio
//   triggered + precio <  X  →  silencio (ya disparada, no repetir)
//   triggered + precio >= X  →  repeating → armed | !repeating → triggered
//
// LÓGICA "sube de X" (simétrica):
//   armed    + precio >  X  →  DISPARA → triggered
//   armed    + precio <= X  →  sin cambio
//   triggered + precio >  X  →  silencio
//   triggered + precio <= X  →  repeating → armed | !repeating → triggered
//
// REGLA ABSOLUTA: el disparo ocurre ÚNICAMENTE en la transición armed → triggered.
// Nunca por refresh, focus, visibilitychange, ni por permanecer en zona de disparo.

const ALERTS_KEY = 'dolar-ar-alerts';
const USER_KEY   = 'dolar-ar-userid';

const TIPO_LABEL = { blue: 'Blue', oficial: 'Oficial', mep: 'MEP', ccl: 'CCL' };

// ══════════════════════════════════════════════════════════════════
// Guard de instancia única
// ══════════════════════════════════════════════════════════════════
//
// Llamar UNA vez desde init(). Si se llama más de una vez → hay double-init.

function startAlertsEngine() {
  if (window.__alertsEngineStarted) {
    console.warn('[alerts] ⚠️ engine already started — double init detected', {
      runtime: window.__runtimeId,
    });
    return;
  }
  window.__alertsEngineStarted = true;
  console.log('[alerts] ✅ engine started', {
    runtime:   window.__runtimeId,
    timestamp: new Date().toISOString(),
  });
}

// ══════════════════════════════════════════════════════════════════
// User ID
// ══════════════════════════════════════════════════════════════════

function getUserId() {
  let id = localStorage.getItem(USER_KEY);
  if (!id) {
    id = `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(USER_KEY, id);
  }
  return id;
}

// ══════════════════════════════════════════════════════════════════
// Storage — sin caché en memoria
// ══════════════════════════════════════════════════════════════════

function _readAlerts() {
  try {
    const raw = JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    console.error('[alerts] _readAlerts: localStorage corrupto — devolviendo []');
    return [];
  }
}

function _writeAlerts(list) {
  try {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('[alerts] _writeAlerts: error al persistir:', err);
  }
}

// ══════════════════════════════════════════════════════════════════
// CRUD
// ══════════════════════════════════════════════════════════════════

function getAlertas() {
  return _readAlerts();
}

// cotizaciones: { oficial, blue, mep, ccl } — para calcular estado inicial.
// Si el precio ya está en zona de disparo al crear → state=triggered
// para evitar notificar inmediatamente.
function createAlerta(params, cotizaciones = null) {
  const { tipo, campo, condicion, repeating } = params;
  const valor = Number(params.valor);

  if (!tipo || !campo || !condicion || Number.isNaN(valor) || valor <= 0) {
    console.error('[alerts] createAlerta: parámetros inválidos', params);
    return null;
  }

  // Estado inicial y referencia de precio.
  // lastEvaluationPrice = precio actual → el primer crossing check tendrá referencia real.
  // Si el precio ya está en zona de disparo → triggered (el crossing ocurrió antes de crear).
  // Si está del lado seguro → armed, esperando el cruce.
  let state               = 'armed';
  let lastEvaluationPrice = null;

  if (cotizaciones) {
    const precio = Number(cotizaciones[tipo]?.[campo]);
    if (!Number.isNaN(precio)) {
      lastEvaluationPrice = precio; // referencia para el primer crossing check
      const yaEnZona =
        (condicion === 'baja' && precio < valor) ||
        (condicion === 'sube' && precio > valor);
      if (yaEnZona) {
        state = 'triggered';
        console.log(`[alerts] createAlerta: precio ${precio} ya en zona → state=triggered (crossing previo)`);
      } else {
        console.log(`[alerts] createAlerta: precio ${precio} lado seguro → state=armed | lastEvaluationPrice=${precio}`);
      }
    }
  }

  const alert = {
    id:                  `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tipo,
    campo,
    condicion,
    valor,
    repeating:           !!repeating,
    state,
    lastEvaluationPrice,
    lastTriggeredAt:     null,
    createdAt:           new Date().toISOString(),
  };

  const list = _readAlerts();
  list.push(alert);
  _writeAlerts(list);

  console.log('[alerts] createAlerta OK:', alert.id, { tipo, campo, condicion, valor, state });
  apiCreateAlerta(alert).catch(() => {});
  return alert;
}

// Eliminar por ID. Lee fresco, filtra, persiste inmediatamente.
function deleteAlerta(id) {
  const list  = _readAlerts();
  const nueva = list.filter(a => a.id !== id);
  _writeAlerts(nueva);
  console.log('[alerts] deleteAlerta:', id, `(${list.length} → ${nueva.length} alertas)`);
  apiDeleteAlerta(id).catch(() => {});
}

// Editar: reemplaza los campos, re-arma siempre.
function updateAlerta(id, params) {
  const { tipo, campo, condicion, repeating } = params;
  const valor = Number(params.valor);

  if (!tipo || !campo || !condicion || Number.isNaN(valor) || valor <= 0) {
    console.error('[alerts] updateAlerta: parámetros inválidos', params);
    return null;
  }

  const list = _readAlerts();
  const idx  = list.findIndex(a => a.id === id);
  if (idx === -1) {
    console.warn('[alerts] updateAlerta: id no encontrado:', id);
    return null;
  }

  list[idx] = {
    id,
    tipo,
    campo,
    condicion,
    valor,
    repeating:           !!repeating,
    state:               'armed',
    lastEvaluationPrice: null,
    lastTriggeredAt:     null,
    createdAt:           list[idx].createdAt,
    updatedAt:           new Date().toISOString(),
  };

  _writeAlerts(list);
  console.log('[alerts] updateAlerta OK:', id, list[idx]);
  apiUpdateAlerta(id, list[idx]).catch(() => {});
  return list[idx];
}

// Re-armar manualmente (botón ↺ en UI).
function resetAlerta(id) {
  const list = _readAlerts();
  const a    = list.find(x => x.id === id);
  if (!a) {
    console.warn('[alerts] resetAlerta: id no encontrado:', id);
    return;
  }
  a.state               = 'armed';
  a.lastEvaluationPrice = null;
  _writeAlerts(list);
  console.log('[alerts] resetAlerta OK:', id, '→ armed');
}

// ══════════════════════════════════════════════════════════════════
// Título para la UI
// ══════════════════════════════════════════════════════════════════

function alertaTitle(a) {
  if (!a || typeof a !== 'object') return '(alerta inválida)';
  const tipoLbl  = TIPO_LABEL[a.tipo]  || a.tipo  || '?';
  const campoLbl = a.campo === 'compra' ? 'Compra' : 'Venta';
  const condLbl  = a.condicion === 'baja' ? '↓ baja de' : '↑ sube de';
  const valorStr = typeof a.valor === 'number'
    ? a.valor.toLocaleString('es-AR')
    : String(a.valor ?? '?');
  return `${tipoLbl} ${campoLbl} ${condLbl} $${valorStr}`;
}

// ══════════════════════════════════════════════════════════════════
// Motor de evaluación
// ══════════════════════════════════════════════════════════════════
//
// Contrato:
//   1. Lee localStorage fresco — nunca usa arrays cacheados en memoria
//   2. Evalúa cada alerta con la state machine
//   3. DISPARO ocurre SOLO en la transición armed → triggered
//   4. Escribe localStorage UNA vez al final si hubo cambios
//   5. Retorna [ { tipo, precio, mensaje } ] por cada disparo

function evalAlertas(cotizaciones) {
  if (!cotizaciones || typeof cotizaciones !== 'object') return [];

  window.__evalCount = (window.__evalCount || 0) + 1;
  console.log('[evalAlertas START]', {
    runtime:   window.__runtimeId,
    evalCount: window.__evalCount,
    timestamp: new Date().toISOString(),
  });

  // Lectura fresca — nunca referencia a array previo
  const list = _readAlerts();

  if (!list.length) {
    console.log('[evalAlertas] sin alertas');
    return [];
  }

  console.log('[evalAlertas] evaluando', list.length, 'alertas:', list.map(a =>
    `${a.id.slice(-6)}[${a.condicion} ${a.valor} state=${a.state} rep=${a.repeating}]`
  ).join(' | '));

  let dirty  = false;
  const fired = [];

  for (const alert of list) {
    try {
      // ── Normalizar state si falta o es inválido (alertas legacy) ──
      if (alert.state !== 'armed' && alert.state !== 'triggered') {
        console.warn('[evalAlertas] state inválido en', alert.id, '→ normalizando a armed');
        alert.state = 'armed';
        dirty = true;
      }

      // ── Validar campos mínimos ─────────────────────────────────
      if (!alert.tipo || !alert.campo || !alert.condicion || typeof alert.valor !== 'number') {
        console.warn('[evalAlertas] alerta malformada, saltando:', alert.id, alert);
        continue;
      }

      const prices = cotizaciones[alert.tipo];
      if (!prices) continue;

      const precio = Number(prices[alert.campo]);
      if (Number.isNaN(precio)) continue;

      const prevState = alert.state;

      // ── armed: detectar crossing ───────────────────────────────
      //
      // El disparo requiere cruce CONFIRMADO:
      //   baja: el precio anterior estaba ≥ valor y ahora está < valor
      //   sube: el precio anterior estaba ≤ valor y ahora está > valor
      //
      // Si lastEvaluationPrice es null (primera evaluación sin referencia),
      // no se puede confirmar el cruce — se actualiza la referencia y se espera.
      if (prevState === 'armed') {
        const lastPrice = alert.lastEvaluationPrice; // leer ANTES de actualizar

        // Actualizar referencia para el próximo tick
        alert.lastEvaluationPrice = precio;
        dirty = true;

        if (lastPrice === null) {
          // Primera evaluación: sin referencia previa, no se puede detectar cruce.
          console.log('[CROSSING CHECK]', {
            alertId:      alert.id.slice(-6),
            lastPrice:    null,
            currentPrice: precio,
            valor:        alert.valor,
            condicion:    alert.condicion,
            crossing:     false,
            state:        prevState,
            note:         'sin referencia previa — esperando próxima evaluación',
          });
        } else {
          const crossing =
            (alert.condicion === 'baja' && lastPrice >= alert.valor && precio < alert.valor) ||
            (alert.condicion === 'sube' && lastPrice <= alert.valor && precio > alert.valor);

          console.log('[CROSSING CHECK]', {
            alertId:      alert.id.slice(-6),
            lastPrice,
            currentPrice: precio,
            valor:        alert.valor,
            condicion:    alert.condicion,
            crossing,
            state:        prevState,
          });

          if (crossing) {
            // DISPARO: transición armed → triggered
            alert.state           = 'triggered';
            alert.lastTriggeredAt = new Date().toISOString();

            const mensaje = `${TIPO_LABEL[alert.tipo] || alert.tipo} ${alert.campo} ` +
              `${alert.condicion === 'baja' ? 'bajó de' : 'subió de'} ` +
              `$${alert.valor.toLocaleString('es-AR')} ` +
              `(ahora $${precio.toLocaleString('es-AR')})`;

            console.log('[NOTIFICATION]', {
              alertId:      alert.id,
              transition:   'armed → triggered',
              repeating:    alert.repeating,
              lastPrice,
              precioActual: precio,
              valor:        alert.valor,
              mensaje,
            });

            fired.push({ tipo: alert.tipo, precio, mensaje });
          }
        }

      // ── triggered: silencio o auto-reset ──────────────────────
      } else if (prevState === 'triggered') {
        // Hysteresis: el re-arm usa boundary ESTRICTO opuesto al trigger.
        // baja: dispara con precio < X  →  re-arma SOLO cuando precio > X  (no >=)
        // sube: dispara con precio > X  →  re-arma SOLO cuando precio < X  (no <=)
        // Mientras precio === X → permanece triggered. Elimina bounce en igualdad.
        const fueraDeZona =
          (alert.condicion === 'baja' && precio > alert.valor) ||
          (alert.condicion === 'sube' && precio < alert.valor);

        // Actualizar referencia (necesaria para el crossing check después del reset)
        alert.lastEvaluationPrice = precio;
        dirty = true;

        console.log(
          `[evalAlertas] ${alert.id.slice(-6)} triggered | ` +
          `${alert.condicion} ${alert.valor} | precio=${precio} | fueraDeZona=${fueraDeZona}`
        );

        if (fueraDeZona && alert.repeating) {
          // Auto-reset: precio volvió al lado seguro → re-armar
          // lastEvaluationPrice ya fue actualizado a precio actual,
          // que servirá de referencia para el próximo crossing check
          alert.state = 'armed';
          console.warn(
            `[evalAlertas] RESET ${alert.id.slice(-6)}: triggered → armed ` +
            `(precio=${precio} salió de zona ${alert.condicion} ${alert.valor})` +
            ` | lastEvaluationPrice=${precio}`
          );
        }
        // fueraDeZona + !repeating → triggered para siempre (reset manual con ↺)
        // enZona      + triggered  → silencio absoluto
      }

    } catch (err) {
      console.error('[evalAlertas] error en alerta', alert?.id, err);
    }
  }

  if (dirty) {
    _writeAlerts(list);
  }

  console.log(`[evalAlertas END] disparadas=${fired.length} / evaluadas=${list.length}`);
  return fired;
}

// ══════════════════════════════════════════════════════════════════
// Debug helpers (consola del navegador)
// ══════════════════════════════════════════════════════════════════
//
//   _alertasDebug.estado()      → tabla de todas las alertas
//   _alertasDebug.raw()         → array crudo de localStorage
//   _alertasDebug.limpiarTodo() → borra todo

window._alertasDebug = {
  estado() {
    const alerts = _readAlerts();
    if (!alerts.length) { console.log('[debug] No hay alertas en localStorage'); return; }
    console.table(alerts.map(a => ({
      id:        a.id.slice(-8),
      tipo:      a.tipo,
      campo:     a.campo,
      condicion: a.condicion,
      valor:     a.valor,
      repeating: a.repeating,
      state:     a.state,
      lastPrice: a.lastEvaluationPrice,
      lastFired: a.lastTriggeredAt,
    })));
  },
  raw() {
    return _readAlerts();
  },
  limpiarTodo() {
    localStorage.removeItem(ALERTS_KEY);
    console.log('[debug] alertas borradas de localStorage');
  },
};

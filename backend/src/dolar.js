const axios = require('axios');

const BASE_URL = 'https://dolarapi.com/v1';

const NOMBRE_MAP = {
  blue: 'Blue',
  oficial: 'Oficial',
  bolsa: 'MEP',
  contadoconliqui: 'CCL',
  mayorista: 'Mayorista',
};

const TIPOS_VISIBLES = ['blue', 'oficial', 'bolsa', 'contadoconliqui'];

async function fetchCotizaciones() {
  const { data } = await axios.get(`${BASE_URL}/dolares`, { timeout: 10000 });
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

// ── Cotizaciones por banco (fuente: Ambito Financiero) ─────────────
async function fetchBancos() {
  const { data } = await axios.get(
    'https://mercados.ambito.com/dolar/oficial/bancos/variacion',
    { timeout: 10000 }
  );

  // La respuesta de Ambito es { fecha, tabla: [[header...], [row...], ...] }
  if (!data?.tabla || !Array.isArray(data.tabla) || data.tabla.length < 2) {
    return [];
  }

  // Fila 0 = cabeceras, filas 1+ = datos
  const rows = data.tabla.slice(1);

  return rows
    .map(r => ({
      banco:  limpiarNombre(r[0]),
      compra: parsePrecio(r[1]),
      venta:  parsePrecio(r[2]),
    }))
    .filter(b => b.venta !== null)
    .sort((a, b) => a.venta - b.venta);  // orden ascendente por venta
}

function parsePrecio(raw) {
  if (raw == null) return null;
  const n = parseFloat(String(raw).replace(/[.$]/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function limpiarNombre(raw) {
  return String(raw ?? '')
    .replace(/^Banco\s+/i, '')   // quitar prefijo "Banco " para ahorrar espacio
    .trim();
}

module.exports = { fetchCotizaciones, fetchBancos };

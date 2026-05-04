const axios = require('axios');

const BASE_URL = 'https://dolarapi.com/v1';

const NOMBRE_MAP = {
  blue:            'Blue',
  oficial:         'Oficial',
  bolsa:           'MEP',
  contadoconliqui: 'CCL',
  mayorista:       'Mayorista',
};

const TIPOS_VISIBLES = ['blue', 'oficial', 'bolsa', 'contadoconliqui'];

async function fetchCotizaciones() {
  const { data } = await axios.get(`${BASE_URL}/dolares`, { timeout: 10000 });
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

// ── Cotizaciones por banco (fuente: Ambito Financiero) ──────────────────────
// Throws en cualquier error — el caller decide cómo manejar el fallback/cache.
async function fetchBancos() {
  const url = 'https://mercados.ambito.com/dolar/oficial/bancos/variacion';
  let data;

  try {
    const resp = await axios.get(url, { timeout: 10000 });
    data = resp.data;
  } catch (err) {
    throw new Error(`Error de red al consultar Ambito: ${err.message}`);
  }

  // Log para diagnóstico (primeros 300 chars del JSON)
  console.log('[fetchBancos] Respuesta Ambito:', JSON.stringify(data).slice(0, 300));

  if (!data?.tabla || !Array.isArray(data.tabla) || data.tabla.length < 2) {
    throw new Error(
      `Estructura inesperada de Ambito. Recibido: ${JSON.stringify(data).slice(0, 120)}`
    );
  }

  // Fila 0 = cabeceras, filas 1+ = datos
  const rows = data.tabla.slice(1);
  const result = rows
    .map(r => ({
      banco:  limpiarNombre(r[0]),
      compra: parsePrecio(r[1]),
      venta:  parsePrecio(r[2]),
    }))
    .filter(b => b.venta !== null)
    .sort((a, b) => a.venta - b.venta);

  if (result.length === 0) {
    throw new Error(
      'Ambito retornó tabla sin filas parseables. ' +
      `Primera fila de datos: ${JSON.stringify(rows[0])}`
    );
  }

  console.log(`[fetchBancos] OK — ${result.length} bancos. Ejemplo: ${JSON.stringify(result[0])}`);
  return result;
}

// Parsea precios en formato argentino: "$1.045,50" → 1045.50
function parsePrecio(raw) {
  if (raw == null) return null;
  // Elimina $ y puntos de miles, convierte coma decimal a punto
  const n = parseFloat(
    String(raw)
      .replace(/[.$]/g, '')
      .replace(',', '.')
  );
  return isNaN(n) ? null : n;
}

function limpiarNombre(raw) {
  return String(raw ?? '')
    .replace(/^Banco\s+/i, '')
    .trim();
}

module.exports = { fetchCotizaciones, fetchBancos };

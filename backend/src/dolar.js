const axios = require('axios');

// Único endpoint que se usa en toda la app
const DOLAR_API_URL = 'https://dolarapi.com/v1/dolares';

/**
 * Hace fetch a DolarAPI y devuelve cotizaciones en formato keyed:
 *   { oficial: {compra, venta}, blue: {compra, venta}, mep: {compra, venta}, ccl: {compra, venta} }
 *
 * - NO incluye fechaActualizacion (genera inconsistencias en UI)
 * - Lanza error si el fetch o el parsing falla
 */
async function fetchCotizaciones() {
  console.log('[dolar] → GET', DOLAR_API_URL);

  const { data } = await axios.get(DOLAR_API_URL, { timeout: 10000 });

  // DolarAPI devuelve un array; construir mapa por campo `casa`
  const map = {};
  for (const item of data) {
    map[item.casa] = {
      compra: item.compra ?? null,
      venta:  item.venta  ?? null,
    };
  }

  const result = {
    oficial: map.oficial          || { compra: null, venta: null },
    blue:    map.blue             || { compra: null, venta: null },
    mep:     map.bolsa            || { compra: null, venta: null },  // DolarAPI usa 'bolsa'
    ccl:     map.contadoconliqui  || { compra: null, venta: null },  // DolarAPI usa 'contadoconliqui'
  };

  console.log('[dolar] ← OK:',
    Object.entries(result)
      .map(([k, v]) => `${k} c=$${v.compra} v=$${v.venta}`)
      .join(' | ')
  );

  return result;
}

module.exports = { fetchCotizaciones };

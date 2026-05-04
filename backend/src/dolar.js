const axios = require('axios');

const BASE_URL = 'https://dolarapi.com/v1';

const NOMBRE_MAP = {
  blue:            'Blue',
  oficial:         'Oficial',
  bolsa:           'MEP',
  contadoconliqui: 'CCL',
};

const TIPOS_VISIBLES = ['blue', 'oficial', 'bolsa', 'contadoconliqui'];

async function fetchCotizaciones() {
  const url = `${BASE_URL}/dolares`;
  console.log('[fetchCotizaciones] → DolarAPI:', url);

  const { data } = await axios.get(url, { timeout: 10000 });

  const result = data
    .filter(d => TIPOS_VISIBLES.includes(d.casa))
    .map(d => ({
      casa:               d.casa,
      nombre:             NOMBRE_MAP[d.casa] || d.nombre,
      compra:             d.compra ?? null,
      venta:              d.venta  ?? null,
      // fechaActualizacion se conserva solo para referencia interna; no debe
      // mostrarse por card en el frontend (causa timestamps inconsistentes).
      fechaActualizacion: d.fechaActualizacion,
    }));

  console.log('[fetchCotizaciones] ← Raw DolarAPI:', result.length, 'tipos.',
    result.map(r => `${r.nombre}(c=${r.compra},v=${r.venta},src=${r.fechaActualizacion})`).join(' ')
  );

  return result;
}

module.exports = { fetchCotizaciones };

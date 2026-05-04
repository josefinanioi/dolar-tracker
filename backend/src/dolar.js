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

module.exports = { fetchCotizaciones };

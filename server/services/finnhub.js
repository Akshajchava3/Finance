const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 60 });
const BASE = 'https://finnhub.io/api/v1';

async function get(endpoint, params = {}) {
  const key = endpoint + JSON.stringify(params);
  if (cache.has(key)) return cache.get(key);

  const res = await axios.get(`${BASE}${endpoint}`, {
    params: { ...params, token: process.env.FINNHUB_API_KEY },
    timeout: 8000,
  });

  cache.set(key, res.data);
  return res.data;
}

module.exports = {
  quote: (symbol) => get('/quote', { symbol }),
  profile: (symbol) => get('/stock/profile2', { symbol }),
  candles: (symbol, resolution, from, to) =>
    get('/stock/candle', { symbol, resolution, from, to }),
  metrics: (symbol) => get('/stock/metric', { symbol, metric: 'all' }),
  news: (symbol) => {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    return get('/company-news', { symbol, from, to });
  },
  search: (q) => get('/search', { q }),
  sectorPerf: () => get('/sector-performance'),
  recommendations: (symbol) => get('/stock/recommendation', { symbol }),
  peers: (symbol) => get('/stock/peers', { symbol }),
};

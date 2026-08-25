const axios = require('axios');
const NodeCache = require('node-cache');

// Separate caches for data that changes at different rates
const cacheQuote   = new NodeCache({ stdTTL: 180   }); // quotes: 3 min
const cacheSlow    = new NodeCache({ stdTTL: 1800  }); // metrics, analyst: 30 min
const cacheStatic  = new NodeCache({ stdTTL: 86400 }); // profiles, peers: 24 hr
const cacheNews    = new NodeCache({ stdTTL: 300   }); // news: 5 min
const cacheSearch  = new NodeCache({ stdTTL: 60    }); // search: 1 min

const BASE = 'https://finnhub.io/api/v1';

async function get(endpoint, params = {}, store = cacheQuote) {
  const key = endpoint + JSON.stringify(params);
  if (store.has(key)) return store.get(key);

  let res;
  try {
    res = await axios.get(`${BASE}${endpoint}`, {
      params: { ...params, token: process.env.FINNHUB_API_KEY },
      timeout: 10000,
    });
  } catch (e) {
    if (e.response?.status === 429) {
      // Rate-limited: return null so callers degrade gracefully
      return null;
    }
    throw e;
  }

  if (res.status === 429) return null;

  store.set(key, res.data);
  return res.data;
}

module.exports = {
  quote:           (symbol) => get('/quote',               { symbol },                    cacheQuote),
  profile:         (symbol) => get('/stock/profile2',      { symbol },                    cacheStatic),
  metrics:         (symbol) => get('/stock/metric',        { symbol, metric: 'all' },     cacheSlow),
  news:            (symbol) => {
    const to   = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    return get('/company-news', { symbol, from, to }, cacheNews);
  },
  search:          (q)      => get('/search',              { q },                         cacheSearch),
  sectorPerf:      ()       => get('/sector-performance',  {},                            cacheQuote),
  recommendations: (symbol) => get('/stock/recommendation',{ symbol },                    cacheSlow),
  peers:           (symbol) => get('/stock/peers',         { symbol },                    cacheStatic),
  ipoCalendar:     (from, to) => get('/calendar/ipo',     { from, to },                  cacheQuote),
};

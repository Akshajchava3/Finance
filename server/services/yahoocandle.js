const https = require('https');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 120 });

const RANGES = {
  '1D':  { range: '1d',  interval: '5m'  },
  '1W':  { range: '5d',  interval: '1h'  },
  '1M':  { range: '1mo', interval: '1d'  },
  '1Y':  { range: '1y',  interval: '1wk' },
  'ALL': { range: '5y',  interval: '1mo' },
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }, res => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

async function getCandles(symbol, rangeKey) {
  const cfg = RANGES[rangeKey] || RANGES['1M'];
  const cacheKey = `ycandle:${symbol}:${rangeKey}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${cfg.range}&interval=${cfg.interval}&includeTimestamps=true`;
  const data = await fetchJSON(url);

  const result = data?.chart?.result?.[0];
  if (!result) return { s: 'no_data' };

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};

  const valid = timestamps.reduce((acc, ts, i) => {
    const c = quote.close?.[i];
    if (ts != null && c != null) acc.push(i);
    return acc;
  }, []);

  const out = {
    s: valid.length ? 'ok' : 'no_data',
    t: valid.map(i => timestamps[i]),
    c: valid.map(i => quote.close[i]),
    o: valid.map(i => quote.open?.[i] ?? quote.close[i]),
    h: valid.map(i => quote.high?.[i] ?? quote.close[i]),
    l: valid.map(i => quote.low?.[i] ?? quote.close[i]),
  };

  if (out.s === 'ok') cache.set(cacheKey, out);
  return out;
}

module.exports = { getCandles };

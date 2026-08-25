const https = require('https');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 180 });

// Well-known penny/micro-cap tickers to always include in checks
const OTC_WATCHLIST = [
  'SNDL','CLOV','MMAT','WKHS','NKLA','NAKD','OCGN','ATOS',
  'BNGO','GEVO','MVIS','IDEX','CTRM','GFAI','SHIP','TOPS',
  'AGEN','FCEL','GERN','JAGX','MEIP','VERB','MULN','NXTP',
  'INPX','DPLS','ABML','CELZ','XXII','GENE','ATNF','AMPE',
  'XSPA','BOXL','MINE','TRCH','HPNN','LIQT','SENS','AGRX',
  'BIOR','CCXI','BFRI','DARE','RNAZ','LPCN','NOVV','AULT',
];

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    });
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

async function fetchScreener(scrId) {
  const data = await fetchJSON(
    `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=100&scrIds=${scrId}&region=US&lang=en-US`
  );
  return data?.finance?.result?.[0]?.quotes || [];
}

async function fetchBatchQuotes(symbols) {
  const sym = symbols.join(',');
  const data = await fetchJSON(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}&fields=symbol,shortName,regularMarketPrice,regularMarketChangePercent,regularMarketVolume,averageDailyVolume3Month,marketCap`
  );
  return data?.quoteResponse?.result || [];
}

async function getPennyStocks(maxPrice = 5) {
  const cacheKey = `penny:${maxPrice}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const all = new Map();

  // Source 1: Yahoo Finance small-cap screener
  try {
    const screenerResults = await Promise.allSettled([
      fetchScreener('small_cap_gainers'),
      fetchScreener('aggressive_small_caps'),
    ]);
    for (const r of screenerResults) {
      if (r.status === 'fulfilled') {
        for (const q of r.value) {
          if (q.symbol && !all.has(q.symbol)) all.set(q.symbol, q);
        }
      }
    }
  } catch {}

  // Source 2: Curated OTC watchlist with live prices
  try {
    const quotes = await fetchBatchQuotes(OTC_WATCHLIST);
    for (const q of quotes) {
      if (q.symbol && !all.has(q.symbol)) all.set(q.symbol, q);
    }
  } catch {}

  // Filter: price within [0.01, maxPrice], meaningful volume
  const results = [...all.values()]
    .filter(q => {
      const p = q.regularMarketPrice;
      const v = q.regularMarketVolume || q.averageDailyVolume3Month || 0;
      return p >= 0.01 && p <= maxPrice && v >= 50000;
    })
    .map(q => ({
      symbol:   q.symbol,
      name:     q.shortName || q.longName || q.symbol,
      price:    q.regularMarketPrice,
      change:   q.regularMarketChangePercent ?? 0,
      volume:   q.regularMarketVolume || 0,
      marketCap: q.marketCap || 0,
    }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  if (results.length) cache.set(cacheKey, results);
  return results;
}

module.exports = { getPennyStocks };

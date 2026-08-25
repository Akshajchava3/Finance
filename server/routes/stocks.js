const express = require('express');
const router  = express.Router();
const fh      = require('../services/finnhub');

// Sub-$1 tickers (penny stocks) need more than 2 decimals to show real
// movement — 2 decimals rounds e.g. $0.0185 down to "$0.02".
function fmtPrice(price) {
  const p = Number(price) || 0;
  if (p === 0)  return '0.00';
  if (p < 0.01) return p.toFixed(6);
  if (p < 1)    return p.toFixed(4);
  return p.toFixed(2);
}

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query required' });
    res.json(await fh.search(q));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/quote/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const [quoteR, profileR] = await Promise.allSettled([fh.quote(ticker), fh.profile(ticker)]);
    const quote   = quoteR.status   === 'fulfilled' ? quoteR.value   : null;
    const profile = profileR.status === 'fulfilled' ? profileR.value : null;
    if (!quote || quote.c == null) {
      return res.status(429).json({ error: 'Rate limited — too many requests to market data provider. Wait a moment and try again.' });
    }
    res.json({ quote, profile: profile || {} });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const yahooCandle = require('../services/yahoocandle');

router.get('/candles/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const { range = '1D' } = req.query;
    res.json(await yahooCandle.getCandles(ticker, range));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/metrics/:ticker', async (req, res) => {
  try {
    res.json(await fh.metrics(req.params.ticker.toUpperCase()));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/news/:ticker', async (req, res) => {
  try {
    const data = await fh.news(req.params.ticker.toUpperCase());
    res.json(Array.isArray(data) ? data.slice(0, 10) : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/sectors', async (req, res) => {
  try { res.json(await fh.sectorPerf()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/analyst/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const [recs, peers] = await Promise.all([fh.recommendations(ticker), fh.peers(ticker)]);
    const latest = Array.isArray(recs) ? recs[0] : null;
    res.json({ recommendations: latest, peers: (peers || []).slice(0, 8) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// IPO calendar — past 30 days + next 90 days
router.get('/ipos', async (req, res) => {
  try {
    const now  = new Date();
    const from = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
    const to   = new Date(now + 90 * 86400000).toISOString().slice(0, 10);
    const data = await fh.ipoCalendar(from, to);
    res.json(Array.isArray(data) ? data : (data?.ipoCalendar || []));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Batch: returns quote + metrics for multiple tickers in throttled chunks
// Fires 8 tickers at a time with 120ms gaps to stay under Finnhub's rate limit.
router.get('/batch', async (req, res) => {
  try {
    const tickers = (req.query.tickers || '')
      .split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 40);

    const allResults = [];
    const CHUNK = 8;
    for (let i = 0; i < tickers.length; i += CHUNK) {
      const chunk = tickers.slice(i, i + CHUNK);
      const chunkResults = await Promise.allSettled(
        chunk.map(async (ticker) => {
          const [quoteRes, metricsRes] = await Promise.allSettled([
            fh.quote(ticker),
            fh.metrics(ticker),
          ]);
          return {
            ticker,
            quote:   quoteRes.status   === 'fulfilled' ? (quoteRes.value   || null) : null,
            metrics: metricsRes.status === 'fulfilled' ? (metricsRes.value || null) : null,
          };
        })
      );
      allResults.push(...chunkResults);
      if (i + CHUNK < tickers.length) await new Promise(r => setTimeout(r, 120));
    }

    res.json(allResults.map((r, i) =>
      r.status === 'fulfilled' ? r.value : { ticker: tickers[i], quote: null, metrics: null }
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Quick Analysis core — shared by /quick and /compare ───────────────────────

async function analyzeQuick(ticker) {
  const [quoteR, metricsR, candlesR] = await Promise.allSettled([
    fh.quote(ticker),
    fh.metrics(ticker),
    yahooCandle.getCandles(ticker, '6M'),
  ]);

  const quote   = quoteR.status   === 'fulfilled' ? quoteR.value   : null;
  const metrics = metricsR.status === 'fulfilled' ? (metricsR.value || {}) : {};
  const candles = candlesR.status === 'fulfilled' ? candlesR.value : null;

  if (!quote || quote.c == null) return null;

  const m   = metrics.metric || {};
  const pe  = m.peTTM;
  const roe = m.roeTTM;
  const div = m.dividendYieldIndicatedAnnual;

  let techBias = 0, support = null, resistance = null, w52pos = null;
  if (candles?.c?.length >= 21) {
    const closes = candles.c;
    const ema9   = closes.slice(-9).reduce((a, b) => a + b, 0) / 9;
    const ema21  = closes.slice(-21).reduce((a, b) => a + b, 0) / 21;
    techBias     = ema9 > ema21 * 1.005 ? 1 : ema9 < ema21 * 0.995 ? -1 : 0;
    const recent = closes.slice(-20);
    support      = Math.min(...recent) * 0.99;
    resistance   = Math.max(...recent) * 1.01;
  }

  let fundBias = 0;
  if (pe  != null) fundBias += pe  > 0 && pe  < 15 ? 1  : pe  > 35 ? -1   : 0;
  if (roe != null) fundBias += roe > 12             ? 0.4              : 0;

  const w52h = m['52WeekHigh'], w52l = m['52WeekLow'];
  if (w52h && w52l && w52h > w52l) {
    w52pos    = (quote.c - w52l) / (w52h - w52l);
    fundBias += w52pos < 0.25 ? 0.5 : w52pos > 0.85 ? -0.3 : 0;
  }

  const score   = techBias * 0.55 + fundBias * 0.45;
  const verdict = score >= 0.4 ? 'Buy' : score <= -0.4 ? 'Sell' : 'Hold';
  const sup     = support    || quote.c * 0.95;
  const res2    = resistance || quote.c * 1.05;
  const supFmt  = fmtPrice(sup);
  const resFmt  = fmtPrice(res2);

  const confidence = Math.abs(score) > 0.75 ? 'Strong signal'
                   : Math.abs(score) > 0.4  ? 'Moderate signal' : 'Weak signal';

  return {
    ticker,
    price:      fmtPrice(quote.c),
    change:     quote.dp ?? 0,
    verdict,
    confidence,
    advice: verdict === 'Buy'
      ? `${ticker}${w52pos != null && w52pos < 0.25 ? ' near 52W low —' : ''} showing buy signals. Consider accumulating near $${supFmt}.`
      : verdict === 'Sell'
      ? `${ticker} showing sell signals. Watch $${resFmt} resistance — trim if it stalls there.`
      : `${ticker} is range-bound. Wait for a clean break above $${resFmt} or below $${supFmt}.`,
    support:    supFmt,
    resistance: resFmt,
    technical:  techBias > 0 ? 'Bullish EMA crossover' : techBias < 0 ? 'Bearish EMA crossover' : 'Neutral',
    pe:         pe  != null ? `P/E ${pe.toFixed(1)}`       : null,
    dividend:   div != null && div > 0 ? `${div.toFixed(1)}% yield` : null,
    w52:        w52h && w52l ? `$${fmtPrice(w52l)} – $${fmtPrice(w52h)}` : null,
    _i:         { techBias, w52pos, pe, div, roe, score },
  };
}

// Agent-style natural-language reasoning paragraph
function agentReason(ticker, d) {
  const { verdict, _i: { techBias, w52pos, pe, div, roe } } = d;
  const parts = [];

  if (techBias > 0)      parts.push('short-term momentum is bullish — EMA-9 has crossed above EMA-21');
  else if (techBias < 0) parts.push('short-term momentum is bearish — EMA-9 has crossed below EMA-21');
  else                   parts.push('no clear EMA momentum signal');

  if (pe != null && pe > 0) {
    if      (pe < 12) parts.push(`deeply undervalued at ${pe.toFixed(1)}× earnings`);
    else if (pe < 20) parts.push(`reasonably valued at ${pe.toFixed(1)}× P/E`);
    else if (pe < 35) parts.push(`moderate premium at ${pe.toFixed(1)}× P/E`);
    else              parts.push(`expensive at ${pe.toFixed(1)}× P/E — priced for perfection`);
  }

  if (w52pos != null) {
    if      (w52pos < 0.20) parts.push('near its 52-week low — a historically lower-risk entry zone');
    else if (w52pos > 0.85) parts.push('near its 52-week high — extended, size positions carefully');
  }

  if (div != null && div > 3) parts.push(`pays a ${div.toFixed(1)}% dividend — adds income cushion`);
  if (roe != null && roe > 20) parts.push(`${roe.toFixed(0)}% ROE signals strong capital efficiency`);

  if (!parts.length) return `No decisive signals for ${ticker} right now. A wait-and-see posture is appropriate.`;

  const intro = verdict === 'Buy'  ? 'Signals lean bullish — '
              : verdict === 'Sell' ? 'Headwinds dominate — '
              :                      'Mixed signals — ';
  return intro + parts.slice(0, 3).join(', ') + '. (Technicals 55%, fundamentals 45%.)';
}

// ── GET /api/stocks/quick/:ticker ─────────────────────────────────────────────

router.get('/quick/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase().replace(/[^A-Z]/g, '');
    if (!ticker) return res.status(400).json({ error: 'Ticker required' });

    const result = await analyzeQuick(ticker);
    if (!result) return res.status(404).json({ error: `No data for ${ticker}` });

    // Enrich with news + peers in parallel (non-blocking — degrade if slow)
    const [newsR, peersR] = await Promise.allSettled([
      fh.news(ticker),
      fh.peers(ticker),
    ]);

    const news  = newsR.status  === 'fulfilled' && Array.isArray(newsR.value)
                ? newsR.value.slice(0, 3).map(n => ({
                    headline: n.headline,
                    source:   n.source,
                    url:      n.url,
                    time:     n.datetime,
                  }))
                : [];

    const peers = peersR.status === 'fulfilled' && Array.isArray(peersR.value)
                ? peersR.value.filter(p => p !== ticker).slice(0, 5)
                : [];

    const { _i, ...pub } = result;
    res.json({ ...pub, agentReason: agentReason(ticker, result), news, peers });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/stocks/compare?tickers=AAPL,MSFT,NVDA ───────────────────────────

router.get('/compare', async (req, res) => {
  try {
    const tickers = (req.query.tickers || '')
      .split(',').map(t => t.trim().toUpperCase().replace(/[^A-Z]/g, ''))
      .filter(t => t.length >= 1 && t.length <= 5).slice(0, 5);

    if (!tickers.length) return res.status(400).json({ error: 'No valid tickers' });

    const results = await Promise.allSettled(tickers.map(t => analyzeQuick(t)));

    res.json(tickers.map((ticker, i) => {
      const r = results[i];
      if (r.status !== 'fulfilled' || !r.value) return { ticker, error: true };
      const { _i, ...pub } = r.value;
      return pub;
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Penny Stocks ──────────────────────────────────────────────────────────────

const pennyScreen = require('../services/pennyscreen');

router.get('/penny', async (req, res) => {
  try {
    const maxPrice = parseFloat(req.query.max) || 5;
    res.json(await pennyScreen.getPennyStocks(maxPrice));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

const express = require('express');
const router  = express.Router();
const fh      = require('../services/finnhub');

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
    const [quote, profile] = await Promise.all([fh.quote(ticker), fh.profile(ticker)]);
    res.json({ quote, profile });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/candles/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const now = Math.floor(Date.now() / 1000);
    const ranges = {
      '1W': { from: now - 7  * 86400, resolution: '60' },
      '1M': { from: now - 30 * 86400, resolution: 'D'  },
      '3M': { from: now - 90 * 86400, resolution: 'D'  },
      '1Y': { from: now - 365* 86400, resolution: 'W'  },
    };
    const { range = '1M' } = req.query;
    const { from, resolution } = ranges[range] || ranges['1M'];
    res.json(await fh.candles(ticker, resolution, from, now));
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

// Batch: returns quote + metrics for multiple tickers (used by Underdogs)
router.get('/batch', async (req, res) => {
  try {
    const tickers = (req.query.tickers || '')
      .split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 30);

    const results = await Promise.allSettled(
      tickers.map(async (ticker) => {
        const [quoteRes, metricsRes] = await Promise.allSettled([
          fh.quote(ticker),
          fh.metrics(ticker),
        ]);
        return {
          ticker,
          quote:   quoteRes.status   === 'fulfilled' ? quoteRes.value   : null,
          metrics: metricsRes.status === 'fulfilled' ? metricsRes.value : null,
        };
      })
    );

    res.json(results.map((r, i) =>
      r.status === 'fulfilled' ? r.value : { ticker: tickers[i], quote: null, metrics: null }
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

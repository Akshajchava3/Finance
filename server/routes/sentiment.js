const express = require('express');
const router = express.Router();
const reddit = require('../services/reddit');
const stocktwits = require('../services/stocktwits');
const newsSent = require('../services/newssentiment');
const { analyzePosts } = require('../services/analyzer');
const explainer = require('../services/explainer');
const finnhub = require('../services/finnhub');

// Weights for each source in the combined score
const W = { reddit: 0.35, stocktwits: 0.40, news: 0.25 };

function combineScores(sources) {
  let weightedSum = 0;
  let totalWeight = 0;

  if (sources.reddit != null) {
    weightedSum += sources.reddit * W.reddit;
    totalWeight += W.reddit;
  }
  if (sources.stocktwits != null) {
    weightedSum += sources.stocktwits * W.stocktwits;
    totalWeight += W.stocktwits;
  }
  if (sources.news != null) {
    weightedSum += sources.news * W.news;
    totalWeight += W.news;
  }

  if (totalWeight === 0) return 0;
  return parseFloat((weightedSum / totalWeight).toFixed(2));
}

function scoreLabel(score) {
  if (score > 2)   return 'very positive';
  if (score > 0.5) return 'positive';
  if (score < -2)  return 'very negative';
  if (score < -0.5) return 'negative';
  return 'neutral';
}

router.get('/ticker/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();

    // Fetch all sources + stock data in parallel — failed sources degrade gracefully
    const [redditR, stwitsR, newsR, quoteR, metricsR] = await Promise.allSettled([
      reddit.searchPosts(ticker),
      stocktwits.getMessages(ticker),
      newsSent.getNewsSentiment(ticker),
      finnhub.quote(ticker),
      finnhub.metrics(ticker),
    ]);

    const redditAnalysis  = redditR.status === 'fulfilled'  ? analyzePosts(redditR.value) : null;
    const stwitsData      = stwitsR.status === 'fulfilled'  ? stwitsR.value : null;
    const newsAnalysis    = newsR.status === 'fulfilled'    ? newsR.value : null;
    const quote           = quoteR.status === 'fulfilled'   ? quoteR.value : null;
    const metrics         = metricsR.status === 'fulfilled' ? (metricsR.value?.metric || {}) : {};

    const combined = combineScores({
      reddit:     redditAnalysis?.score ?? null,
      stocktwits: stwitsData?.score     ?? null,
      news:       newsAnalysis?.score   ?? null,
    });
    const label = scoreLabel(combined);

    // Aggregate breakdown counts across all sources
    const breakdown = {
      positive: (redditAnalysis?.breakdown.positive || 0) + (stwitsData?.bullish || 0) + (newsAnalysis?.breakdown.positive || 0),
      negative: (redditAnalysis?.breakdown.negative || 0) + (stwitsData?.bearish || 0) + (newsAnalysis?.breakdown.negative || 0),
      neutral:  (redditAnalysis?.breakdown.neutral  || 0) + (stwitsData?.neutral || 0) + (newsAnalysis?.breakdown.neutral  || 0),
    };

    const explanation = explainer.generate({
      ticker,
      score:       combined,
      label,
      breakdown,
      sources: {
        reddit:     redditAnalysis,
        stocktwits: stwitsData,
        news:       newsAnalysis,
      },
      beta:        metrics.beta,
      price:       quote?.c,
      priceChange: quote?.dp,
      high52:      metrics['52WeekHigh'],
      low52:       metrics['52WeekLow'],
    });

    res.json({
      score: combined,
      label,
      breakdown,
      topKeywords: redditAnalysis?.topKeywords || [],
      posts: redditAnalysis?.posts || [],
      sources: {
        reddit: redditAnalysis
          ? { score: redditAnalysis.score, label: redditAnalysis.label, breakdown: redditAnalysis.breakdown, postCount: redditAnalysis.posts.length }
          : null,
        stocktwits: stwitsData
          ? { score: stwitsData.score, label: stwitsData.label, bullish: stwitsData.bullish, bearish: stwitsData.bearish, total: stwitsData.total, posts: stwitsData.posts }
          : null,
        news: newsAnalysis
          ? { score: newsAnalysis.score, label: newsAnalysis.label, breakdown: newsAnalysis.breakdown, articles: newsAnalysis.articles }
          : null,
      },
      explanation,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/trending', async (req, res) => {
  try {
    const [redditR, stwitsR] = await Promise.allSettled([
      reddit.getTrending(),
      stocktwits.getMessages('SPY'), // market proxy
    ]);

    const posts       = redditR.status === 'fulfilled'  ? redditR.value : [];
    const stwitsData  = stwitsR.status === 'fulfilled'  ? stwitsR.value : null;
    const analysis    = analyzePosts(posts);

    const combined = combineScores({
      reddit:     analysis.score,
      stocktwits: stwitsData?.score ?? null,
      news:       null,
    });

    res.json({
      ...analysis,
      score: combined,
      label: scoreLabel(combined),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

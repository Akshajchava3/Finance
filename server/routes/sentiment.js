const express = require('express');
const router = express.Router();
const reddit = require('../services/reddit');
const pennyReddit = require('../services/pennyreddit');
const stocktwits = require('../services/stocktwits');
const newsSent = require('../services/newssentiment');
const wsjSent = require('../services/wsj');
const saSent = require('../services/seekingalpha');
const forumSent = require('../services/investorshub');
const { analyzePosts } = require('../services/analyzer');
const explainer = require('../services/explainer');
const finnhub = require('../services/finnhub');

// Weights: Reddit 22%, StockTwits 28%, News 16%, WSJ 12%, Seeking Alpha 13%, Forums 9%
const W = { reddit: 0.22, stocktwits: 0.28, news: 0.16, wsj: 0.12, sa: 0.13, forum: 0.09 };

function combineScores(sources) {
  let weightedSum = 0, totalWeight = 0;
  for (const [key, weight] of Object.entries(W)) {
    if (sources[key] != null) {
      weightedSum += sources[key] * weight;
      totalWeight += weight;
    }
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
    const [redditR, stwitsR, newsR, wsjR, saR, forumR, quoteR, metricsR] = await Promise.allSettled([
      reddit.searchPosts(ticker),
      stocktwits.getMessages(ticker),
      newsSent.getNewsSentiment(ticker),
      wsjSent.getWSJSentiment(ticker),
      saSent.getSAsentiment(ticker),
      forumSent.getForumSentiment(ticker),
      finnhub.quote(ticker),
      finnhub.metrics(ticker),
    ]);

    const redditAnalysis = redditR.status === 'fulfilled' ? analyzePosts(redditR.value) : null;
    const stwitsData     = stwitsR.status === 'fulfilled' ? stwitsR.value : null;
    const newsAnalysis   = newsR.status   === 'fulfilled' ? newsR.value   : null;
    const wsjAnalysis    = wsjR.status    === 'fulfilled' ? wsjR.value    : null;
    const saAnalysis     = saR.status     === 'fulfilled' ? saR.value     : null;
    const forumAnalysis  = forumR.status  === 'fulfilled' ? forumR.value  : null;
    const quote          = quoteR.status  === 'fulfilled' ? quoteR.value  : null;
    const metrics        = metricsR.status=== 'fulfilled' ? (metricsR.value?.metric || {}) : {};

    const combined = combineScores({
      reddit:     redditAnalysis?.score ?? null,
      stocktwits: stwitsData?.score     ?? null,
      news:       newsAnalysis?.score   ?? null,
      wsj:        wsjAnalysis?.score    ?? null,
      sa:         saAnalysis?.score     ?? null,
      forum:      forumAnalysis?.score  ?? null,
    });
    const label = scoreLabel(combined);

    const breakdown = {
      positive: (redditAnalysis?.breakdown.positive || 0) + (stwitsData?.bullish || 0)  + (newsAnalysis?.breakdown.positive  || 0) + (wsjAnalysis?.breakdown.positive  || 0) + (saAnalysis?.breakdown.positive   || 0) + (forumAnalysis?.breakdown.positive  || 0),
      negative: (redditAnalysis?.breakdown.negative || 0) + (stwitsData?.bearish || 0)  + (newsAnalysis?.breakdown.negative  || 0) + (wsjAnalysis?.breakdown.negative  || 0) + (saAnalysis?.breakdown.negative   || 0) + (forumAnalysis?.breakdown.negative  || 0),
      neutral:  (redditAnalysis?.breakdown.neutral  || 0) + (stwitsData?.neutral  || 0) + (newsAnalysis?.breakdown.neutral   || 0) + (wsjAnalysis?.breakdown.neutral   || 0) + (saAnalysis?.breakdown.neutral    || 0) + (forumAnalysis?.breakdown.neutral   || 0),
    };

    const explanation = explainer.generate({
      ticker, score: combined, label, breakdown,
      sources: { reddit: redditAnalysis, stocktwits: stwitsData, news: newsAnalysis },
      beta: metrics.beta, price: quote?.c, priceChange: quote?.dp,
      high52: metrics['52WeekHigh'], low52: metrics['52WeekLow'],
    });

    res.json({
      score: combined, label, breakdown,
      topKeywords: redditAnalysis?.topKeywords || [],
      posts:       redditAnalysis?.posts       || [],
      sources: {
        reddit:     redditAnalysis ? { score: redditAnalysis.score, label: redditAnalysis.label, breakdown: redditAnalysis.breakdown, postCount: redditAnalysis.posts.length } : null,
        stocktwits: stwitsData     ? { score: stwitsData.score,     label: stwitsData.label,     bullish: stwitsData.bullish, bearish: stwitsData.bearish, total: stwitsData.total } : null,
        news:       newsAnalysis   ? { score: newsAnalysis.score,   label: newsAnalysis.label,   breakdown: newsAnalysis.breakdown, articles: newsAnalysis.articles } : null,
        wsj:        wsjAnalysis    ? { score: wsjAnalysis.score,    label: wsjAnalysis.label,    breakdown: wsjAnalysis.breakdown, directMentions: wsjAnalysis.directMentions } : null,
        sa:         saAnalysis     ? { score: saAnalysis.score,     label: saAnalysis.label,     breakdown: saAnalysis.breakdown, articleCount: saAnalysis.articleCount } : null,
        forum:      forumAnalysis  ? { score: forumAnalysis.score,  label: forumAnalysis.label,  breakdown: forumAnalysis.breakdown, postCount: forumAnalysis.postCount } : null,
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

// ── Penny-specific sentiment (heavier weighting on penny forums/subreddits) ───

const PW = { pennyReddit: 0.35, stocktwits: 0.20, forum: 0.25, news: 0.12, wsj: 0.08 };

router.get('/penny/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();

    const [pennyR, stwitsR, forumR, newsR, wsjR, quoteR] = await Promise.allSettled([
      pennyReddit.searchPennyPosts(ticker),
      stocktwits.getMessages(ticker),
      forumSent.getForumSentiment(ticker),
      newsSent.getNewsSentiment(ticker),
      wsjSent.getWSJSentiment(ticker),
      finnhub.quote(ticker),
    ]);

    const pennyAnalysis = pennyR.status === 'fulfilled' ? analyzePosts(pennyR.value) : null;
    const stwitsData    = stwitsR.status === 'fulfilled' ? stwitsR.value : null;
    const forumAnalysis = forumR.status  === 'fulfilled' ? forumR.value  : null;
    const newsAnalysis  = newsR.status   === 'fulfilled' ? newsR.value   : null;
    const wsjAnalysis   = wsjR.status    === 'fulfilled' ? wsjR.value    : null;
    const quote         = quoteR.status  === 'fulfilled' ? quoteR.value  : null;

    let weightedSum = 0, totalWeight = 0;
    const addSource = (score, key) => { if (score != null) { weightedSum += score * PW[key]; totalWeight += PW[key]; } };
    addSource(pennyAnalysis?.score, 'pennyReddit');
    addSource(stwitsData?.score,    'stocktwits');
    addSource(forumAnalysis?.score, 'forum');
    addSource(newsAnalysis?.score,  'news');
    addSource(wsjAnalysis?.score,   'wsj');

    const combined = totalWeight ? parseFloat((weightedSum / totalWeight).toFixed(2)) : 0;
    const label    = scoreLabel(combined);

    const breakdown = {
      positive: (pennyAnalysis?.breakdown.positive||0)+(stwitsData?.bullish||0)+(forumAnalysis?.breakdown.positive||0)+(newsAnalysis?.breakdown.positive||0),
      negative: (pennyAnalysis?.breakdown.negative||0)+(stwitsData?.bearish||0)+(forumAnalysis?.breakdown.negative||0)+(newsAnalysis?.breakdown.negative||0),
      neutral:  (pennyAnalysis?.breakdown.neutral ||0)+(stwitsData?.neutral ||0)+(forumAnalysis?.breakdown.neutral ||0)+(newsAnalysis?.breakdown.neutral ||0),
    };

    res.json({
      score: combined, label, breakdown,
      posts: pennyAnalysis?.posts || [],
      topKeywords: pennyAnalysis?.topKeywords || [],
      sources: {
        pennyReddit: pennyAnalysis ? { score: pennyAnalysis.score, label: pennyAnalysis.label, postCount: pennyAnalysis.posts.length, subreddits: pennyReddit.PENNY_SUBS } : null,
        stocktwits:  stwitsData   ? { score: stwitsData.score,    label: stwitsData.label,    bullish: stwitsData.bullish, bearish: stwitsData.bearish } : null,
        forum:       forumAnalysis ? { score: forumAnalysis.score, label: forumAnalysis.label } : null,
        news:        newsAnalysis  ? { score: newsAnalysis.score,  label: newsAnalysis.label  } : null,
      },
      price: quote?.c,
      priceChange: quote?.dp,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

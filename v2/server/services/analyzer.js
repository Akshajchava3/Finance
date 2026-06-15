const Sentiment = require('sentiment');
const analyzer = new Sentiment();

const financeExtras = {
  bullish: 3, bearish: -3, moon: 2, rocket: 2, mooning: 3,
  rally: 2, surge: 2, soar: 2, breakout: 2, squeeze: 1,
  crash: -3, plummet: -3, dump: -2, collapse: -3, tank: -2,
  oversold: 1, overbought: -1, undervalued: 2, overvalued: -2,
  buy: 1, sell: -1, short: -1, long: 1,
  profit: 2, loss: -2, gain: 2, dip: -1, correction: -1,
  strong: 2, weak: -2, beat: 2, miss: -2,
  upgrade: 2, downgrade: -2, outperform: 2, underperform: -2,
  rip: -2, rug: -3, pump: 1, 'to the moon': 3,
};

function scoreLabel(score) {
  if (score > 2) return 'very positive';
  if (score > 0.5) return 'positive';
  if (score < -2) return 'very negative';
  if (score < -0.5) return 'negative';
  return 'neutral';
}

function postLabel(score) {
  if (score > 1) return 'positive';
  if (score < -1) return 'negative';
  return 'neutral';
}

function analyzePosts(posts) {
  if (!posts.length) {
    return {
      score: 0,
      label: 'neutral',
      breakdown: { positive: 0, negative: 0, neutral: 0 },
      topKeywords: [],
      posts: [],
    };
  }

  const analyzed = posts.map((post) => {
    const text = `${post.title} ${post.text || ''}`;
    const result = analyzer.analyze(text, { extras: financeExtras });
    const weight = Math.log1p(Math.max(post.score || 1, 1));
    const label = postLabel(result.score);
    return {
      ...post,
      sentimentScore: result.score,
      sentimentLabel: label,
      weightedScore: result.score * weight,
      positiveTokens: result.positive,
      negativeTokens: result.negative,
    };
  });

  const totalWeight = analyzed.reduce(
    (s, p) => s + Math.log1p(Math.max(p.score || 1, 1)),
    0
  );
  const weightedAvg =
    totalWeight > 0
      ? analyzed.reduce((s, p) => s + p.weightedScore, 0) / totalWeight
      : 0;

  const breakdown = {
    positive: analyzed.filter((p) => p.sentimentLabel === 'positive').length,
    negative: analyzed.filter((p) => p.sentimentLabel === 'negative').length,
    neutral: analyzed.filter((p) => p.sentimentLabel === 'neutral').length,
  };

  const allTokens = analyzed.flatMap((p) =>
    [...p.positiveTokens, ...p.negativeTokens]
  );
  const freq = allTokens.reduce((acc, t) => {
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  const topKeywords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  return {
    score: Math.round(weightedAvg * 100) / 100,
    label: scoreLabel(weightedAvg),
    breakdown,
    topKeywords,
    posts: analyzed.sort((a, b) => b.score - a.score).slice(0, 25),
  };
}

module.exports = { analyzePosts };

const axios = require('axios');
const NodeCache = require('node-cache');
const { analyzePosts } = require('./analyzer');

const cache = new NodeCache({ stdTTL: 300 });

// Yahoo Finance public search endpoint — no key needed.
// Returns recent news headlines + summaries we can run NLP against.
const client = axios.create({
  baseURL: 'https://query1.finance.yahoo.com',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  },
  timeout: 8000,
});

async function getNewsSentiment(ticker) {
  const key = `news_${ticker}`;
  if (cache.has(key)) return cache.get(key);

  const res = await client.get('/v1/finance/search', {
    params: {
      q: ticker,
      newsCount: 20,
      enableFuzzyQuery: false,
      enableCb: false,
      enableNavLinks: false,
    },
  });

  const articles = (res.data?.news || []).slice(0, 15);

  // Reuse our NLP analyzer on headlines + summaries
  const posts = articles.map(a => ({
    title: a.title || '',
    text: a.summary || '',
    score: 1,
    subreddit: a.publisher?.name || 'News',
    created: a.providerPublishTime || Date.now() / 1000,
    url: a.link,
  }));

  const analysis = analyzePosts(posts);

  const result = {
    ...analysis,
    articles: articles.slice(0, 8).map(a => ({
      headline: a.title,
      source: a.publisher?.name || 'Unknown',
      url: a.link,
      created: a.providerPublishTime,
      thumbnail: a.thumbnail?.resolutions?.[0]?.url || null,
    })),
  };

  cache.set(key, result);
  return result;
}

module.exports = { getNewsSentiment };

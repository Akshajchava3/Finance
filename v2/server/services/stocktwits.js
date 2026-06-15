const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 180 });

// StockTwits public stream — no API key needed.
// Users explicitly flag their own posts Bullish/Bearish, making this
// more reliable than NLP alone for stock sentiment.
const client = axios.create({
  baseURL: 'https://api.stocktwits.com/api/2',
  headers: { 'User-Agent': 'BeanStock/1.0' },
  timeout: 8000,
});

async function getMessages(ticker) {
  const key = `stwits_${ticker}`;
  if (cache.has(key)) return cache.get(key);

  const res = await client.get(`/streams/symbol/${ticker}.json`);
  const messages = res.data?.messages || [];

  const bullish = messages.filter(m => m.sentiment?.basic === 'Bullish').length;
  const bearish = messages.filter(m => m.sentiment?.basic === 'Bearish').length;
  const neutral = messages.length - bullish - bearish;

  // Convert user-labeled sentiment into a weighted score: -10 to +10
  const labeled = bullish + bearish;
  const score = labeled > 0
    ? parseFloat(((bullish - bearish) / labeled * 10).toFixed(2))
    : 0;

  const result = {
    score,
    bullish,
    bearish,
    neutral,
    total: messages.length,
    label: score > 2 ? 'very positive' : score > 0.5 ? 'positive'
      : score < -2 ? 'very negative' : score < -0.5 ? 'negative' : 'neutral',
    posts: messages.slice(0, 10).map(m => ({
      body: m.body,
      sentiment: m.sentiment?.basic?.toLowerCase() || 'neutral',
      created: new Date(m.created_at).getTime() / 1000,
      user: m.user?.username,
      url: `https://stocktwits.com/${m.user?.username}/message/${m.id}`,
    })),
  };

  cache.set(key, result);
  return result;
}

module.exports = { getMessages };

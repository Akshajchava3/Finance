const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 });

// Reddit's JSON API now blocks server-side requests (returns HTML).
// Their RSS/Atom feeds still work — same data, different format.
const client = axios.create({
  baseURL: 'https://www.reddit.com',
  headers: {
    'User-Agent': 'BeanStock/1.0 (stock sentiment analyzer; educational)',
    'Accept': 'application/atom+xml, application/rss+xml, application/xml, text/xml',
  },
  timeout: 10000,
});

// Parse Reddit's Atom feed into a flat post array
function parseAtomFeed(xml, subreddit) {
  const entries = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const entry = m[1];
    const rawTitle   = (/<title>([\s\S]*?)<\/title>/.exec(entry)   || [])[1] || '';
    const link       = (/<link[^>]*href="([^"]*)"/.exec(entry)     || [])[1] || '';
    const updated    = (/<updated>(.*?)<\/updated>/.exec(entry)     || [])[1] || '';
    const rawContent = (/<content[^>]*>([\s\S]*?)<\/content>/.exec(entry) || [])[1] || '';

    const title = rawTitle
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();

    // Strip HTML tags from content for NLP
    const text = rawContent
      .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 1000);

    if (!title) continue;

    entries.push({
      title,
      text,
      score: 1,   // RSS doesn't expose upvote counts
      comments: 0,
      url: link,
      subreddit,
      created: updated ? Math.floor(new Date(updated).getTime() / 1000) : Math.floor(Date.now() / 1000),
      upvoteRatio: 0.7,
    });
  }
  return entries;
}

async function fetchRSS(path) {
  const res = await client.get(path);
  const xml = typeof res.data === 'string' ? res.data : '';
  if (!xml.includes('<feed') && !xml.includes('<rss')) {
    throw new Error('Reddit returned non-XML response');
  }
  return xml;
}

async function searchPosts(ticker, limit = 30) {
  const cacheKey = `search_rss_${ticker}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const subs = ['stocks', 'wallstreetbets', 'investing', 'StockMarket'];
  const allPosts = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      const xml = await fetchRSS(
        `/r/${sub}/search.rss?q=${encodeURIComponent(ticker)}&sort=new&restrict_sr=1&limit=${Math.ceil(limit / subs.length)}`
      );
      allPosts.push(...parseAtomFeed(xml, sub));
    })
  );

  cache.set(cacheKey, allPosts);
  return allPosts;
}

async function getTrending() {
  const cacheKey = 'trending_rss';
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const posts = [];

  await Promise.allSettled(
    ['stocks', 'wallstreetbets'].map(async (sub) => {
      const xml = await fetchRSS(`/r/${sub}/hot.rss?limit=20`);
      posts.push(...parseAtomFeed(xml, sub));
    })
  );

  cache.set(cacheKey, posts);
  return posts;
}

module.exports = { searchPosts, getTrending };

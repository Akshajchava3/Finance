const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 });

const client = axios.create({
  baseURL: 'https://www.reddit.com',
  headers: {
    'User-Agent': 'BeanStock/1.0 (stock sentiment analyzer; educational)',
    'Accept': 'application/atom+xml, application/rss+xml, text/xml',
  },
  timeout: 10000,
});

// Penny-stock-focused subreddits
const PENNY_SUBS = [
  'pennystocks',
  'RobinHoodPennyStocks',
  'OTCstocks',
  'MicroCapMovers',
  'Wallstreetbetsnew',
  'smallstreetbets',
];

function parseAtom(xml, subreddit) {
  const entries = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const e = m[1];
    const rawTitle   = (/<title>([\s\S]*?)<\/title>/.exec(e)   || [])[1] || '';
    const link       = (/<link[^>]*href="([^"]*)"/.exec(e)     || [])[1] || '';
    const updated    = (/<updated>(.*?)<\/updated>/.exec(e)     || [])[1] || '';
    const rawContent = (/<content[^>]*>([\s\S]*?)<\/content>/.exec(e) || [])[1] || '';

    const title = rawTitle.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim();
    const text  = rawContent.replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim().slice(0,1000);
    if (!title) continue;
    entries.push({ title, text, score:1, url:link, subreddit, created: updated ? Math.floor(new Date(updated)/1000) : Math.floor(Date.now()/1000) });
  }
  return entries;
}

async function fetchRSS(path) {
  const res = await client.get(path);
  const xml = typeof res.data === 'string' ? res.data : '';
  if (!xml.includes('<feed') && !xml.includes('<rss')) throw new Error('non-XML');
  return xml;
}

async function searchPennyPosts(ticker, limit = 30) {
  const key = `penny_search_${ticker}`;
  if (cache.has(key)) return cache.get(key);

  const allPosts = [];
  await Promise.allSettled(
    PENNY_SUBS.map(async sub => {
      const xml = await fetchRSS(
        `/r/${sub}/search.rss?q=${encodeURIComponent(ticker)}&sort=new&restrict_sr=1&limit=${Math.ceil(limit / PENNY_SUBS.length)}`
      );
      allPosts.push(...parseAtom(xml, sub));
    })
  );

  cache.set(key, allPosts);
  return allPosts;
}

async function getPennyTrending() {
  const key = 'penny_trending';
  if (cache.has(key)) return cache.get(key);

  const posts = [];
  await Promise.allSettled(
    PENNY_SUBS.slice(0, 3).map(async sub => {
      const xml = await fetchRSS(`/r/${sub}/hot.rss?limit=20`);
      posts.push(...parseAtom(xml, sub));
    })
  );

  cache.set(key, posts);
  return posts;
}

module.exports = { searchPennyPosts, getPennyTrending, PENNY_SUBS };

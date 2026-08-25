const https = require('https');
const NodeCache = require('node-cache');
const { analyzePosts } = require('./analyzer');

// The feeds are the same for every ticker — cache the parsed items once
// instead of refetching WSJ on every single ticker's sentiment request.
const cache = new NodeCache({ stdTTL: 300 });
const CACHE_KEY = 'wsj:items';

const FEEDS = [
  'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
  'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml',
];

function fetchXML(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 BeanStock/2.0' } }, res => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve(body));
    });
    req.setTimeout(6000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function stripTags(s) {
  return s ? s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').trim() : '';
}

function parseItems(xml) {
  const items = [];
  const itemRx = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRx.exec(xml)) !== null) {
    const block = m[1];
    const title = stripTags((block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '');
    const desc  = stripTags((block.match(/<description[^>]*>([\s\S]*?)<\/description>/) || [])[1] || '');
    if (title) items.push({ title, body: desc, url: '' });
  }
  return items;
}

async function getFeedItems() {
  if (cache.has(CACHE_KEY)) return cache.get(CACHE_KEY);

  const results = await Promise.allSettled(FEEDS.map(fetchXML));
  const allItems = [];
  for (const r of results) {
    if (r.status === 'fulfilled') allItems.push(...parseItems(r.value));
  }

  if (allItems.length) cache.set(CACHE_KEY, allItems);
  return allItems;
}

async function getWSJSentiment(ticker) {
  const allItems = await getFeedItems();
  if (!allItems.length) return null;

  // Filter items mentioning the ticker
  const sym = ticker.toUpperCase();
  const relevant = allItems.filter(item =>
    item.title.toUpperCase().includes(sym) || item.body.toUpperCase().includes(sym)
  );

  // Fall back to all items for broad market sentiment if no direct mentions
  const posts = relevant.length >= 2 ? relevant : allItems;

  const analysis = analyzePosts(posts);
  return {
    score:      analysis.score,
    label:      analysis.label,
    breakdown:  analysis.breakdown,
    articles:   posts.slice(0, 5).map(p => ({ headline: p.title })),
    directMentions: relevant.length,
  };
}

module.exports = { getWSJSentiment };

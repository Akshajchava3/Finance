const https = require('https');
const NodeCache = require('node-cache');
const { analyzePosts } = require('./analyzer');

const cache = new NodeCache({ stdTTL: 300 });

function fetchText(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', ...opts.headers },
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location, opts).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve(body));
    });
    req.setTimeout(7000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function stripHTML(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Parse message snippets from InvestorsHub search results HTML
function parseIHubMessages(html) {
  const items = [];
  // iHub search result posts have <div class="post_body"> or similar markers
  const postRx = /class="[^"]*post[^"]*"[^>]*>([\s\S]{10,800}?)<\/div>/gi;
  let m;
  while ((m = postRx.exec(html)) !== null) {
    const text = stripHTML(m[1]);
    if (text.length > 20) items.push({ title: text.slice(0, 120), body: text });
  }

  // Also try extracting from search result summaries
  const sumRx = /<p[^>]*class="[^"]*search[^"]*"[^>]*>([\s\S]{10,400}?)<\/p>/gi;
  while ((m = sumRx.exec(html)) !== null) {
    const text = stripHTML(m[1]);
    if (text.length > 20) items.push({ title: text.slice(0, 120), body: text });
  }

  return items;
}

// Parse ADVFN forum messages
function parseADVFNMessages(html) {
  const items = [];
  const rx = /<td[^>]*class="[^"]*bb_[^"]*"[^>]*>([\s\S]{10,600}?)<\/td>/gi;
  let m;
  while ((m = rx.exec(html)) !== null) {
    const text = stripHTML(m[1]);
    if (text.length > 15) items.push({ title: text.slice(0, 120), body: text });
  }
  return items;
}

async function getForumSentiment(ticker) {
  const key = `forum:${ticker}`;
  if (cache.has(key)) return cache.get(key);

  const sym = ticker.toUpperCase();
  const allItems = [];

  // Source 1: InvestorsHub search
  try {
    const html = await fetchText(
      `https://investorshub.advfn.com/boards/search.aspx?keywords=${encodeURIComponent(sym)}&boardid=0`
    );
    allItems.push(...parseIHubMessages(html));
  } catch {}

  // Source 2: ADVFN stock discussion (US stocks on NYSE/NASDAQ)
  try {
    const html = await fetchText(
      `https://us.advfn.com/stock-market/NASDAQ/${encodeURIComponent(sym)}/share-chat`
    );
    allItems.push(...parseADVFNMessages(html));
  } catch {}

  if (!allItems.length) return null;

  const analysis = analyzePosts(allItems.slice(0, 40));
  const result = { ...analysis, source: 'InvestorsHub/ADVFN', postCount: allItems.length };
  cache.set(key, result);
  return result;
}

module.exports = { getForumSentiment };

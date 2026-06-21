const https = require('https');
const NodeCache = require('node-cache');
const { analyzePosts } = require('./analyzer');

const cache = new NodeCache({ stdTTL: 300 });

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve, reject);
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

function parseItems(xml, ticker) {
  const items = [];
  const rx = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = rx.exec(xml)) !== null) {
    const block = m[1];
    const title = (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || '';
    const desc  = (block.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1] || '';
    const clean = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').trim();
    if (title) items.push({ title: clean(title), body: clean(desc) });
  }
  return items;
}

async function getSAsentiment(ticker) {
  const key = `sa:${ticker}`;
  if (cache.has(key)) return cache.get(key);

  // Try Seeking Alpha's symbol RSS feed
  const urls = [
    `https://seekingalpha.com/symbol/${ticker.toUpperCase()}/feed.xml`,
    `https://seekingalpha.com/api/sa/combined/${ticker.toUpperCase()}.xml`,
  ];

  for (const url of urls) {
    try {
      const xml = await fetchText(url);
      const items = parseItems(xml, ticker);
      if (items.length) {
        const analysis = analyzePosts(items);
        const result = { ...analysis, source: 'Seeking Alpha', articleCount: items.length };
        cache.set(key, result);
        return result;
      }
    } catch {}
  }
  return null;
}

module.exports = { getSAsentiment };

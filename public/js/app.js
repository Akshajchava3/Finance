// ── Setup Detection ───────────────────────────────────────────────────────────

async function checkSetup() {
  try {
    const status = await fetch('/api/status').then(r => r.json());
    if (!status.finnhub) showOnboarding();
  } catch { /* server might not be ready yet */ }
}

function showOnboarding() {
  document.getElementById('onboarding').classList.remove('hidden');
}
function dismissOnboarding() {
  document.getElementById('onboarding').classList.add('hidden');
}

// ── Navigation ────────────────────────────────────────────────────────────────

const VIEWS = document.querySelectorAll('.view');
const NAV_BTNS = document.querySelectorAll('.nav-btn');

function showView(name) {
  VIEWS.forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  NAV_BTNS.forEach(b => b.classList.toggle('active', b.dataset.view === name));
}

NAV_BTNS.forEach(btn => {
  btn.addEventListener('click', () => {
    const v = btn.dataset.view;
    showView(v);
    if (v === 'dashboard') loadDashboard();
    if (v === 'sectors') loadSectors();
  });
});

// Keyboard shortcut: "/" focuses global search
document.addEventListener('keydown', e => {
  if (e.key === '/' && !['INPUT','TEXTAREA'].includes(e.target.tagName)) {
    e.preventDefault();
    document.getElementById('globalSearch').focus();
  }
  if (e.key === 'Escape') {
    document.getElementById('searchDrop').classList.add('hidden');
    document.getElementById('globalSearch').blur();
  }
});

// ── Market Status ─────────────────────────────────────────────────────────────

function updateMarketPill() {
  const el = document.getElementById('marketPill');
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const h = et.getHours() + et.getMinutes() / 60;
  const day = et.getDay();
  const open = day >= 1 && day <= 5 && h >= 9.5 && h < 16;
  el.textContent = open ? '⬤ Market Open' : '○ Market Closed';
  el.style.color = open ? 'var(--green)' : 'var(--muted)';
  el.style.borderColor = open ? 'var(--green)' : 'var(--border)';
}
updateMarketPill();

// ── Global Search (topbar) ────────────────────────────────────────────────────

const globalSearch = document.getElementById('globalSearch');
const searchDrop = document.getElementById('searchDrop');
let searchTimer = null;

globalSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = globalSearch.value.trim();
  if (q.length < 2) { searchDrop.classList.add('hidden'); return; }
  searchTimer = setTimeout(async () => {
    try {
      const data = await API.searchStocks(q);
      const results = (data.result || []).filter(r => r.type === 'Common Stock').slice(0, 7);
      if (!results.length) { searchDrop.classList.add('hidden'); return; }
      searchDrop.innerHTML = results.map(r => `
        <div class="dd-item" data-ticker="${esc(r.symbol)}">
          <span class="dd-ticker">${esc(r.symbol)}</span>
          <span class="dd-name">${esc(r.description)}</span>
        </div>
      `).join('');
      searchDrop.querySelectorAll('.dd-item').forEach(el => {
        el.addEventListener('click', () => {
          searchDrop.classList.add('hidden');
          globalSearch.value = '';
          showView('search');
          loadStockView(el.dataset.ticker);
        });
      });
      searchDrop.classList.remove('hidden');
    } catch { searchDrop.classList.add('hidden'); }
  }, 260);
});

document.addEventListener('click', e => {
  if (!e.target.closest('.topbar-search')) searchDrop.classList.add('hidden');
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

const INDICES = [
  { ticker: 'SPY',  label: 'S&P 500' },
  { ticker: 'QQQ',  label: 'NASDAQ' },
  { ticker: 'DIA',  label: 'Dow Jones' },
  { ticker: 'IWM',  label: 'Russell 2000' },
];
const WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL'];

function loadDashboard() {
  loadIndexStats();
  loadWatchlist();
  loadTrending();
  loadDashSentiment();
}

async function loadIndexStats() {
  const row = document.getElementById('statsRow');
  try {
    const quotes = await Promise.all(INDICES.map(i => API.getQuote(i.ticker)));
    row.innerHTML = INDICES.map((idx, i) => {
      const q = quotes[i].quote;
      const chg = q.dp ?? 0;
      return `
        <div class="stat-card" onclick="showView('search'); loadStockView('${idx.ticker}')" style="cursor:pointer">
          <div class="stat-label">${idx.label}</div>
          <div class="stat-value">$${(q.c || 0).toFixed(2)}</div>
          <div class="stat-change ${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)}%</div>
        </div>
      `;
    }).join('');
  } catch { row.innerHTML = ''; }
}

async function loadWatchlist() {
  const el = document.getElementById('watchlist');
  el.innerHTML = spinner();
  try {
    const quotes = await Promise.all(WATCHLIST.map(t => API.getQuote(t)));
    el.innerHTML = WATCHLIST.map((t, i) => {
      const q = quotes[i].quote;
      const chg = q.dp ?? 0;
      return `
        <div class="wl-row" onclick="showView('search'); loadStockView('${t}')">
          <span class="wl-sym">${t}</span>
          <span class="wl-name">${tickerName(t)}</span>
          <span class="wl-price">$${(q.c || 0).toFixed(2)}</span>
          <span class="wl-chg ${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)}%</span>
        </div>
      `;
    }).join('');
  } catch (e) {
    el.innerHTML = errState(e.message.includes('key') ? 'Add FINNHUB_API_KEY to .env' : e.message, 'showOnboarding()');
  }
}

async function loadTrending() {
  const el = document.getElementById('trendingPosts');
  el.innerHTML = spinner();
  try {
    const data = await API.getTrending();
    if (!data.posts?.length) throw new Error('no_posts');
    el.innerHTML = `<div class="post-list">${data.posts.slice(0, 8).map(p => `
      <a class="post-item" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">
        <div class="post-title">${esc(p.title)}</div>
        <div class="post-meta">
          <span>r/${esc(p.subreddit)}</span>
          <span>↑ ${fmtNum(p.score)}</span>
          <span>${timeAgo(p.created)}</span>
        </div>
      </a>
    `).join('')}</div>`;
  } catch (e) {
    el.innerHTML = redditEmptyState();
  }
}

async function loadDashSentiment() {
  const el = document.getElementById('dashSent');
  el.innerHTML = spinner();
  try {
    const d = await API.getTrending();
    const total = d.breakdown.positive + d.breakdown.negative + d.breakdown.neutral || 1;
    el.innerHTML = `
      <div class="sent-body">
        <div class="sent-score" style="color:${sentColor(d.label)}">${d.score >= 0 ? '+' : ''}${d.score.toFixed(1)}</div>
        <div class="sent-label" style="color:${sentColor(d.label)}">${d.label}</div>
        ${barRow('Positive', d.breakdown.positive, total, 'pos')}
        ${barRow('Neutral',  d.breakdown.neutral,  total, 'neu')}
        ${barRow('Negative', d.breakdown.negative, total, 'neg')}
      </div>`;
  } catch { el.innerHTML = redditEmptyState('small'); }
}

function redditEmptyState(size = '') {
  return `
    <div class="empty-state">
      <div class="es-icon">📡</div>
      <div class="es-title">Reddit posts unavailable</div>
      <div class="es-body">Reddit is temporarily rate-limiting requests. Sentiment scoring still uses StockTwits and news headlines. Try again in a minute.</div>
    </div>`;
}

function barRow(label, n, total, cls) {
  return `
    <div class="bar-row">
      <span class="bar-lbl">${label}</span>
      <div class="bar-outer"><div class="bar-fill ${cls}" style="width:${pct(n, total)}%"></div></div>
      <span class="bar-count">${n}</span>
    </div>`;
}

// ── Hero search ───────────────────────────────────────────────────────────────

document.getElementById('heroSearchBtn').addEventListener('click', () => {
  const v = document.getElementById('heroSearch').value.trim().toUpperCase();
  if (v) { showView('search'); loadStockView(v); }
});
document.getElementById('heroSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('heroSearchBtn').click();
});
document.querySelectorAll('.hint-chip[data-ticker]').forEach(chip => {
  chip.addEventListener('click', () => {
    showView('search');
    loadStockView(chip.dataset.ticker);
  });
});
document.querySelectorAll('.hint-chip[data-reddit]').forEach(chip => {
  chip.addEventListener('click', () => {
    document.getElementById('redditInput').value = chip.dataset.reddit;
    loadRedditView(chip.dataset.reddit);
  });
});

// ── Stock View ────────────────────────────────────────────────────────────────

async function loadStockView(ticker) {
  const el = document.getElementById('stockResult');
  ticker = ticker.toUpperCase().trim();
  el.innerHTML = `<div style="padding:40px">${spinner()}</div>`;

  try {
    const [{ quote, profile }, metrics, news, analystData] = await Promise.all([
      API.getQuote(ticker),
      API.getMetrics(ticker),
      API.getNews(ticker),
      API.getAnalyst(ticker).catch(() => null),
    ]);

    const q = quote;
    const m = metrics.metric || {};
    const chg = q.dp ?? 0;
    const price = q.c || 0;

    el.innerHTML = `
      <div class="stock-hero">
        ${profile.logo
          ? `<img class="stock-logo" src="${esc(profile.logo)}" alt="${ticker}" onerror="this.outerHTML='<div class=stock-ph>${ticker[0]}</div>'">`
          : `<div class="stock-ph">${ticker[0]}</div>`
        }
        <div style="flex:1; min-width:0">
          <div class="sh-name">${esc(profile.name || ticker)}</div>
          <div class="sh-sub">${ticker}${profile.exchange ? ' · ' + profile.exchange : ''}${profile.finnhubIndustry ? ' · ' + profile.finnhubIndustry : ''}</div>
          <div class="sh-price">$${price.toFixed(2)}</div>
          <div class="sh-change ${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)}% today</div>
          <div class="sh-ohlc">
            <span>Open <strong>$${(q.o||0).toFixed(2)}</strong></span>
            <span>High <strong>$${(q.h||0).toFixed(2)}</strong></span>
            <span>Low <strong>$${(q.l||0).toFixed(2)}</strong></span>
            <span>Prev Close <strong>$${(q.pc||0).toFixed(2)}</strong></span>
          </div>
        </div>
      </div>

      <div class="chart-card">
        <div class="range-row" id="rangeRow">
          <button class="range-btn active" data-range="1W">1W</button>
          <button class="range-btn" data-range="1M">1M</button>
          <button class="range-btn" data-range="3M">3M</button>
          <button class="range-btn" data-range="1Y">1Y</button>
        </div>
        <div class="canvas-wrap"><canvas id="priceChart"></canvas></div>
      </div>

      <div class="metrics-section">
        <div class="section-head">
          <span class="section-title">Key Metrics</span>
          <span class="tip-badge" data-tip="Core numbers used by investors to evaluate a stock. Hover each metric for a plain-English explanation.">What do these mean?</span>
        </div>
        <div class="metrics-grid">
          ${mCard('P/E Ratio',   fmtVal(m.peNormalizedAnnual),              'Price ÷ Earnings. Lower can mean undervalued. S&P 500 avg is ~20–25.')}
          ${mCard('EPS',         fmtVal(m.epsNormalizedAnnual, '$'),         'Earnings Per Share — profit divided by shares. Higher = more earning power.')}
          ${mCard('Market Cap',  fmtBig((profile.marketCapitalization||0)*1e6), 'Total company value (price × all shares). Large-cap >$10B = more stable.')}
          ${mCard('52W High',    fmtVal(m['52WeekHigh'], '$'),               'Highest price in the last year. Near this = strong momentum or resistance.')}
          ${mCard('52W Low',     fmtVal(m['52WeekLow'], '$'),                'Lowest price in the last year. Near this = weakness or potential buying opportunity.')}
          ${mCard('Beta',        fmtVal(m.beta),                             'Volatility vs the market. >1 = more volatile than S&P 500. <1 = calmer ride.')}
          ${mCard('Dividend Yield', m.dividendYieldIndicatedAnnual ? m.dividendYieldIndicatedAnnual.toFixed(2)+'%' : 'N/A', 'Annual dividend as % of price. Income investors target consistent dividend payers.')}
          ${mCard('ROE',         m.roeTTM ? m.roeTTM.toFixed(1)+'%' : 'N/A', 'Return on Equity — how efficiently the company generates profit from shareholder money.')}
        </div>
      </div>

      ${analystData?.recommendations ? analystSection(analystData.recommendations, analystData.peers) : ''}

      <div class="metrics-section">
        <div class="section-head">
          <span class="section-title">Market Sentiment — $${ticker}</span>
          <span class="tip-badge" data-tip="Weighted score combining Reddit NLP (35%), StockTwits trader flags (40%), and news headlines (25%).">How is this scored?</span>
        </div>
        <div id="stockSent" style="padding:16px">${spinner()}</div>
      </div>

      ${news.length ? `
        <div class="metrics-section">
          <div class="section-head"><span class="section-title">Recent News</span></div>
          <div class="news-list">
            ${news.map(n => `
              <a class="news-item" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">
                ${n.image ? `<img class="news-thumb" src="${esc(n.image)}" onerror="this.style.display='none'" alt="">` : ''}
                <div>
                  <div class="news-hl">${esc(n.headline)}</div>
                  <div class="news-meta">${esc(n.source)} · ${timeAgo(n.datetime)}</div>
                </div>
              </a>
            `).join('')}
          </div>
        </div>` : ''}
    `;

    loadCandles(ticker, '1W');

    document.getElementById('rangeRow').addEventListener('click', e => {
      const btn = e.target.closest('.range-btn');
      if (!btn) return;
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadCandles(ticker, btn.dataset.range);
    });

    loadStockSentiment(ticker);

  } catch (e) {
    el.innerHTML = `<div style="padding:32px">${errState('Could not load ' + ticker + ' — ' + e.message)}</div>`;
  }
}

async function loadCandles(ticker, range) {
  try { renderPriceChart('priceChart', await API.getCandles(ticker, range), range); } catch {}
}

async function loadStockSentiment(ticker) {
  const el = document.getElementById('stockSent');
  if (!el) return;
  try {
    const d = await API.getTickerSentiment(ticker);
    el.innerHTML = sentimentBlock(d, 5);
  } catch (e) {
    el.innerHTML = `<div style="padding:16px">${errState(e.message)}</div>`;
  }
}

// ── Stock search ──────────────────────────────────────────────────────────────

document.getElementById('stockSearchBtn').addEventListener('click', () => {
  const v = document.getElementById('stockInput').value.trim().toUpperCase();
  if (v) loadStockView(v);
});
document.getElementById('stockInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('stockSearchBtn').click();
});

// ── Sectors ───────────────────────────────────────────────────────────────────

const SECTORS = [
  { name: 'Technology',  icon: '💻', tickers: ['AAPL','MSFT','NVDA','GOOGL','META'] },
  { name: 'Healthcare',  icon: '🏥', tickers: ['JNJ','PFE','UNH','ABBV','MRK'] },
  { name: 'Finance',     icon: '🏦', tickers: ['JPM','BAC','GS','MS','WFC'] },
  { name: 'Energy',      icon: '⚡', tickers: ['XOM','CVX','COP','EOG','SLB'] },
  { name: 'Consumer',    icon: '🛒', tickers: ['AMZN','TSLA','WMT','HD','NKE'] },
  { name: 'Industrials', icon: '🏭', tickers: ['CAT','DE','BA','UPS','HON'] },
  { name: 'Utilities',   icon: '💡', tickers: ['NEE','DUK','SO','AEP','EXC'] },
  { name: 'Real Estate', icon: '🏢', tickers: ['AMT','PLD','EQIX','CCI','SPG'] },
];

async function loadSectors() {
  const perf = document.getElementById('sectorPerfRow');
  const grid = document.getElementById('sectorGrid');

  try {
    const data = await API.getSectors();
    perf.innerHTML = (data || []).map(s => `
      <span class="perf-chip ${(s.atdChange||0) >= 0 ? 'up' : 'down'}">
        ${esc(s.sector)} ${(s.atdChange||0) >= 0 ? '▲' : '▼'} ${Math.abs(s.atdChange||0).toFixed(2)}%
      </span>`).join('');
  } catch { perf.innerHTML = ''; }

  grid.innerHTML = SECTORS.map(s => {
    const id = 'sec-' + s.name.replace(/\s+/g, '-');
    return `
      <div class="sector-card">
        <div class="sector-head" onclick="toggleSector(this,'${id}')">
          <span class="s-name-wrap"><span class="s-icon">${s.icon}</span>${s.name}</span>
          <span class="s-chevron">▼</span>
        </div>
        <div class="sector-stocks" id="${id}">
          ${s.tickers.map(t => `
            <div class="s-row" onclick="showView('search'); loadStockView('${t}')">
              <span class="s-ticker">${t}</span>
              <span class="s-name">${tickerName(t)}</span>
              <span class="s-price" id="sp-${t}">—</span>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');
}

function toggleSector(head, id) {
  const stocks = document.getElementById(id);
  const open = stocks.classList.contains('open');
  stocks.classList.toggle('open', !open);
  head.classList.toggle('open', !open);
  if (!open) {
    const tickers = [...stocks.querySelectorAll('.s-row')].map(r => r.querySelector('.s-ticker').textContent);
    fetchSectorPrices(tickers);
  }
}

async function fetchSectorPrices(tickers) {
  const results = await Promise.allSettled(tickers.map(t => API.getQuote(t)));
  tickers.forEach((t, i) => {
    const el = document.getElementById('sp-' + t);
    if (!el || results[i].status !== 'fulfilled') return;
    const q = results[i].value.quote;
    const chg = q.dp ?? 0;
    el.textContent = '$' + (q.c || 0).toFixed(2);
    el.style.color = chg >= 0 ? 'var(--green)' : 'var(--red)';
  });
}

// ── Reddit View ───────────────────────────────────────────────────────────────

document.getElementById('redditBtn').addEventListener('click', () => {
  const t = document.getElementById('redditInput').value.trim().toUpperCase();
  if (t) loadRedditView(t);
});
document.getElementById('redditInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('redditBtn').click();
});

async function loadRedditView(ticker) {
  const el = document.getElementById('redditResult');
  el.innerHTML = `<div style="padding:40px 0">${spinner()}</div>`;
  try {
    const d = await API.getTickerSentiment(ticker);
    const total = d.breakdown.positive + d.breakdown.negative + d.breakdown.neutral || 1;
    const cls = d.label.replace(' ', '-');
    el.innerHTML = `
      <div style="padding:24px 32px 0">
        <div class="sent-banner">
          <div class="score-ring ${cls}">
            <span class="ring-val">${d.score >= 0 ? '+' : ''}${d.score.toFixed(1)}</span>
            <span class="ring-lbl">${d.label}</span>
          </div>
          <div>
            <div class="breakdown-title">$${ticker} on Reddit</div>
            <div class="bd-row"><span class="bd-lbl">Positive</span><div class="bd-bar"><div class="bd-fill pos" style="width:${pct(d.breakdown.positive,total)}%"></div></div><span class="bd-count">${d.breakdown.positive}</span></div>
            <div class="bd-row"><span class="bd-lbl">Neutral</span><div class="bd-bar"><div class="bd-fill neu" style="width:${pct(d.breakdown.neutral,total)}%"></div></div><span class="bd-count">${d.breakdown.neutral}</span></div>
            <div class="bd-row"><span class="bd-lbl">Negative</span><div class="bd-bar"><div class="bd-fill neg" style="width:${pct(d.breakdown.negative,total)}%"></div></div><span class="bd-count">${d.breakdown.negative}</span></div>
          </div>
          ${d.topKeywords?.length ? `
            <div>
              <div class="kw-label">Top Keywords</div>
              <div class="kw-cloud">${d.topKeywords.map(k => `<span class="kw-tag">${esc(k.word)}</span>`).join('')}</div>
            </div>` : ''}
        </div>
        ${d.sources ? `<div style="margin-top:20px">${sourcePanels(d.sources)}</div>` : ''}
        ${d.explanation?.summary ? `<div style="margin-top:20px">${explanationCard(d.explanation)}</div>` : ''}
      </div>
      <div style="padding:0 32px 32px;margin-top:24px">
        <div class="card">
          <div class="card-head"><h2 class="card-title">${d.posts.length} posts found across 4 subreddits</h2></div>
          <div class="post-list">
            ${d.posts.map(p => `
              <a class="post-item ${p.sentimentLabel}" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">
                <div style="display:flex; gap:6px; align-items:center; margin-bottom:5px">
                  <span class="badge ${p.sentimentLabel}">${p.sentimentLabel}</span>
                  <span style="font-size:11px; color:var(--muted)">r/${esc(p.subreddit)}</span>
                </div>
                <div class="post-title">${esc(p.title)}</div>
                <div class="post-meta">
                  <span>↑ ${fmtNum(p.score)}</span>
                  <span>${p.comments} comments</span>
                  <span>${timeAgo(p.created)}</span>
                </div>
              </a>`).join('')}
          </div>
        </div>
      </div>`;
  } catch (e) {
    el.innerHTML = `<div style="padding:24px 32px">${
      errState(e.message)
    }</div>`;
  }
}

// ── Sentiment helpers ─────────────────────────────────────────────────────────

function sentimentBlock(d, maxPosts) {
  const total = d.breakdown.positive + d.breakdown.negative + d.breakdown.neutral || 1;
  const cls = (d.label || 'neutral').replace(' ', '-');
  const ex = d.explanation || {};

  return `
    <div class="sent-overview">
      <div class="score-ring ${cls}" style="width:72px;height:72px">
        <span class="ring-val" style="font-size:20px">${d.score >= 0 ? '+' : ''}${d.score.toFixed(1)}</span>
        <span class="ring-lbl">${d.label}</span>
      </div>
      <div class="sent-breakdown">
        ${barRow('Positive', d.breakdown.positive, total, 'pos')}
        ${barRow('Neutral',  d.breakdown.neutral,  total, 'neu')}
        ${barRow('Negative', d.breakdown.negative, total, 'neg')}
        ${d.topKeywords?.length ? `<div class="kw-cloud" style="margin-top:10px">${d.topKeywords.slice(0,6).map(k=>`<span class="kw-tag">${esc(k.word)}</span>`).join('')}</div>` : ''}
      </div>
    </div>

    ${d.sources ? sourcePanels(d.sources) : ''}
    ${ex.summary  ? explanationCard(ex) : ''}

    ${d.posts?.length ? `
      <div style="font-size:11.5px;color:var(--muted);margin:16px 0 8px">
        Top posts · r/stocks · r/wallstreetbets · r/investing
      </div>
      <div style="display:flex;flex-direction:column;gap:7px">
        ${d.posts.slice(0, maxPosts).map(p => `
          <a class="post-item ${p.sentimentLabel}" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
              <span class="badge ${p.sentimentLabel}">${p.sentimentLabel}</span>
              <span style="font-size:11px;color:var(--muted)">r/${esc(p.subreddit)}</span>
            </div>
            <div class="post-title">${esc(p.title)}</div>
            <div class="post-meta"><span>↑ ${fmtNum(p.score)}</span><span>${p.comments} comments</span><span>${timeAgo(p.created)}</span></div>
          </a>`).join('')}
      </div>` : ''}`;
}

function sourcePanels(sources) {
  const panels = [];
  if (sources.reddit) {
    const s = sources.reddit;
    panels.push(sourcePanel('Reddit', s.score, s.label, `${s.postCount || 0} posts`, '#FF4500'));
  }
  if (sources.stocktwits) {
    const s = sources.stocktwits;
    const detail = s.total ? `${s.bullish} Bullish · ${s.bearish} Bearish` : 'No data';
    panels.push(sourcePanel('StockTwits', s.score, s.label, detail, '#40A0D0'));
  }
  if (sources.news) {
    const s = sources.news;
    panels.push(sourcePanel('News', s.score, s.label, `${s.articles?.length || 0} articles`, '#F5A623'));
  }
  if (!panels.length) return '';
  return `<div class="source-grid">${panels.join('')}</div>`;
}

function sourcePanel(name, score, label, detail, accentColor) {
  const cls = (label || 'neutral').replace(' ', '-');
  const scoreStr = score != null ? `${score >= 0 ? '+' : ''}${Number(score).toFixed(1)}` : 'N/A';
  return `
    <div class="source-panel">
      <div class="source-name" style="color:${accentColor}">${name}</div>
      <div class="source-score ${cls}">${scoreStr}</div>
      <div class="source-detail">${esc(detail)}</div>
    </div>`;
}

function explanationCard(ex) {
  const bgMap  = { red:'rgba(239,68,68,0.12)',   orange:'rgba(249,115,22,0.12)', yellow:'rgba(234,179,8,0.12)',  green:'rgba(34,197,94,0.12)' };
  const txtMap = { red:'#ef4444',                orange:'#f97316',              yellow:'#ca8a04',              green:'#16a34a' };
  const bg  = bgMap[ex.riskColor]  || bgMap.yellow;
  const txt = txtMap[ex.riskColor] || txtMap.yellow;

  return `
    <div class="expl-card">
      <div class="expl-header">
        <span class="expl-title">Analysis</span>
        <span class="risk-badge" style="background:${bg};color:${txt}">${esc(ex.riskLevel)}</span>
      </div>

      <div class="expl-section">
        <div class="expl-sec-title">Market Sentiment</div>
        <p class="expl-text">${esc(ex.summary)}</p>
      </div>

      <div class="expl-section">
        <div class="expl-sec-title">Volatility</div>
        <p class="expl-text">${esc(ex.volatility)}</p>
      </div>

      <div class="expl-section">
        <div class="expl-sec-title">Price Context</div>
        <p class="expl-text">${esc(ex.priceContext)}</p>
      </div>

      ${ex.nextSteps?.length ? `
        <div class="expl-section">
          <div class="expl-sec-title">What to do next</div>
          <div class="next-steps">
            ${ex.nextSteps.map(s => `
              <div class="step-item">
                <div class="step-icon">${s.icon}</div>
                <div class="step-content">
                  <div class="step-title">${esc(s.title)}</div>
                  <div class="step-body">${esc(s.body)}</div>
                </div>
              </div>`).join('')}
          </div>
        </div>` : ''}
    </div>`;
}

function analystSection(recs, peers) {
  if (!recs) return '';
  const total = (recs.strongBuy||0) + (recs.buy||0) + (recs.hold||0) + (recs.sell||0) + (recs.strongSell||0) || 1;
  const ratings = [
    { label: 'Strong Buy', n: recs.strongBuy  || 0, cls: 'strong-buy'  },
    { label: 'Buy',        n: recs.buy         || 0, cls: 'buy'         },
    { label: 'Hold',       n: recs.hold        || 0, cls: 'hold'        },
    { label: 'Sell',       n: recs.sell        || 0, cls: 'sell'        },
    { label: 'Strong Sell',n: recs.strongSell  || 0, cls: 'strong-sell' },
  ];
  const consensus = (() => {
    const score = ((recs.strongBuy||0)*2 + (recs.buy||0)*1 + (recs.hold||0)*0 + (recs.sell||0)*-1 + (recs.strongSell||0)*-2) / total;
    if (score > 1.2)  return { label:'Strong Buy',  color:'#22c55e' };
    if (score > 0.3)  return { label:'Buy',          color:'#86efac' };
    if (score > -0.3) return { label:'Hold',         color:'#fbbf24' };
    if (score > -1.2) return { label:'Sell',         color:'#f97316' };
    return              { label:'Strong Sell',  color:'#ef4444' };
  })();

  return `
    <div class="metrics-section">
      <div class="section-head">
        <span class="section-title">Analyst Ratings</span>
        <span class="tip-badge" data-tip="Aggregated analyst recommendations from Finnhub. Period: ${esc(recs.period || 'latest')}.">What is this?</span>
      </div>
      <div style="padding:16px">
        <div class="analyst-consensus">
          <span class="consensus-label">Consensus:</span>
          <span class="consensus-val" style="color:${consensus.color}">${consensus.label}</span>
          <span style="font-size:12px;color:var(--muted);margin-left:8px">(${total} analysts)</span>
        </div>
        <div class="analyst-bar-grid">
          ${ratings.map(r => `
            <div class="analyst-bar-row">
              <span class="ar-label">${r.label}</span>
              <div class="ar-track">
                <div class="ar-fill ${r.cls}" style="width:${pct(r.n, total)}%"></div>
              </div>
              <span class="ar-count">${r.n}</span>
            </div>`).join('')}
        </div>
        ${peers?.length ? `
          <div class="peers-row">
            <span class="peers-label">Peers: </span>
            ${peers.map(p => `<span class="peer-chip" onclick="loadStockView('${esc(p)}')">${esc(p)}</span>`).join('')}
          </div>` : ''}
      </div>
    </div>`;
}

// ── Learn ─────────────────────────────────────────────────────────────────────

const GLOSSARY = [
  { icon: '📊', title: 'What is a Stock?', body: 'A stock is a small ownership share in a company. When you buy Apple stock, you own a tiny piece of Apple Inc. — and you benefit if the company grows.', example: 'Apple (AAPL) has ~15 billion shares. Own 1 share = own a tiny but real piece of the company.' },
  { icon: '📈', title: 'P/E Ratio', body: 'Price-to-Earnings ratio: how much investors pay per $1 of profit. A high P/E means investors expect big future growth. A low P/E might mean undervalued — or declining.', example: 'P/E of 25 → investors pay $25 for every $1 of earnings. S&P 500 average is ~20–25.' },
  { icon: '🏢', title: 'Market Cap', body: 'Market Cap = share price × total shares. It measures the total value of a company. Large-cap (>$10B) stocks are generally more stable but grow slower.', example: 'Large-cap: >$10B · Mid-cap: $2–10B · Small-cap: <$2B' },
  { icon: '🐂', title: 'Bull vs Bear Market', body: 'Bull market: prices are rising (bull charging upward). Bear market: prices are falling 20%+ from a recent high (bear swiping downward). Knowing which phase you\'re in changes strategy.', example: 'COVID crash (Feb–Mar 2020) = bear. 2021 recovery = bull.' },
  { icon: '⚡', title: 'Beta', body: 'Beta measures how volatile a stock is compared to the overall market (S&P 500). Beta 1 = moves with the market exactly. Higher beta = more exciting, more risky.', example: 'Beta 1.5 = 50% more volatile. Beta 0.5 = half as volatile. Tesla\'s beta is ~2.' },
  { icon: '💰', title: 'Dividends', body: 'Some companies pay dividends — regular cash payments to shareholders. Great for passive income investors who want earnings without selling their shares.', example: 'JNJ pays ~3% dividend yield. $10,000 invested → ~$300/year just for holding.' },
  { icon: '📋', title: 'EPS', body: 'Earnings Per Share = company\'s net profit ÷ shares outstanding. Higher EPS means the company earns more per share — usually a good sign.', example: 'Apple earns $100B, has 15B shares → EPS = $6.67 per share.' },
  { icon: '🔄', title: 'Dollar-Cost Averaging', body: 'Invest a fixed dollar amount at regular intervals, regardless of price. This automatically buys more shares when cheap and fewer when expensive — removing emotion from the equation.', example: 'Invest $100/month in an index fund, every month, for 10 years. Simple, effective.' },
  { icon: '🗂️', title: 'Diversification', body: 'Don\'t put all your eggs in one basket. Spreading investments across different sectors, asset types, and geographies reduces the risk that one bad day ruins everything.', example: 'Instead of 100% tech: split across tech, healthcare, finance, energy, and bonds.' },
  { icon: '📰', title: 'Sentiment Analysis', body: 'Market sentiment is the overall mood of investors. Reddit communities like r/wallstreetbets have shown they can move markets significantly — GameStop in 2021 being the famous example.', example: 'WSB buying of GME sent it from $20 to $480 in January 2021. Sentiment is real.' },
  { icon: '🎯', title: '52-Week High/Low', body: 'The highest and lowest price of a stock over the past year. Trading near a 52W high shows strength. Near a 52W low might signal weakness — or a buying opportunity depending on why.', example: 'Stock at $95 with a 52W high of $100 = 5% below its yearly peak.' },
  { icon: '📦', title: 'Market Sectors', body: 'Stocks are grouped into sectors: Technology, Healthcare, Finance, Energy, Consumer, Industrials, Utilities, Real Estate. Each reacts differently to the economy — knowing this helps you diversify.', example: 'Recession → utilities/healthcare tend to hold. Boom → tech/consumer often leads.' },
];

function loadLearn() {
  document.getElementById('learnGrid').innerHTML = GLOSSARY.map(g => `
    <div class="learn-card">
      <div class="l-icon">${g.icon}</div>
      <div class="l-title">${g.title}</div>
      <div class="l-body">${g.body}</div>
      <div class="l-example">${g.example}</div>
    </div>`).join('');
}

// ── Tooltips ──────────────────────────────────────────────────────────────────

const gtip = document.getElementById('globalTip');
document.addEventListener('mouseover', e => {
  const el = e.target.closest('[data-tip]');
  if (!el) return;
  gtip.textContent = el.dataset.tip;
  gtip.classList.remove('hidden');
});
document.addEventListener('mousemove', e => {
  if (!gtip.classList.contains('hidden')) {
    gtip.style.left = (e.clientX + 14) + 'px';
    gtip.style.top  = (e.clientY + 10) + 'px';
  }
});
document.addEventListener('mouseout', e => {
  if (e.target.closest('[data-tip]')) gtip.classList.add('hidden');
});

// ── Utilities ─────────────────────────────────────────────────────────────────

function spinner() { return '<div class="spin-wrap"><div class="spin"></div></div>'; }

function errState(msg, action) {
  return `<div class="err-state">
    <div class="err-icon">⚠️</div>
    <div class="err-msg">${esc(msg)}</div>
    ${action ? `<button class="err-action" onclick="${action}">Open setup guide →</button>` : ''}
  </div>`;
}

function mCard(label, value, tip) {
  return `<div class="metric-card">
    <div class="m-label">${label} <span class="tip-dot" data-tip="${esc(tip)}">?</span></div>
    <div class="m-val">${value}</div>
  </div>`;
}

function fmtVal(v, prefix = '') {
  if (v == null || isNaN(v) || v === 0) return 'N/A';
  return prefix + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtBig(n) {
  if (!n || isNaN(n)) return 'N/A';
  if (n >= 1e12) return '$' + (n/1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return '$' + (n/1e6).toFixed(1) + 'M';
  return '$' + n.toLocaleString();
}

function fmtNum(n) {
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1000) return (n/1000).toFixed(1) + 'k';
  return String(n || 0);
}

function pct(a, total) { return total ? Math.round((a/total)*100) : 0; }

function timeAgo(ts) {
  const s = Date.now()/1000 - ts;
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

function sentColor(label) {
  if (label?.includes('positive')) return 'var(--green)';
  if (label?.includes('negative')) return 'var(--red)';
  return 'var(--yellow)';
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const NAMES = {
  AAPL:'Apple Inc.',MSFT:'Microsoft',NVDA:'NVIDIA',GOOGL:'Alphabet (Google)',META:'Meta Platforms',
  AMZN:'Amazon',TSLA:'Tesla',JNJ:'Johnson & Johnson',PFE:'Pfizer',UNH:'UnitedHealth',
  ABBV:'AbbVie',MRK:'Merck',JPM:'JPMorgan Chase',BAC:'Bank of America',GS:'Goldman Sachs',
  MS:'Morgan Stanley',WFC:'Wells Fargo',XOM:'ExxonMobil',CVX:'Chevron',COP:'ConocoPhillips',
  EOG:'EOG Resources',SLB:'SLB (Schlumberger)',WMT:'Walmart',HD:'Home Depot',NKE:'Nike',
  CAT:'Caterpillar',DE:'John Deere',BA:'Boeing',UPS:'UPS',HON:'Honeywell',
  NEE:'NextEra Energy',DUK:'Duke Energy',SO:'Southern Co.',AEP:'Am. Electric Power',EXC:'Exelon',
  AMT:'American Tower',PLD:'Prologis',EQIX:'Equinix',CCI:'Crown Castle',SPG:'Simon Property',
  SPY:'S&P 500 ETF',QQQ:'NASDAQ 100 ETF',DIA:'Dow Jones ETF',IWM:'Russell 2000 ETF',
  GME:'GameStop',AMC:'AMC Entertainment',
};

function tickerName(t) { return NAMES[t] || t; }

// ── Init ──────────────────────────────────────────────────────────────────────

checkSetup();
loadDashboard();
loadLearn();

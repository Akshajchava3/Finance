// ── Bean Cursor ───────────────────────────────────────────────────────────────

let beanCursorOn = false;
function toggleBeanCursor() {
  beanCursorOn = !beanCursorOn;
  document.body.classList.toggle('bean-cursor', beanCursorOn);
  const btn = document.getElementById('beanCursorBtn');
  btn.classList.toggle('active', beanCursorOn);
  btn.title = beanCursorOn ? 'Bean cursor ON — click to disable' : 'Toggle bean cursor';
}

// ── First Visit & Intro Splash ────────────────────────────────────────────────

function checkFirstVisit() {
  if (!sessionStorage.getItem('bs_v2_visited')) {
    document.getElementById('introOverlay').classList.remove('hidden');
  }
}
function dismissIntro() {
  sessionStorage.setItem('bs_v2_visited', '1');
  document.getElementById('introOverlay').classList.add('hidden');
}

// ── Tutorial System ───────────────────────────────────────────────────────────

const TUT_STEPS = [
  { sel: '.sidebar',           title: '🧭 Navigation',        body: 'This sidebar is your main menu. Click any button to switch between pages — Dashboard, Stock Search, Underdogs, Sectors, Reddit Feed, and Trading 101.',  view: null,        pos: 'right'  },
  { sel: '.hero-section',      title: '🔍 Quick Search',       body: 'Type any stock ticker here — like AAPL, NVDA, or TSLA — to instantly pull up a full analysis with price charts, metrics, and sentiment.',            view: 'dashboard', pos: 'bottom' },
  { sel: '#dashSentCard',      title: '📊 Market Sentiment',   body: 'This card tells you how Reddit, StockTwits, and financial news feel about the overall market right now. It includes a plain-English buy/hold/caution verdict.',   view: 'dashboard', pos: 'right'  },
  { sel: '[data-view="search"]',     title: '🔎 Stock Search',  body: 'Deep-dive into any stock: live price chart, analyst ratings, key metrics (P/E, EPS, Beta), and multi-source sentiment analysis.',               view: null,        pos: 'right'  },
  { sel: '[data-view="underdogs"]',  title: '🌱 Underdogs',     body: 'BeanStock\'s signature feature. Stocks with strong fundamentals — low P/E, positive EPS, near yearly lows — that social media is sleeping on.',  view: null,        pos: 'right'  },
  { sel: '[data-view="sectors"]',    title: '🗂️ Sectors',       body: 'Browse all 8 major market sectors. Click one to expand it and see live prices for the top companies in that industry.',                            view: null,        pos: 'right'  },
  { sel: '[data-view="reddit"]',     title: '📡 Reddit Feed',   body: 'Enter any ticker to run NLP sentiment scoring across 4 major investing subreddits. Includes a full breakdown and per-source analysis.',           view: null,        pos: 'right'  },
  { sel: '[data-view="learn"]',      title: '📚 Trading 101',   body: 'New to stocks? This section breaks down every concept — P/E ratios, Beta, dividends, dollar-cost averaging — in plain English with examples.',    view: null,        pos: 'right'  },
  { sel: '#beanCursorBtn',           title: '🫘 Bean Mode',      body: 'One last thing — click this button in the top-right to turn your cursor into a bean. Clearly the most important feature in BeanStock.',           view: null,        pos: 'bottom' },
];

let tutStep = 0;
let tutHighlightEl = null;

function startTutorial() {
  dismissIntro();
  tutStep = 0;
  document.getElementById('tutOverlay').classList.remove('hidden');
  document.getElementById('tutBubble').classList.remove('hidden');
  buildTutDots();
  showTutStep(0);
}

function buildTutDots() {
  document.getElementById('tutDots').innerHTML = TUT_STEPS.map((_, i) =>
    `<span class="tut-dot" id="td-${i}"></span>`
  ).join('');
}

function showTutStep(idx) {
  if (tutHighlightEl) { tutHighlightEl.classList.remove('tut-highlight'); tutHighlightEl = null; }
  tutStep = idx;

  const step = TUT_STEPS[idx];
  if (step.view) { showView(step.view); setTimeout(() => positionTutStep(step, idx), 180); }
  else positionTutStep(step, idx);
}

function positionTutStep(step, idx) {
  const target = document.querySelector(step.sel);
  if (target) {
    tutHighlightEl = target;
    target.classList.add('tut-highlight');
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.getElementById('tutTitle').textContent = step.title;
  document.getElementById('tutBody').textContent  = step.body;
  document.getElementById('tutCounter').textContent = `${idx + 1} / ${TUT_STEPS.length}`;
  document.getElementById('tutNextBtn').textContent = idx === TUT_STEPS.length - 1 ? '🎉 Done!' : 'Next →';
  document.querySelectorAll('.tut-dot').forEach((d, i) => d.classList.toggle('active', i === idx));

  if (!target) return;
  setTimeout(() => {
    const rect = target.getBoundingClientRect();
    const bw = 300, bh = 200;
    let top, left;
    if (step.pos === 'right')  { top = rect.top + rect.height / 2 - bh / 2; left = rect.right + 20; }
    else if (step.pos === 'left')   { top = rect.top + rect.height / 2 - bh / 2; left = rect.left - bw - 20; }
    else if (step.pos === 'bottom') { top = rect.bottom + 16; left = rect.left + rect.width / 2 - bw / 2; }
    else                            { top = rect.top - bh - 16; left = rect.left + rect.width / 2 - bw / 2; }

    left = Math.max(16, Math.min(left, window.innerWidth  - bw - 16));
    top  = Math.max(80, Math.min(top,  window.innerHeight - bh - 16));

    document.getElementById('tutBubble').style.cssText = `top:${top}px;left:${left}px;transform:none`;
  }, 60);
}

function nextTutStep() {
  if (tutStep >= TUT_STEPS.length - 1) { exitTutorial(); return; }
  showTutStep(tutStep + 1);
}

function exitTutorial() {
  if (tutHighlightEl) { tutHighlightEl.classList.remove('tut-highlight'); tutHighlightEl = null; }
  document.getElementById('tutOverlay').classList.add('hidden');
  document.getElementById('tutBubble').classList.add('hidden');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') { dismissIntro(); exitTutorial(); } });

// ── Setup Detection ───────────────────────────────────────────────────────────

async function checkSetup() {
  try {
    const status = await fetch('/api/status').then(r => r.json());
    if (!status.finnhub) showOnboarding();
  } catch {}
}

function showOnboarding()    { document.getElementById('onboarding').classList.remove('hidden'); }
function dismissOnboarding() { document.getElementById('onboarding').classList.add('hidden'); }

// ── Navigation ────────────────────────────────────────────────────────────────

const VIEWS    = document.querySelectorAll('.view');
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
    if (v === 'sectors')   loadSectors();
    if (v === 'underdogs') loadUnderdogs();
    if (v === 'learn')     loadLearn();
  });
});

document.addEventListener('keydown', e => {
  if (e.key === '/' && !['INPUT','TEXTAREA'].includes(e.target.tagName)) {
    e.preventDefault();
    document.getElementById('globalSearch').focus();
  }
});

// ── Market Status ─────────────────────────────────────────────────────────────

function updateMarketPill() {
  const el = document.getElementById('marketPill');
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const h = et.getHours() + et.getMinutes() / 60;
  const day = et.getDay();
  const open = day >= 1 && day <= 5 && h >= 9.5 && h < 16;
  el.textContent    = open ? '⬤ Market Open' : '○ Market Closed';
  el.style.color    = open ? 'var(--green)' : 'var(--muted)';
  el.style.borderColor = open ? 'var(--green)' : 'var(--border)';
}
updateMarketPill();

// ── Global Search ─────────────────────────────────────────────────────────────

const globalSearch = document.getElementById('globalSearch');
const searchDrop   = document.getElementById('searchDrop');
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
        </div>`).join('');
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

const INDICES   = [
  { ticker: 'SPY', label: 'S&P 500' },
  { ticker: 'QQQ', label: 'NASDAQ'  },
  { ticker: 'DIA', label: 'Dow Jones' },
  { ticker: 'IWM', label: 'Russell 2000' },
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
        </div>`;
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
          <span class="wl-sent" id="wls-${t}"><span class="wl-sent-loading">…</span></span>
        </div>`;
    }).join('');
    loadWatchlistSentiment();
  } catch (e) {
    el.innerHTML = errState(e.message.includes('key') ? 'Add FINNHUB_API_KEY to .env' : e.message, 'showOnboarding()');
  }
}

async function loadWatchlistSentiment() {
  await Promise.allSettled(WATCHLIST.map(async (ticker) => {
    try {
      const d = await API.getTickerSentiment(ticker);
      const el = document.getElementById(`wls-${ticker}`);
      if (!el) return;
      const s = d.score;
      const cls = s > 1 ? 'pos' : s < -1 ? 'neg' : 'neu';
      el.innerHTML = `<span class="wl-sent-pill ${cls}">${s >= 0 ? '+' : ''}${s.toFixed(1)}</span>`;
    } catch (e) {
      const el = document.getElementById(`wls-${ticker}`);
      if (el) el.innerHTML = '<span class="wl-sent-loading">—</span>';
    }
  }));
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
      </a>`).join('')}</div>`;
  } catch { el.innerHTML = redditEmptyState(); }
}

function marketVerdict(score) {
  if (score > 3)  return { icon: '🚀', label: 'Very Bullish',  color: '#22c55e', action: 'Lean Buy',     advice: 'Social sentiment is very optimistic. Generally favorable conditions for buyers — but beware of over-exuberance. Not all bullish runs last.' };
  if (score > 1)  return { icon: '🐂', label: 'Bullish',       color: '#86efac', action: 'Watch Entries', advice: 'Positive sentiment overall. A good environment to do research and look for entry points in stocks you\'ve already vetted.' };
  if (score > -1) return { icon: '⚖️',  label: 'Neutral',       color: '#fbbf24', action: 'Hold & Watch', advice: 'Mixed signals — no strong consensus either way. A good time to monitor your positions and wait for clearer direction.' };
  if (score > -3) return { icon: '🐻', label: 'Bearish',       color: '#f97316', action: 'Caution',      advice: 'Sentiment is leaning negative. Investors are cautious. Consider reviewing your positions and adding defensive assets.' };
  return              { icon: '🚨', label: 'Very Bearish',  color: '#ef4444', action: 'Risk-Off',     advice: 'Heavy bearish sentiment dominates social platforms. Significant concern across Reddit, StockTwits, and news. Elevated risk environment.' };
}

async function loadDashSentiment() {
  const el = document.getElementById('dashSent');
  el.innerHTML = spinner();
  try {
    const d = await API.getTrending();
    const total = d.breakdown.positive + d.breakdown.negative + d.breakdown.neutral || 1;
    const v = marketVerdict(d.score);
    el.innerHTML = `
      <div class="sent-body">
        <div class="sent-score" style="color:${sentColor(d.label)}">${d.score >= 0 ? '+' : ''}${d.score.toFixed(1)}</div>
        <div class="sent-label" style="color:${sentColor(d.label)}">${d.label}</div>
        ${barRow('Positive', d.breakdown.positive, total, 'pos')}
        ${barRow('Neutral',  d.breakdown.neutral,  total, 'neu')}
        ${barRow('Negative', d.breakdown.negative, total, 'neg')}
        <div class="verdict-card" style="border-color:${v.color}30;background:${v.color}0e">
          <div class="verdict-top">
            <span class="verdict-icon">${v.icon}</span>
            <span class="verdict-label" style="color:${v.color}">${v.label}</span>
            <span class="verdict-action" style="background:${v.color}22;color:${v.color}">${v.action}</span>
          </div>
          <p class="verdict-advice">${v.advice}</p>
          <p class="verdict-note">Based on Reddit + StockTwits + News · Not financial advice</p>
        </div>
      </div>`;
  } catch { el.innerHTML = redditEmptyState('small'); }
}

function redditEmptyState() {
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

// ── Hero Search ───────────────────────────────────────────────────────────────

document.getElementById('heroSearchBtn').addEventListener('click', () => {
  const v = document.getElementById('heroSearch').value.trim().toUpperCase();
  if (v) { showView('search'); loadStockView(v); }
});
document.getElementById('heroSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('heroSearchBtn').click();
});
document.querySelectorAll('.hint-chip[data-ticker]').forEach(chip => {
  chip.addEventListener('click', () => { showView('search'); loadStockView(chip.dataset.ticker); });
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
          : `<div class="stock-ph">${ticker[0]}</div>`}
        <div style="flex:1;min-width:0">
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
          <span class="tip-badge" data-tip="Core numbers investors use to evaluate a stock. Hover each metric for a plain-English explanation.">What do these mean?</span>
        </div>
        <div class="metrics-grid">
          ${mCard('P/E Ratio',      fmtVal(m.peNormalizedAnnual),                  'Price ÷ Earnings. Lower can mean undervalued. S&P 500 avg is ~20–25.')}
          ${mCard('EPS',            fmtVal(m.epsNormalizedAnnual, '$'),             'Earnings Per Share — profit divided by shares. Higher = more earning power.')}
          ${mCard('Market Cap',     fmtBig((profile.marketCapitalization||0)*1e6),  'Total company value. Large-cap >$10B = more stable.')}
          ${mCard('52W High',       fmtVal(m['52WeekHigh'], '$'),                  'Highest price in the last year. Near this = strong momentum or resistance.')}
          ${mCard('52W Low',        fmtVal(m['52WeekLow'],  '$'),                  'Lowest price in the last year. Near this = weakness or potential opportunity.')}
          ${mCard('Beta',           fmtVal(m.beta),                                'Volatility vs the market. >1 = more volatile than S&P 500.')}
          ${mCard('Dividend Yield', m.dividendYieldIndicatedAnnual ? m.dividendYieldIndicatedAnnual.toFixed(2)+'%' : 'N/A', 'Annual dividend as % of price. Income investors target consistent dividend payers.')}
          ${mCard('ROE',            m.roeTTM ? m.roeTTM.toFixed(1)+'%' : 'N/A',   'Return on Equity — how efficiently the company generates profit.')}
        </div>
      </div>

      ${analystData?.recommendations ? analystSection(analystData.recommendations, analystData.peers) : ''}

      <div class="metrics-section">
        <div class="section-head">
          <span class="section-title">Market Sentiment — $${ticker}</span>
          <span class="tip-badge" data-tip="Weighted score: Reddit 35%, StockTwits 40%, News 25%.">How is this scored?</span>
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
              </a>`).join('')}
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

// ── Stock Search Controls ─────────────────────────────────────────────────────

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
    const cls = (d.label || 'neutral').replace(' ', '-');
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
          ${d.topKeywords?.length ? `<div><div class="kw-label">Top Keywords</div><div class="kw-cloud">${d.topKeywords.map(k=>`<span class="kw-tag">${esc(k.word)}</span>`).join('')}</div></div>` : ''}
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
                <div style="display:flex;gap:6px;align-items:center;margin-bottom:5px">
                  <span class="badge ${p.sentimentLabel}">${p.sentimentLabel}</span>
                  <span style="font-size:11px;color:var(--muted)">r/${esc(p.subreddit)}</span>
                </div>
                <div class="post-title">${esc(p.title)}</div>
                <div class="post-meta"><span>↑ ${fmtNum(p.score)}</span><span>${p.comments} comments</span><span>${timeAgo(p.created)}</span></div>
              </a>`).join('')}
          </div>
        </div>
      </div>`;
  } catch (e) {
    el.innerHTML = `<div style="padding:24px 32px">${errState(e.message)}</div>`;
  }
}

// ── Underdogs ─────────────────────────────────────────────────────────────────

const UNDERDOG_POOL = [
  'F','GM','INTC','IBM','VZ','T','KHC','WBA','CVS','MO',
  'PARA','DIS','C','USB','WFC','OXY','DVN','MMM','GE','HPQ',
  'CSCO','SLB','PSX','SO','D',
];

async function loadUnderdogs() {
  const el = document.getElementById('underdogGrid');
  el.innerHTML = `<div style="padding:20px 0">${spinner()}</div>`;
  try {
    const data = await API.getBatch(UNDERDOG_POOL.join(','));

    const scored = data
      .filter(d => d.quote && d.metrics && d.quote.c > 0)
      .map(d => {
        const { score, reasons } = scoreUnderdog(d.ticker, d.quote, d.metrics);
        return { ...d, udScore: score, reasons };
      })
      .filter(d => d.udScore >= 3)
      .sort((a, b) => b.udScore - a.udScore)
      .slice(0, 8);

    if (!scored.length) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="es-icon">🌱</div>
          <div class="es-title">No standout underdogs today</div>
          <div class="es-body">Current market conditions don't surface strong candidates matching all criteria. Check back after market close or try refreshing.</div>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="ud-count-row">${scored.length} underdogs found from a pool of ${UNDERDOG_POOL.length} stocks</div>
      <div class="ud-grid">${scored.map(d => underdogCard(d)).join('')}</div>`;
  } catch (e) {
    el.innerHTML = errState(e.message);
  }
}

function scoreUnderdog(ticker, quote, metrics) {
  let score = 0;
  const reasons = [];
  const price = quote.c;
  const m = metrics.metric || {};
  const high52 = m['52WeekHigh'];
  const low52  = m['52WeekLow'];
  const range  = (high52 && low52 && high52 > low52) ? high52 - low52 : 0;
  const inRange = range > 0 ? (price - low52) / range : 0.5;

  if (inRange < 0.3) {
    score += 3;
    reasons.push(`In the bottom ${Math.round(inRange * 100)}% of its 52-week range — potential value territory`);
  } else if (inRange < 0.5) {
    score += 1;
    reasons.push(`Trading in the lower half of its 52-week range ($${low52?.toFixed(0)}–$${high52?.toFixed(0)})`);
  }

  if (m.peNormalizedAnnual > 0 && m.peNormalizedAnnual < 12) {
    score += 3;
    reasons.push(`P/E of ${m.peNormalizedAnnual.toFixed(1)}× — deeply undervalued vs. S&P 500 average (~22×)`);
  } else if (m.peNormalizedAnnual > 0 && m.peNormalizedAnnual < 20) {
    score += 1;
    reasons.push(`Below-average P/E of ${m.peNormalizedAnnual.toFixed(1)}× — reasonably priced on earnings`);
  }

  if (m.epsNormalizedAnnual > 0) {
    score += 1;
    reasons.push(`Positive EPS of $${m.epsNormalizedAnnual.toFixed(2)} — the company is profitable`);
  }

  if (m.dividendYieldIndicatedAnnual > 4) {
    score += 2;
    reasons.push(`High dividend yield of ${m.dividendYieldIndicatedAnnual.toFixed(1)}% — paid to wait for recovery`);
  } else if (m.dividendYieldIndicatedAnnual > 2) {
    score += 1;
    reasons.push(`Pays a ${m.dividendYieldIndicatedAnnual.toFixed(1)}% dividend yield`);
  }

  if (m.beta > 0.3 && m.beta < 1.4) {
    score += 1;
    reasons.push(`Moderate Beta (${m.beta.toFixed(2)}) — manageable volatility for a long hold`);
  }

  return { score, reasons };
}

function underdogCard(d) {
  const q = d.quote;
  const m = d.metrics?.metric || {};
  const chg = q.dp ?? 0;
  const price = q.c || 0;
  const tier = d.udScore >= 7 ? { label: 'Strong Pick', color: '#22c55e' }
             : d.udScore >= 5 ? { label: 'Underdog',    color: '#14b8a6' }
             :                  { label: 'Watch',        color: '#f59e0b' };

  return `
    <div class="ud-card" onclick="showView('search'); loadStockView('${esc(d.ticker)}')">
      <div class="ud-card-head">
        <div>
          <div class="ud-ticker">${esc(d.ticker)}</div>
          <div class="ud-name">${esc(tickerName(d.ticker))}</div>
        </div>
        <span class="ud-tier" style="color:${tier.color};background:${tier.color}1a">${tier.label}</span>
      </div>
      <div class="ud-price-row">
        <span class="ud-price">$${price.toFixed(2)}</span>
        <span class="ud-chg ${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)}%</span>
      </div>
      <div class="ud-reasons">
        ${d.reasons.slice(0, 2).map(r => `<div class="ud-reason">✓ ${esc(r)}</div>`).join('')}
      </div>
      <div class="ud-chips">
        ${m.peNormalizedAnnual > 0     ? `<span class="ud-chip">P/E ${m.peNormalizedAnnual.toFixed(1)}</span>` : ''}
        ${m.dividendYieldIndicatedAnnual > 0 ? `<span class="ud-chip">Div ${m.dividendYieldIndicatedAnnual.toFixed(1)}%</span>` : ''}
        ${m.beta                        ? `<span class="ud-chip">β ${m.beta.toFixed(2)}</span>` : ''}
        ${m.epsNormalizedAnnual > 0    ? `<span class="ud-chip">EPS $${m.epsNormalizedAnnual.toFixed(2)}</span>` : ''}
      </div>
      <div class="ud-cta">Click to analyze in depth →</div>
    </div>`;
}

// ── Learn (Redesigned) ────────────────────────────────────────────────────────

const LEARN_CATS = [
  {
    id: 'basics', icon: '📊', label: 'Basics',
    items: [
      { icon: '📊', title: 'What is a Stock?', body: 'A stock is a tiny ownership share in a company. When you buy Apple stock, you own a piece of Apple Inc. and benefit if the company grows in value. If Apple doubles in value, your shares do too.', example: 'Apple (AAPL) has ~15 billion shares. Own 1 = you own 1/15,000,000,000 of Apple — tiny, but real.' },
      { icon: '💹', title: 'What is the Stock Market?', body: 'The stock market is where buyers and sellers trade shares in public companies. In the US, the main exchanges are the NYSE and NASDAQ. Prices change every second based on supply and demand — more buyers = price rises.', example: 'The S&P 500 tracks 500 of the largest US companies. When people say "the market went up," they usually mean the S&P 500.' },
      { icon: '🏢', title: 'Market Cap', body: 'Market Cap = share price × total shares outstanding. It measures the total value of a company as seen by the market. Large-cap stocks (>$10B) are more stable but grow slower. Small-caps can grow faster but are riskier.', example: 'Apple at $200/share × 15 billion shares = $3 trillion market cap — the most valuable company in the world.' },
      { icon: '🐂', title: 'Bull vs Bear Market', body: 'A bull market means prices are rising broadly — "the bull charges upward." A bear market is a decline of 20%+ from a recent high — "the bear swipes downward." Knowing which phase you\'re in changes your strategy completely.', example: 'COVID crash (Feb–Mar 2020) = bear. The 2021 recovery = one of the fastest bull markets in history.' },
    ],
  },
  {
    id: 'metrics', icon: '🔢', label: 'Key Metrics',
    items: [
      { icon: '📈', title: 'P/E Ratio', body: 'Price-to-Earnings ratio = share price ÷ earnings per share. It tells you how much investors pay for every $1 of profit. A high P/E suggests investors expect big future growth. A low P/E might mean undervalued — or declining. Always compare within the same sector.', example: 'P/E of 25 → investors pay $25 for every $1 of earnings. S&P 500 historical average is ~17-22×.' },
      { icon: '📋', title: 'EPS (Earnings Per Share)', body: 'EPS = company\'s net profit ÷ total shares outstanding. It measures how much money the company earns per share. Higher EPS = more profitable per share. Watch for EPS growth over time — that\'s what drives long-term stock prices.', example: 'Apple earns ~$100B/year with ~15B shares → EPS ≈ $6.67 per share.' },
      { icon: '⚡', title: 'Beta', body: 'Beta measures how volatile a stock is compared to the S&P 500. Beta 1.0 = moves exactly with the market. Beta 2.0 = moves twice as much. Beta 0.5 = half as volatile. High beta = more potential return AND more risk.', example: 'Tesla\'s Beta is ~2. That means on a 1% market day, TSLA might move 2%. Great for traders, risky for holders.' },
      { icon: '🎯', title: '52-Week High / Low', body: 'The highest and lowest prices a stock has traded at over the past year. Trading near a 52W high shows momentum. Near the 52W low might signal weakness — or a value opportunity if fundamentals are sound.', example: 'Stock at $45 with a 52W range of $30–$50: it\'s in the upper half, 10% from its yearly peak.' },
      { icon: '📊', title: 'ROE (Return on Equity)', body: 'ROE = net income ÷ shareholders\' equity. It shows how efficiently a company generates profit from investor money. Higher ROE = more efficient use of capital. Generally, 15%+ is considered good.', example: 'ROE of 30% means for every $100 investors put in, the company generates $30 of profit.' },
    ],
  },
  {
    id: 'income', icon: '💰', label: 'Income',
    items: [
      { icon: '💰', title: 'Dividends', body: 'Some companies pay dividends — regular cash payments to shareholders, usually quarterly. Great for passive income without selling shares. Dividend stocks tend to be more mature, stable companies. "Dividend yield" = annual dividend ÷ stock price.', example: 'Johnson & Johnson pays ~3% dividend yield. $10,000 invested → ~$300/year just for holding the shares.' },
      { icon: '🔁', title: 'DRIP (Dividend Reinvestment)', body: 'Dividend Reinvestment Plans let you automatically use dividend payments to buy more shares instead of taking cash. This compounds your returns over time — you earn dividends on your dividends. Many brokers offer this for free.', example: 'Starting with $10,000 in a 3% dividend stock and reinvesting every year → after 20 years the position grows significantly from compounding alone.' },
    ],
  },
  {
    id: 'strategy', icon: '🧠', label: 'Strategy',
    items: [
      { icon: '🔄', title: 'Dollar-Cost Averaging (DCA)', body: 'DCA means investing a fixed dollar amount at regular intervals regardless of price. This automatically buys more shares when cheap and fewer when expensive — removing emotion from the equation. It\'s one of the most recommended strategies for beginners.', example: 'Invest $200/month in an index fund, every month, for 10 years regardless of market conditions. Simple and effective.' },
      { icon: '🗂️', title: 'Diversification', body: 'Don\'t put all your eggs in one basket. Spread investments across different companies, sectors, and asset types to reduce the risk that one bad day wipes out your portfolio. A diversified portfolio of 20+ stocks in different sectors is much safer than all-in on one stock.', example: 'Instead of 100% tech stocks: 30% tech, 20% healthcare, 20% finance, 15% consumer, 15% bonds.' },
      { icon: '📦', title: 'Understanding Market Sectors', body: 'Stocks are grouped into 11 GICS sectors (Technology, Healthcare, Finance, etc.). Each sector reacts differently to economic conditions. Tech booms during growth periods; utilities and healthcare hold steadier during downturns. Knowing sectors helps you diversify intelligently.', example: 'During a recession: utilities and consumer staples tend to hold. During a tech boom: semiconductors often lead. Rotation between sectors is a core strategy.' },
      { icon: '⏳', title: 'Time in Market vs Timing the Market', body: '"Time in the market beats timing the market." Trying to buy at the perfect low and sell at the perfect high is nearly impossible even for professionals. Historically, missing just the 10 best days in a decade of investing dramatically cuts your returns.', example: 'S&P 500 returns 1980–2020: staying fully invested returned ~12%/year. Missing the 10 best days cut that to ~8%/year.' },
    ],
  },
  {
    id: 'sentiment', icon: '📡', label: 'Sentiment',
    items: [
      { icon: '📰', title: 'What is Sentiment Analysis?', body: 'Market sentiment is the overall mood of investors — bullish (optimistic) or bearish (pessimistic). BeanStock uses NLP (Natural Language Processing) to score Reddit posts, StockTwits messages, and news headlines, giving each stock a weighted sentiment score from -10 to +10.', example: 'GME in January 2021 had extreme bullish sentiment on WSB — the stock went from $20 to $480. Sentiment drove real-world prices.' },
      { icon: '🌱', title: 'Understanding Underdogs', body: 'Underdog stocks have strong fundamentals — profitable, low P/E, paying dividends — but fly under the radar of social media and retail attention. While meme stocks get Reddit posts, underdogs quietly generate earnings near their yearly lows. BeanStock\'s Underdog finder scans 25+ stocks for these signals.', example: 'A stock with P/E of 9, positive EPS, 5% dividend yield, trading at its 52-week low — low hype, high fundamental value. That\'s an underdog.' },
      { icon: '⚠️', title: 'Limits of Sentiment', body: 'Sentiment analysis reflects what people are saying — not necessarily what\'s true. High positive sentiment can be manipulated, exaggerated, or simply wrong. Always combine sentiment with fundamentals (P/E, EPS, Beta) before making any decision. BeanStock is a research tool, not financial advice.', example: 'High Reddit buzz on a stock with negative EPS and no revenue is a red flag — the excitement may not be backed by business reality.' },
    ],
  },
];

let activeCat = 0;
let openLearnItem = null;

function loadLearn() {
  const sidebar  = document.getElementById('learnSidebar');
  const content  = document.getElementById('learnContent');

  sidebar.innerHTML = LEARN_CATS.map((cat, i) => `
    <button class="learn-cat-btn ${i === activeCat ? 'active' : ''}" onclick="showLearnCat(${i})">
      <span class="lc-icon">${cat.icon}</span>
      <span>${cat.label}</span>
      <span class="lc-count">${cat.items.length}</span>
    </button>`).join('');

  renderLearnCat(activeCat);
}

function showLearnCat(idx) {
  activeCat = idx;
  openLearnItem = null;
  document.querySelectorAll('.learn-cat-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
  renderLearnCat(idx);
}

function renderLearnCat(idx) {
  const cat = LEARN_CATS[idx];
  document.getElementById('learnContent').innerHTML = cat.items.map((item, i) => `
    <div class="learn-item" id="li-${idx}-${i}">
      <button class="learn-item-head" onclick="toggleLearnItem(${idx},${i})">
        <span class="li-icon">${item.icon}</span>
        <span class="li-title">${item.title}</span>
        <span class="li-chevron">▼</span>
      </button>
      <div class="learn-item-body" id="lib-${idx}-${i}">
        <p class="li-body">${item.body}</p>
        <div class="li-example">
          <span class="li-ex-label">Example</span>
          <p>${item.example}</p>
        </div>
      </div>
    </div>`).join('');
}

function toggleLearnItem(catIdx, itemIdx) {
  const bodyId = `lib-${catIdx}-${itemIdx}`;
  const itemId = `li-${catIdx}-${itemIdx}`;
  const body = document.getElementById(bodyId);
  const item = document.getElementById(itemId);
  const isOpen = item.classList.contains('open');

  // Close previous
  if (openLearnItem && openLearnItem !== bodyId) {
    const prev = document.getElementById(openLearnItem);
    const prevItem = document.getElementById(openLearnItem.replace('lib-', 'li-'));
    if (prev) prev.style.maxHeight = '0';
    if (prevItem) prevItem.classList.remove('open');
  }

  item.classList.toggle('open', !isOpen);
  body.style.maxHeight = isOpen ? '0' : body.scrollHeight + 'px';
  openLearnItem = isOpen ? null : bodyId;
}

// ── Sentiment Helpers ─────────────────────────────────────────────────────────

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
    ${ex.summary ? explanationCard(ex) : ''}
    ${d.posts?.length ? `
      <div style="font-size:11.5px;color:var(--muted);margin:16px 0 8px">Top posts · r/stocks · r/wallstreetbets · r/investing</div>
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
  if (sources.reddit)     panels.push(sourcePanel('Reddit',     sources.reddit.score,     sources.reddit.label,     `${sources.reddit.postCount || 0} posts`,                                             '#FF4500'));
  if (sources.stocktwits) panels.push(sourcePanel('StockTwits', sources.stocktwits.score, sources.stocktwits.label, sources.stocktwits.total ? `${sources.stocktwits.bullish} Bull · ${sources.stocktwits.bearish} Bear` : 'No data', '#40A0D0'));
  if (sources.news)       panels.push(sourcePanel('News',       sources.news.score,       sources.news.label,       `${sources.news.articles?.length || 0} articles`,                                    '#F5A623'));
  if (!panels.length) return '';
  return `<div class="source-grid">${panels.join('')}</div>`;
}

function sourcePanel(name, score, label, detail, accent) {
  const cls = (label || 'neutral').replace(' ', '-');
  const scoreStr = score != null ? `${score >= 0 ? '+' : ''}${Number(score).toFixed(1)}` : 'N/A';
  return `
    <div class="source-panel">
      <div class="source-name" style="color:${accent}">${name}</div>
      <div class="source-score ${cls}">${scoreStr}</div>
      <div class="source-detail">${esc(detail)}</div>
    </div>`;
}

function explanationCard(ex) {
  const bgMap  = { red:'rgba(239,68,68,.12)',   orange:'rgba(249,115,22,.12)', yellow:'rgba(234,179,8,.12)',  green:'rgba(34,197,94,.12)' };
  const txtMap = { red:'#ef4444', orange:'#f97316', yellow:'#ca8a04', green:'#16a34a' };
  const bg  = bgMap[ex.riskColor]  || bgMap.yellow;
  const txt = txtMap[ex.riskColor] || txtMap.yellow;
  return `
    <div class="expl-card">
      <div class="expl-header">
        <span class="expl-title">Analysis</span>
        <span class="risk-badge" style="background:${bg};color:${txt}">${esc(ex.riskLevel)}</span>
      </div>
      <div class="expl-section"><div class="expl-sec-title">Market Sentiment</div><p class="expl-text">${esc(ex.summary)}</p></div>
      <div class="expl-section"><div class="expl-sec-title">Volatility</div><p class="expl-text">${esc(ex.volatility)}</p></div>
      <div class="expl-section"><div class="expl-sec-title">Price Context</div><p class="expl-text">${esc(ex.priceContext)}</p></div>
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
    { label: 'Strong Buy',  n: recs.strongBuy  || 0, cls: 'strong-buy'  },
    { label: 'Buy',         n: recs.buy         || 0, cls: 'buy'         },
    { label: 'Hold',        n: recs.hold        || 0, cls: 'hold'        },
    { label: 'Sell',        n: recs.sell        || 0, cls: 'sell'        },
    { label: 'Strong Sell', n: recs.strongSell  || 0, cls: 'strong-sell' },
  ];
  const sc = ((recs.strongBuy||0)*2 + (recs.buy||0) - (recs.sell||0) - (recs.strongSell||0)*2) / total;
  const consensus = sc > 1.2 ? { label:'Strong Buy',  color:'#22c55e' }
                  : sc > 0.3 ? { label:'Buy',          color:'#86efac' }
                  : sc > -0.3? { label:'Hold',         color:'#fbbf24' }
                  : sc > -1.2? { label:'Sell',         color:'#f97316' }
                  :             { label:'Strong Sell',  color:'#ef4444' };

  return `
    <div class="metrics-section">
      <div class="section-head">
        <span class="section-title">Analyst Ratings</span>
        <span class="tip-badge" data-tip="Aggregated analyst recommendations. Period: ${esc(recs.period || 'latest')}.">What is this?</span>
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
              <div class="ar-track"><div class="ar-fill ${r.cls}" style="width:${pct(r.n,total)}%"></div></div>
              <span class="ar-count">${r.n}</span>
            </div>`).join('')}
        </div>
        ${peers?.length ? `
          <div class="peers-row">
            <span class="peers-label">Peers: </span>
            ${peers.map(p=>`<span class="peer-chip" onclick="loadStockView('${esc(p)}')">${esc(p)}</span>`).join('')}
          </div>` : ''}
      </div>
    </div>`;
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
  if (n >= 1e9)  return '$' + (n/1e9).toFixed(2)  + 'B';
  if (n >= 1e6)  return '$' + (n/1e6).toFixed(1)  + 'M';
  return '$' + n.toLocaleString();
}
function fmtNum(n) {
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1000) return (n/1000).toFixed(1) + 'k';
  return String(n || 0);
}
function pct(a, total) { return total ? Math.round((a / total) * 100) : 0; }
function timeAgo(ts) {
  const s = Date.now() / 1000 - ts;
  if (s < 3600)  return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function sentColor(label) {
  if (label?.includes('positive')) return 'var(--green)';
  if (label?.includes('negative')) return 'var(--red)';
  return 'var(--yellow)';
}
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const NAMES = {
  AAPL:'Apple',MSFT:'Microsoft',NVDA:'NVIDIA',GOOGL:'Alphabet',META:'Meta',
  AMZN:'Amazon',TSLA:'Tesla',JNJ:'J&J',PFE:'Pfizer',UNH:'UnitedHealth',
  ABBV:'AbbVie',MRK:'Merck',JPM:'JPMorgan',BAC:'BofA',GS:'Goldman',
  MS:'Morgan Stanley',WFC:'Wells Fargo',XOM:'ExxonMobil',CVX:'Chevron',
  COP:'ConocoPhillips',EOG:'EOG Resources',SLB:'SLB',WMT:'Walmart',
  HD:'Home Depot',NKE:'Nike',CAT:'Caterpillar',DE:'John Deere',BA:'Boeing',
  UPS:'UPS',HON:'Honeywell',NEE:'NextEra',DUK:'Duke Energy',SO:'Southern Co',
  AEP:'Am Electric Power',EXC:'Exelon',AMT:'Am Tower',PLD:'Prologis',
  EQIX:'Equinix',CCI:'Crown Castle',SPG:'Simon Property',
  SPY:'S&P 500 ETF',QQQ:'NASDAQ 100 ETF',DIA:'Dow Jones ETF',IWM:'Russell 2000 ETF',
  F:'Ford Motor',GM:'General Motors',INTC:'Intel',IBM:'IBM Corp',VZ:'Verizon',
  T:'AT&T',KHC:'Kraft Heinz',WBA:'Walgreens Boots',CVS:'CVS Health',MO:'Altria',
  PARA:'Paramount',DIS:'Disney',C:'Citigroup',USB:'US Bancorp',
  OXY:'Occidental',DVN:'Devon Energy',MMM:'3M Company',GE:'GE Aerospace',
  HPQ:'HP Inc',CSCO:'Cisco',PSX:'Phillips 66',SO:'Southern Company',D:'Dominion',
  GME:'GameStop',AMC:'AMC Entertainment',
};
function tickerName(t) { return NAMES[t] || t; }

// ── Init ──────────────────────────────────────────────────────────────────────

checkSetup();
checkFirstVisit();
loadDashboard();
loadLearn();

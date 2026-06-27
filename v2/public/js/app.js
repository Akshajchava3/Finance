// ── Favorites / Pinned Tickers ────────────────────────────────────────────────

function getFavorites() {
  try { return JSON.parse(localStorage.getItem('bs_favorites') || '[]'); } catch { return []; }
}
function setFavorites(arr) { localStorage.setItem('bs_favorites', JSON.stringify(arr)); }
function isFavorite(ticker) { return getFavorites().includes(ticker); }

function toggleFavorite(ticker) {
  const favs = getFavorites();
  const idx  = favs.indexOf(ticker);
  if (idx >= 0) favs.splice(idx, 1); else favs.push(ticker);
  setFavorites(favs);

  // Sync the star button in the stock view if it's showing
  const btn = document.getElementById('favBtn-' + ticker);
  if (btn) {
    const pinned = isFavorite(ticker);
    btn.classList.toggle('fav-active', pinned);
    btn.title = pinned ? 'Remove from dashboard' : 'Pin to dashboard';
    btn.innerHTML = `${pinned ? '★' : '☆'}<span class="fav-label">${pinned ? 'Pinned' : 'Pin'}</span>`;
  }

  // Refresh dashboard pins if currently visible
  if (document.getElementById('view-dashboard')?.classList.contains('active')) loadPinned();
}

async function loadPinned() {
  const favs = getFavorites();
  const section = document.getElementById('pinsSection');
  if (!favs.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  const el = document.getElementById('pinsList');
  el.innerHTML = spinner();
  const results = await Promise.allSettled(favs.map(t => API.getQuote(t)));
  el.innerHTML = favs.map((t, i) => {
    if (results[i].status !== 'fulfilled') return `
      <div class="pin-card err" onclick="loadStockView('${t}')">
        <div class="pin-ticker">${t}</div>
        <div class="pin-name" style="color:var(--red)">Load failed</div>
        <button class="pin-remove" onclick="event.stopPropagation();toggleFavorite('${t}')">✕</button>
      </div>`;
    const q = results[i].value.quote;
    const chg = q.dp ?? 0;
    return `
      <div class="pin-card" onclick="loadStockView('${t}')">
        <div class="pin-card-top">
          <span class="pin-ticker">${t}</span>
          <button class="pin-remove" onclick="event.stopPropagation();toggleFavorite('${t}')" title="Unpin">✕</button>
        </div>
        <div class="pin-price">$${(q.c || 0).toFixed(2)}</div>
        <div class="pin-chg ${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)}%</div>
        <div class="pin-name">${tickerName(t)}</div>
      </div>`;
  }).join('');
}

// ── Bean Cursor ───────────────────────────────────────────────────────────────

let beanCursorOn = false;
let _beanCursorStyleEl = null;

function _buildBeanCursorStyle() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 40;
  const ctx = canvas.getContext('2d');
  ctx.font = '32px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🫘', 20, 20);
  const url = canvas.toDataURL();
  const el = document.createElement('style');
  el.id = 'beanCursorStyle';
  el.textContent = `body.bean-cursor,body.bean-cursor *{cursor:url(${url}) 20 20,auto!important}`;
  return el;
}

function toggleBeanCursor() {
  beanCursorOn = !beanCursorOn;
  if (beanCursorOn) {
    if (!_beanCursorStyleEl) _beanCursorStyleEl = _buildBeanCursorStyle();
    if (!document.getElementById('beanCursorStyle')) document.head.appendChild(_beanCursorStyleEl);
  } else {
    document.getElementById('beanCursorStyle')?.remove();
  }
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
  { sel: '.sidebar',                title: '🧭 Navigation',      body: 'This sidebar is your main menu. Click any button to switch pages — Dashboard, Search, Underdogs, Sectors, IPO Calendar, Reddit, and Trading 101.',          view: null,        pos: 'right'  },
  { sel: '.hero-section',           title: '🔍 Quick Search',     body: 'Type any ticker — AAPL, NVDA, TSLA — to instantly pull up a live price chart, key metrics, analyst ratings, and multi-source sentiment.',                  view: 'dashboard', pos: 'bottom' },
  { sel: '#dashSentCard',           title: '📊 Market Sentiment', body: 'Aggregated sentiment from Reddit, StockTwits, and financial news. Includes a plain-English verdict: Bullish, Bearish, or Neutral — with action guidance.', view: 'dashboard', pos: 'right'  },
  { sel: '[data-view="search"]',    title: '🔎 Stock Search',     body: 'Deep-dive any US stock: live chart, P/E, EPS, Beta, 52W range, analyst consensus, and three-source sentiment. Hit ★ to pin it to your dashboard.',       view: null,        pos: 'right'  },
  { sel: '[data-view="underdogs"]', title: '🌱 Underdogs',        body: 'BeanStock\'s signature feature. Stocks with low media/analyst attention but strong algorithmic quality — profitable, undervalued, technically showing upside the crowd hasn\'t priced in yet.',    view: null,        pos: 'right'  },
  { sel: '[data-view="sectors"]',   title: '🗂️ Sectors',          body: 'All 8 market sectors with live prices for every stock. A performance bar at the top ranks sectors best to worst. Click any row to open that stock\'s full analysis.',  view: null,        pos: 'right'  },
  { sel: '[data-view="ipos"]',      title: '🚀 IPO Calendar',     body: 'Track companies going public — upcoming, priced, filed, and withdrawn. Includes a plain-English explainer of what IPOs are and how to evaluate them.',     view: null,        pos: 'right'  },
  { sel: '[data-view="reddit"]',    title: '📡 Reddit Feed',      body: 'Enter any ticker to score how Reddit feels about it right now. We scan r/stocks, r/wallstreetbets, r/investing, and r/StockMarket with NLP.',             view: null,        pos: 'right'  },
  { sel: '[data-view="learn"]',     title: '📚 Trading 101',      body: 'New to stocks? This section explains every concept — P/E ratios, Beta, dividends, DCA — in plain English with real examples you can relate to.',          view: null,        pos: 'right'  },
  { sel: '[data-view="connect"]',   title: '🔌 Connect',           body: 'Link BeanStock to any trading platform. Add the one-click bookmarklet to your browser and get instant Buy/Hold/Sell analysis on any stock you\'re viewing — without leaving the site.',    view: null,        pos: 'right'  },
  { sel: '#beanCursorBtn',          title: '🫘 Bean Mode',         body: 'Finally — click this button to turn your cursor into a realistic bean. The most important feature in BeanStock. Clearly.',                                view: null,        pos: 'bottom' },
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
  const bubble = document.getElementById('tutBubble');

  // Fade content out → swap text → fade back in
  bubble.classList.add('tut-fading');
  setTimeout(() => {
    document.getElementById('tutTitle').textContent   = step.title;
    document.getElementById('tutBody').textContent    = step.body;
    document.getElementById('tutCounter').textContent = `${idx + 1} / ${TUT_STEPS.length}`;
    document.getElementById('tutNextBtn').textContent = idx === TUT_STEPS.length - 1 ? '🎉 Done!' : 'Next →';
    document.querySelectorAll('.tut-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
    bubble.classList.remove('tut-fading');
  }, 140);

  // Highlight target element
  const target = document.querySelector(step.sel);
  if (target) {
    tutHighlightEl = target;
    target.classList.add('tut-highlight');
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (!target) return;
  setTimeout(() => {
    const rect = target.getBoundingClientRect();
    const bw = 300, bh = 230;
    let top, left;
    if (step.pos === 'right')       { top = rect.top + rect.height / 2 - bh / 2; left = rect.right + 20; }
    else if (step.pos === 'left')   { top = rect.top + rect.height / 2 - bh / 2; left = rect.left - bw - 20; }
    else if (step.pos === 'bottom') { top = rect.bottom + 16; left = rect.left + rect.width / 2 - bw / 2; }
    else                            { top = rect.top - bh - 16; left = rect.left + rect.width / 2 - bw / 2; }

    left = Math.max(16, Math.min(left, window.innerWidth  - bw - 16));
    top  = Math.max(80, Math.min(top,  window.innerHeight - bh - 16));

    // Set properties individually — preserves the CSS transition on top/left
    bubble.style.top       = top  + 'px';
    bubble.style.left      = left + 'px';
    bubble.style.transform = 'none';
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

// Per-view reload cooldowns (ms). Infinity = load once per session.
const _viewCooldowns = {
  dashboard:   15000,   // live market data — refresh every 15s minimum
  sectors:     30000,   // lots of price calls — 30s cooldown
  underdogs:   300000,  // very expensive — 5-minute cooldown
  ipos:        120000,  // calendar doesn't change often
  pennystocks: 120000,
  reddit:      60000,
  learn:       Infinity,
  connect:     Infinity,
};
const _viewLastLoad = {};

function shouldReloadView(v) {
  const cd = _viewCooldowns[v] ?? 30000;
  if (cd === Infinity) return !_viewLastLoad[v];
  return !_viewLastLoad[v] || (Date.now() - _viewLastLoad[v] > cd);
}
function markViewLoaded(v) { _viewLastLoad[v] = Date.now(); }

NAV_BTNS.forEach(btn => {
  btn.addEventListener('click', () => {
    const v = btn.dataset.view;
    showView(v);
    if (!shouldReloadView(v)) return;
    markViewLoaded(v);
    if (v === 'dashboard')   loadDashboard();
    if (v === 'sectors')     loadSectors();
    if (v === 'underdogs')   loadUnderdogs();
    if (v === 'ipos')        loadIPOs();
    if (v === 'learn')       loadLearn();
    if (v === 'pennystocks') loadPennyStocks();
    if (v === 'connect')     loadConnect();
  });
});

document.addEventListener('keydown', e => {
  if (e.key === '/' && !['INPUT','TEXTAREA'].includes(e.target.tagName)) {
    e.preventDefault();
    document.getElementById('globalSearch').focus();
  }
});

// ── Wall Street Clock ─────────────────────────────────────────────────────────

function fmtCountdown(ms) {
  if (ms <= 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function updateWsClock() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const h = et.getHours(), m = et.getMinutes(), s = et.getSeconds(), day = et.getDay();
  const totalMins = h * 60 + m;

  // Time display
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  document.getElementById('wsTime').textContent =
    `${h12}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} ${ampm} ET`;

  let session, dotClass, countdown;
  const isWeekday = day >= 1 && day <= 5;

  if (!isWeekday) {
    session  = 'Weekend — Closed';
    dotClass = 'dot-closed';
    const next = new Date(et); next.setDate(next.getDate() + (day === 6 ? 2 : 1)); next.setHours(9,30,0,0);
    countdown = 'Opens ' + fmtCountdown(next - et);
  } else if (totalMins < 4 * 60) {
    session  = 'Overnight — Closed';
    dotClass = 'dot-closed';
    const next = new Date(et); next.setHours(4,0,0,0);
    countdown = 'Pre-market in ' + fmtCountdown(next - et);
  } else if (totalMins < 9 * 60 + 30) {
    session  = 'Pre-Market';
    dotClass = 'dot-pre';
    const next = new Date(et); next.setHours(9,30,0,0);
    countdown = 'Opens in ' + fmtCountdown(next - et);
  } else if (totalMins < 16 * 60) {
    session  = 'Market Open';
    dotClass = 'dot-open';
    const next = new Date(et); next.setHours(16,0,0,0);
    countdown = 'Closes in ' + fmtCountdown(next - et);
  } else if (totalMins < 20 * 60) {
    session  = 'After-Hours';
    dotClass = 'dot-after';
    const next = new Date(et); next.setHours(20,0,0,0);
    countdown = 'AH closes in ' + fmtCountdown(next - et);
  } else {
    session  = 'Overnight — Closed';
    dotClass = 'dot-closed';
    const next = new Date(et);
    next.setDate(next.getDate() + (day === 5 ? 3 : 1)); next.setHours(4,0,0,0);
    countdown = 'Pre-market in ' + fmtCountdown(next - et);
  }

  document.getElementById('wsLabel').textContent  = session;
  document.getElementById('wsDot').className      = 'ws-dot ' + dotClass;
  document.getElementById('wsCountdown').textContent = countdown;

  // Sidebar markets-status strip
  const mLabel = document.getElementById('marketsLabel');
  const mDot   = document.getElementById('marketsDot');
  if (mLabel) mLabel.textContent = session.toUpperCase();
  if (mDot) {
    mDot.style.background   = dotClass === 'dot-open' ? '#C8F000' : dotClass === 'dot-pre' || dotClass === 'dot-after' ? '#E8A000' : '#5A4A1A';
    mDot.style.boxShadow    = dotClass === 'dot-open' ? '0 0 6px #C8F000' : 'none';
  }
}

updateWsClock();
setInterval(updateWsClock, 1000);

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
  loadPinned();
  loadWatchlist();
  loadTrending();
  loadDashSentiment();
}

async function loadIndexStats() {
  const row = document.getElementById('statsRow');
  try {
    const results = await Promise.allSettled(INDICES.map(i => API.getQuote(i.ticker)));
    row.innerHTML = INDICES.map((idx, i) => {
      if (results[i].status !== 'fulfilled') return `
        <div class="stat-card">
          <div class="stat-label">${idx.label}</div>
          <div class="stat-value" style="color:var(--muted)">—</div>
        </div>`;
      const q = results[i].value.quote;
      const chg = q.dp ?? 0;
      return `
        <div class="stat-card" onclick="loadStockView('${idx.ticker}')" style="cursor:pointer">
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
    const results = await Promise.allSettled(WATCHLIST.map(t => API.getQuote(t)));
    const anyLoaded = results.some(r => r.status === 'fulfilled');
    if (!anyLoaded) {
      const err = results[0].reason?.message || 'Could not load prices';
      el.innerHTML = errState(err.includes('key') ? 'Add FINNHUB_API_KEY to .env' : err, 'showOnboarding()');
      return;
    }
    el.innerHTML = WATCHLIST.map((t, i) => {
      if (results[i].status !== 'fulfilled') return `
        <div class="wl-row">
          <span class="wl-sym">${t}</span>
          <span class="wl-name">${tickerName(t)}</span>
          <span class="wl-price" style="color:var(--muted)">—</span>
          <span class="wl-chg" style="color:var(--muted)">—</span>
          <span class="wl-sent" id="wls-${t}"></span>
        </div>`;
      const q = results[i].value.quote;
      const chg = q.dp ?? 0;
      return `
        <div class="wl-row" onclick="loadStockView('${t}')">
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
  if (v) { loadStockView(v); }
});
document.getElementById('heroSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('heroSearchBtn').click();
});
document.querySelectorAll('.hint-chip[data-ticker]').forEach(chip => {
  chip.addEventListener('click', () => { loadStockView(chip.dataset.ticker); });
});
document.querySelectorAll('.hint-chip[data-reddit]').forEach(chip => {
  chip.addEventListener('click', () => {
    document.getElementById('redditInput').value = chip.dataset.reddit;
    loadRedditView(chip.dataset.reddit);
  });
});

// ── Stock View ────────────────────────────────────────────────────────────────

let _activeTicker = null;

// ── Stock Drawer ──────────────────────────────────────────────────────────────

function openStockDrawer(title) {
  const drawer   = document.getElementById('stockDrawer');
  const backdrop = document.getElementById('stockDrawerBackdrop');
  document.getElementById('stockDrawerTitle').textContent = title || 'Loading…';
  const btn = document.getElementById('drawerFsBtn');

  // Quick mode (companion window): open fullscreen immediately, no backdrop
  if (document.body.classList.contains('quick-mode')) {
    drawer.classList.remove('hidden');
    drawer.classList.add('open', 'fullscreen');
    backdrop.classList.add('hidden');
    if (btn) { btn.textContent = '⤡'; btn.title = 'Exit fullscreen'; }
    document.body.style.overflow = 'hidden';
    return;
  }

  // Normal mode: reset fullscreen from any previous stock, then animate in
  drawer.classList.remove('fullscreen');
  backdrop.style.opacity = '';
  backdrop.style.pointerEvents = '';
  if (btn) { btn.textContent = '⤢'; btn.title = 'Fullscreen'; }
  backdrop.classList.remove('hidden');
  drawer.classList.remove('hidden');
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    drawer.classList.add('open');
  });
  document.body.style.overflow = 'hidden';
}

function toggleDrawerFullscreen() {
  const drawer   = document.getElementById('stockDrawer');
  const backdrop = document.getElementById('stockDrawerBackdrop');
  const btn      = document.getElementById('drawerFsBtn');
  const isFs     = drawer.classList.toggle('fullscreen');
  if (btn) {
    btn.textContent = isFs ? '⤡' : '⤢';
    btn.title       = isFs ? 'Exit fullscreen' : 'Fullscreen';
  }
  // Backdrop is unnecessary when the drawer already covers the full viewport
  backdrop.style.opacity = isFs ? '0' : '';
  backdrop.style.pointerEvents = isFs ? 'none' : '';
}

function closeStockDrawer() {
  const drawer   = document.getElementById('stockDrawer');
  const backdrop = document.getElementById('stockDrawerBackdrop');
  drawer.classList.remove('open', 'fullscreen');
  backdrop.classList.remove('open');
  backdrop.style.opacity = '';
  backdrop.style.pointerEvents = '';
  const btn = document.getElementById('drawerFsBtn');
  if (btn) { btn.textContent = '⤢'; btn.title = 'Fullscreen'; }
  _activeTicker = null;
  setTimeout(() => {
    drawer.classList.add('hidden');
    backdrop.classList.add('hidden');
    document.getElementById('stockDrawerBody').innerHTML = '';
  }, 280);
  document.body.style.overflow = '';
}

async function loadStockView(ticker) {
  ticker = ticker.toUpperCase().trim();
  if (!ticker) return;
  _activeTicker = ticker;
  _lastSentimentScore = 0;
  openStockDrawer(ticker);
  const el = document.getElementById('stockDrawerBody');
  el.innerHTML = `<div style="padding:40px">${spinner()}</div>`;

  try {
    const [quoteR, metricsR, newsR, analystR] = await Promise.allSettled([
      API.getQuote(ticker),
      API.getMetrics(ticker),
      API.getNews(ticker),
      API.getAnalyst(ticker),
    ]);
    if (ticker !== _activeTicker) return; // a newer search superseded this one — discard stale result

    // Quote is the only hard requirement — everything else degrades gracefully
    if (quoteR.status !== 'fulfilled') {
      throw new Error(quoteR.reason?.message || 'Could not fetch price data');
    }
    const { quote, profile } = quoteR.value;
    const metrics    = metricsR.status    === 'fulfilled' ? metricsR.value    : {};
    const news       = newsR.status       === 'fulfilled' ? newsR.value       : [];
    const analystData = analystR.status   === 'fulfilled' ? analystR.value    : null;

    // Update drawer title to the real company name
    const titleEl = document.getElementById('stockDrawerTitle');
    if (titleEl) titleEl.textContent = `${profile?.name || ticker} (${ticker})`;

    const q = quote;
    const m = metrics.metric || {};
    const chg = q.dp ?? 0;
    const price = q.c || 0;

    const prof   = profile || {};
    const pinned = isFavorite(ticker);
    el.innerHTML = `
      <div class="stock-hero">
        ${prof.logo
          ? `<img class="stock-logo" src="${esc(prof.logo)}" alt="${ticker}" onerror="this.outerHTML='<div class=stock-ph>${ticker[0]}</div>'">`
          : `<div class="stock-ph">${ticker[0]}</div>`}
        <div style="flex:1;min-width:0">
          <div class="sh-name">${esc(prof.name || ticker)}</div>
          <div class="sh-sub">${ticker}${prof.exchange ? ' · ' + prof.exchange : ''}${prof.finnhubIndustry ? ' · ' + prof.finnhubIndustry : ''}</div>
          <div class="sh-price">$${price.toFixed(2)}</div>
          <div class="sh-change ${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)}% today</div>
          <div class="sh-ohlc">
            <span>Open <strong>$${(q.o||0).toFixed(2)}</strong></span>
            <span>High <strong>$${(q.h||0).toFixed(2)}</strong></span>
            <span>Low <strong>$${(q.l||0).toFixed(2)}</strong></span>
            <span>Prev Close <strong>$${(q.pc||0).toFixed(2)}</strong></span>
          </div>
        </div>
        <button class="fav-btn ${pinned ? 'fav-active' : ''}"
                id="favBtn-${ticker}"
                onclick="toggleFavorite('${ticker}')"
                title="${pinned ? 'Remove from dashboard' : 'Pin to dashboard'}">
          ${pinned ? '★' : '☆'}<span class="fav-label">${pinned ? 'Pinned' : 'Pin'}</span>
        </button>
      </div>

      <div class="chart-card">
        <div class="chart-toolbar">
          <div class="range-row" id="rangeRow">
            <button class="range-btn active" data-range="1D">D</button>
            <button class="range-btn" data-range="1W">W</button>
            <button class="range-btn" data-range="1M">M</button>
            <button class="range-btn" data-range="1Y">Y</button>
            <button class="range-btn" data-range="ALL">All</button>
          </div>
          <div class="mode-row" id="modeRow">
            <button class="mode-btn active" data-mode="line"      title="Line Chart">📈</button>
            <button class="mode-btn"        data-mode="candle"    title="Candlestick">🕯️</button>
            <button class="mode-btn"        data-mode="analysis"  title="Technical Analysis">📊</button>
            <button class="mode-btn"        data-mode="sentiment" title="Sentiment Forecast">🔮</button>
          </div>
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
          ${mCard('Market Cap',     fmtBig((prof.marketCapitalization||0)*1e6),  'Total company value. Large-cap >$10B = more stable.')}
          ${mCard('52W High',       fmtVal(m['52WeekHigh'], '$'),                  'Highest price in the last year. Near this = strong momentum or resistance.')}
          ${mCard('52W Low',        fmtVal(m['52WeekLow'],  '$'),                  'Lowest price in the last year. Near this = weakness or potential opportunity.')}
          ${mCard('Beta',           fmtVal(m.beta),                                'Volatility vs the market. >1 = more volatile than S&P 500.')}
          ${mCard('Dividend Yield', m.dividendYieldIndicatedAnnual ? m.dividendYieldIndicatedAnnual.toFixed(2)+'%' : 'N/A', 'Annual dividend as % of price. Income investors target consistent dividend payers.')}
          ${mCard('ROE',            m.roeTTM ? m.roeTTM.toFixed(1)+'%' : 'N/A',   'Return on Equity — how efficiently the company generates profit.')}
        </div>
      </div>

      <div class="metrics-section">
        <div class="section-head">
          <span class="section-title">Recommendation — ${ticker}</span>
          <span class="tip-badge" data-tip="Blends technical signals (EMA crossover, Bollinger position, support/resistance), the sentiment forecast, and analyst consensus into one actionable verdict. Not financial advice.">How is this built?</span>
        </div>
        <div id="stockRec" style="padding:16px">${spinner()}</div>
      </div>

      ${analystData?.recommendations ? analystSection(analystData.recommendations, analystData.peers) : ''}

      <div class="metrics-section">
        <div class="section-head">
          <span class="section-title">Market Sentiment — $${ticker}</span>
          <span class="tip-badge" data-tip="Weighted: Reddit 22%, StockTwits 28%, News 16%, WSJ 12%, Seeking Alpha 13%, Forums 9%.">How is this scored?</span>
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

    _chartMode = 'line';
    _chartRange = '1D';
    loadCandles(ticker, '1D', 'line');

    document.getElementById('rangeRow').addEventListener('click', e => {
      const btn = e.target.closest('.range-btn');
      if (!btn) return;
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _chartRange = btn.dataset.range;
      loadCandles(ticker, _chartRange, _chartMode);
    });

    document.getElementById('modeRow').addEventListener('click', e => {
      const btn = e.target.closest('.mode-btn');
      if (!btn) return;
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _chartMode = btn.dataset.mode;
      loadCandles(ticker, _chartRange, _chartMode);
    });

    loadStockSentiment(ticker);
    loadRecommendation(ticker, analystData);
  } catch (e) {
    if (ticker !== _activeTicker) return;
    el.innerHTML = `<div style="padding:32px">${errState('Could not load ' + ticker + ' — ' + e.message)}</div>`;
  }
}

let _chartMode  = 'line';
let _chartRange = '1D';
let _lastSentimentScore = 0;

async function loadCandles(ticker, range, mode) {
  if (ticker !== _activeTicker) return;
  const wrap = document.querySelector('.canvas-wrap');
  if (wrap && !document.getElementById('priceChart')) {
    wrap.innerHTML = '<canvas id="priceChart"></canvas>';
  }
  try {
    const data = await API.getCandles(ticker, range);
    if (ticker !== _activeTicker) return;
    renderPriceChart('priceChart', data, range, mode || _chartMode, _lastSentimentScore);
  } catch {}
}

async function loadStockSentiment(ticker) {
  if (ticker !== _activeTicker) return;
  const el = document.getElementById('stockSent');
  if (!el) return;
  try {
    const d = await API.getTickerSentiment(ticker);
    if (ticker !== _activeTicker) return;
    _lastSentimentScore = d.score ?? 0;
    el.innerHTML = sentimentBlock(d, 5);
    // If sentiment mode is active, re-render chart with score
    if (_chartMode === 'sentiment') loadCandles(ticker, _chartRange, 'sentiment');
    // Refresh the recommendation card now that a real sentiment score is in
    if (_recCache.ticker === ticker) {
      renderRecommendationCard(ticker, _recCache.data, _lastSentimentScore, _recCache.analystData);
    }
  } catch (e) {
    if (ticker !== _activeTicker) return;
    el.innerHTML = `<div style="padding:16px">${errState(e.message)}</div>`;
  }
}

// ── Recommendation (technicals + sentiment forecast + analyst consensus) ──────

let _recCache = { ticker: null, data: null, analystData: null };

async function loadRecommendation(ticker, analystData) {
  if (ticker !== _activeTicker) return;
  const el = document.getElementById('stockRec');
  if (!el) return;
  try {
    // Use a stable weekly dataset (1Y) for technicals — independent of whichever
    // range/mode the user currently has the chart set to, and long enough for
    // EMA9/EMA21 to have a prior value to detect a crossover against.
    const data = await API.getCandles(ticker, '1Y');
    if (ticker !== _activeTicker) return;
    if (!data || data.s !== 'ok' || !data.c?.length) {
      el.innerHTML = `<div class="empty-state"><div class="es-icon">🤷</div><div class="es-title">Not enough price history</div></div>`;
      return;
    }
    _recCache = { ticker, data, analystData };
    renderRecommendationCard(ticker, data, _lastSentimentScore, analystData);
  } catch (e) {
    if (ticker !== _activeTicker) return;
    el.innerHTML = `<div style="padding:16px">${errState(e.message)}</div>`;
  }
}

function renderRecommendationCard(ticker, data, sentScore, analystData) {
  if (ticker !== _activeTicker) return;
  const el = document.getElementById('stockRec');
  if (!el) return;

  const rec = buildRecommendation(data, sentScore, analystData?.recommendations);

  el.innerHTML = `
    <div class="rec-card" style="border-color:${rec.color}40">
      <div class="rec-head">
        <span class="rec-icon">${rec.icon}</span>
        <div>
          <div class="rec-verdict" style="color:${rec.color}">${rec.verdict}</div>
          <div class="rec-conf">${rec.confidence}</div>
        </div>
      </div>
      <p class="rec-advice">${rec.advice}</p>
      <div class="rec-grid">
        <div class="rec-factor">
          <span class="rec-flabel">Technical</span>
          <span class="rec-fval">${rec.technical.signal}</span>
        </div>
        <div class="rec-factor">
          <span class="rec-flabel">Sentiment Forecast</span>
          <span class="rec-fval">${rec.sentiment.text}</span>
        </div>
        ${rec.analyst ? `
        <div class="rec-factor">
          <span class="rec-flabel">Analyst Consensus</span>
          <span class="rec-fval">${rec.analyst.label}</span>
        </div>` : ''}
      </div>
      <div class="rec-levels">
        <span class="rec-level buy-zone">📥 Buy near <strong>$${rec.technical.support.toFixed(2)}</strong> (support)</span>
        <span class="rec-level sell-zone">📤 Trim/sell near <strong>$${rec.technical.resistance.toFixed(2)}</strong> (resistance)</span>
      </div>
      <div class="rec-disclaimer">Generated from EMA/Bollinger technicals, compiled sentiment, and analyst data. Not financial advice.</div>
    </div>`;
}

// ── Super Bean Mode ───────────────────────────────────────────────────────────

let _sbActive   = false;
let _sbInterval = null;
let _sbBeans    = [];
let _sbIconsSwapped = false;

function activateSuperBean() {
  if (_sbActive) return;
  _sbActive = true;
  document.getElementById('sbStopBtn').classList.remove('hidden');

  const endTime = Date.now() + 5000;

  function spawnBean() {
    if (Date.now() > endTime) {
      clearInterval(_sbInterval);
      _sbInterval = null;
      if (!_sbIconsSwapped) _sbSwapIcons();
      return;
    }
    const b = document.createElement('div');
    b.className = 'sb-bean';
    b.textContent = '🫘';
    const size = 18 + Math.random() * 34;
    b.style.cssText = `left:${Math.random()*100}vw;font-size:${size}px;animation-duration:${1.2+Math.random()*2.8}s;animation-delay:0s`;
    document.body.appendChild(b);
    _sbBeans.push(b);
    setTimeout(() => { b.remove(); _sbBeans = _sbBeans.filter(x=>x!==b); }, 4200);
  }

  // Burst 30 immediately, then continuous
  for (let i = 0; i < 30; i++) setTimeout(spawnBean, i * 40);
  _sbInterval = setInterval(spawnBean, 35);
}

function _sbSwapIcons() {
  _sbIconsSwapped = true;
  document.querySelectorAll('.nav-icon, .tbar-icon-btn svg').forEach(icon => {
    icon.style.visibility = 'hidden';
    const span = document.createElement('span');
    span.className = 'sb-icon-bean';
    span.textContent = '🫘';
    icon.after(span);
  });
}

function stopSuperBean() {
  _sbActive = false;
  clearInterval(_sbInterval);
  _sbInterval = null;
  _sbBeans.forEach(b => b.remove());
  _sbBeans = [];
  document.querySelectorAll('.sb-bean').forEach(b => b.remove());
  if (_sbIconsSwapped) {
    _sbIconsSwapped = false;
    document.querySelectorAll('.sb-icon-bean').forEach(s => s.remove());
    document.querySelectorAll('.nav-icon, .tbar-icon-btn svg').forEach(icon => { icon.style.visibility = ''; });
  }
  document.getElementById('sbStopBtn').classList.add('hidden');
}

// ── Stock Search Controls ─────────────────────────────────────────────────────

document.getElementById('stockSearchBtn').addEventListener('click', () => {
  const v = document.getElementById('stockInput').value.trim().toUpperCase();
  if (!v) return;
  if (v === 'BEAN') { document.getElementById('stockInput').value = ''; activateSuperBean(); return; }
  loadStockView(v);
});
document.getElementById('stockInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('stockSearchBtn').click();
});

// ── Sectors ───────────────────────────────────────────────────────────────────

const SECTORS = [
  { name: 'Technology',  desc: 'Software, hardware, semiconductors & cloud',         tickers: ['AAPL','MSFT','NVDA','GOOGL','META','AMD','INTC','CRM','ORCL','ADBE'] },
  { name: 'Healthcare',  desc: 'Pharma, biotech, medical devices & managed care',    tickers: ['JNJ','PFE','UNH','ABBV','MRK','LLY','BMY','GILD','AMGN','CVS'] },
  { name: 'Finance',     desc: 'Banks, asset managers, insurance & payment networks',tickers: ['JPM','BAC','GS','MS','WFC','C','BLK','AXP','V','MA'] },
  { name: 'Energy',      desc: 'Oil, natural gas, refining & oilfield services',     tickers: ['XOM','CVX','COP','EOG','SLB','OXY','PSX','VLO','HAL','DVN'] },
  { name: 'Consumer',    desc: 'Retail, e-commerce, restaurants, autos & apparel',  tickers: ['AMZN','TSLA','WMT','HD','NKE','TGT','SBUX','LOW','MCD','F'] },
  { name: 'Industrials', desc: 'Aerospace, defense, machinery & logistics',          tickers: ['CAT','DE','BA','UPS','HON','MMM','GE','LMT','RTX','NOC'] },
  { name: 'Utilities',   desc: 'Electric, gas & water — defensive, dividend-heavy',  tickers: ['NEE','DUK','SO','AEP','EXC','D','XEL','AES','ED','AWK'] },
  { name: 'Real Estate', desc: 'REITs — data centers, towers, warehouses & retail', tickers: ['AMT','PLD','EQIX','CCI','SPG','WELL','DLR','O','PSA','AVB'] },
];

async function loadSectors() {
  const perfEl = document.getElementById('sectorPerfRow');
  const grid   = document.getElementById('sectorGrid');
  grid.className = 'sec-grid-clean';

  let perfMap = {};
  try {
    const data = await API.getSectors();
    (data || []).forEach(s => { perfMap[s.sector] = s.atdChange || 0; });
  } catch {}

  // Sort sectors best → worst for the performance bar
  const sorted = [...SECTORS].sort((a, b) => {
    const ca = a.name in perfMap ? perfMap[a.name] : -999;
    const cb = b.name in perfMap ? perfMap[b.name] : -999;
    return cb - ca;
  });

  perfEl.innerHTML = `<div class="sec-perf-bar">${sorted.map(s => {
    const chg = s.name in perfMap ? perfMap[s.name] : null;
    const cls = chg === null ? '' : chg >= 0 ? 'up' : 'down';
    const id  = `sec-${s.name.replace(/\s+/g, '-')}`;
    return `<div class="sec-pill ${cls}"
      onclick="document.getElementById('${id}').scrollIntoView({behavior:'smooth',block:'start'})">
      <span>${s.name}</span>
      <span class="sp-chg">${chg !== null ? (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%' : '—'}</span>
    </div>`;
  }).join('')}</div>`;

  grid.innerHTML = SECTORS.map(s => {
    const id  = `sec-${s.name.replace(/\s+/g, '-')}`;
    const chg = s.name in perfMap ? perfMap[s.name] : null;
    return `
      <div class="sec-card-clean" id="${id}">
        <div class="sec-card-header">
          <span class="sec-card-name">${s.name}</span>
          <span class="sec-card-desc">${s.desc}</span>
          ${chg !== null ? `<span class="sec-card-chg ${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>` : ''}
        </div>
        <table class="sec-stock-table">
          <tbody>
            ${s.tickers.map(t => `
              <tr onclick="loadStockView('${t}')">
                <td class="sec-td-ticker">${t}</td>
                <td class="sec-td-name">${tickerName(t)}</td>
                <td class="sec-td-price" id="stp-${t}">—</td>
                <td class="sec-td-chg"   id="stc-${t}">—</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }).join('');

  loadAllSectorPrices();
}

async function loadAllSectorPrices() {
  const allTickers = SECTORS.flatMap(s => s.tickers);
  const chunks = [];
  for (let i = 0; i < allTickers.length; i += 30) chunks.push(allTickers.slice(i, i + 30));

  const batchResults = await Promise.allSettled(chunks.map(c => API.getBatch(c.join(','))));
  const priceData = {};
  batchResults.forEach(r => {
    if (r.status !== 'fulfilled') return;
    r.value.forEach(d => {
      if (d.quote?.c) priceData[d.ticker] = { price: d.quote.c, chg: d.quote.dp ?? 0 };
    });
  });

  allTickers.forEach(t => {
    const priceEl = document.getElementById('stp-' + t);
    const chgEl   = document.getElementById('stc-' + t);
    if (!priceEl || !chgEl) return;
    const d = priceData[t];
    if (!d) { priceEl.textContent = '—'; chgEl.textContent = '—'; return; }
    priceEl.textContent = `$${d.price.toFixed(2)}`;
    chgEl.textContent   = `${d.chg >= 0 ? '+' : ''}${d.chg.toFixed(2)}%`;
    chgEl.className     = `sec-td-chg ${d.chg >= 0 ? 'up' : 'down'}`;
  });
}

// ── IPO Calendar ─────────────────────────────────────────────────────────────

let _ipoData   = [];
let _ipoFilter = 'all';

async function loadIPOs() {
  const el = document.getElementById('ipoGrid');
  el.innerHTML = `<div style="padding:40px 0">${spinner()}</div>`;
  try {
    _ipoData = await API.getIPOs();
    renderIPOs();
  } catch (e) {
    el.innerHTML = errState('Could not load IPO data — ' + e.message);
  }
}

function renderIPOs() {
  const el = document.getElementById('ipoGrid');
  const list = _ipoFilter === 'all' ? _ipoData : _ipoData.filter(ipo => ipo.status === _ipoFilter);

  if (!list.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="es-icon">🔍</div>
        <div class="es-title">No IPOs found</div>
        <div class="es-body">No ${_ipoFilter === 'all' ? '' : _ipoFilter + ' '}IPOs in the past 30 days or next 90 days. Check back soon.</div>
      </div>`;
    return;
  }

  // Sort: upcoming first, then by date descending
  const statusOrder = { expected: 0, priced: 1, filed: 2, withdrawn: 3 };
  const sorted = [...list].sort((a, b) => {
    const so = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (so !== 0) return so;
    return new Date(b.date || 0) - new Date(a.date || 0);
  });

  el.innerHTML = `<div class="ipo-grid">${sorted.map(ipoCard).join('')}</div>`;
}

function downloadICS(btn) {
  const name   = btn.dataset.name;
  const date   = btn.dataset.date;
  const symbol = btn.dataset.sym;
  if (!date) { alert('No date available for this IPO.'); return; }
  const d   = date.replace(/-/g, '');
  const uid = `ipo-${symbol || name}-${d}@beanstock`;
  const title = `IPO: ${name}${symbol ? ' (' + symbol + ')' : ''}`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BeanStock//IPO Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART;VALUE=DATE:${d}`,
    `DTEND;VALUE=DATE:${d}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${name} IPO — track live on BeanStock.`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `IPO-${symbol || name}.ics` });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function ipoCard(ipo) {
  const STATUS = {
    expected:  { cls: 'expected',  label: 'Upcoming',  tip: 'Scheduled for a future date' },
    priced:    { cls: 'priced',    label: 'Priced',    tip: 'Price has been set — trading imminent' },
    filed:     { cls: 'filed',     label: 'Filed',     tip: 'Company has filed with the SEC, date TBD' },
    withdrawn: { cls: 'withdrawn', label: 'Withdrawn', tip: 'IPO was cancelled or postponed' },
  };
  const s   = STATUS[ipo.status] || STATUS.filed;
  const val = ipo.totalSharesValue
    ? (ipo.totalSharesValue >= 1000 ? '$' + (ipo.totalSharesValue / 1000).toFixed(1) + 'B' : '$' + ipo.totalSharesValue.toFixed(0) + 'M')
    : '—';
  const shares = ipo.numberOfShares
    ? (ipo.numberOfShares >= 1e6 ? (ipo.numberOfShares / 1e6).toFixed(1) + 'M' : (ipo.numberOfShares / 1e3).toFixed(0) + 'K')
    : '—';
  const calBtn = (ipo.status === 'expected' || ipo.status === 'priced') && ipo.date
    ? `<button class="ipo-cal-btn" onclick="downloadICS(this)" data-name="${esc(ipo.name || '')}" data-date="${esc(ipo.date || '')}" data-sym="${esc(ipo.symbol || '')}">📅 Add to Calendar</button>`
    : '';

  return `
    <div class="ipo-card">
      <div class="ipo-card-head">
        <div class="ipo-name-block">
          <div class="ipo-name">${esc(ipo.name || 'Unknown Company')}</div>
          <div class="ipo-meta">
            ${ipo.symbol ? `<span class="ipo-sym">${esc(ipo.symbol)}</span>` : ''}
            ${ipo.exchange ? `<span class="ipo-exchange">${esc(ipo.exchange)}</span>` : ''}
          </div>
        </div>
        <span class="ipo-badge ${s.cls}" title="${s.tip}">${s.label}</span>
      </div>
      <div class="ipo-stats">
        <div class="ipo-stat"><span class="ipo-sl">Date</span><span class="ipo-sv">${esc(ipo.date || '—')}</span></div>
        <div class="ipo-stat"><span class="ipo-sl">Price Range</span><span class="ipo-sv">${esc(ipo.price || '—')}</span></div>
        <div class="ipo-stat"><span class="ipo-sl">Shares</span><span class="ipo-sv">${shares}</span></div>
        <div class="ipo-stat"><span class="ipo-sl">Deal Size</span><span class="ipo-sv">${val}</span></div>
      </div>
      ${calBtn}
    </div>`;
}

// IPO filter tabs
document.getElementById('view-ipos')?.addEventListener('click', e => {
  const tab = e.target.closest('.ipo-tab');
  if (!tab) return;
  document.querySelectorAll('.ipo-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  _ipoFilter = tab.dataset.filter;
  renderIPOs();
});

// ── Penny Stocks ─────────────────────────────────────────────────────────────

let _pennyData   = [];
let _pennyMaxP   = 5;
let _pennyMinP   = 0;

async function loadPennyStocks() {
  const grid = document.getElementById('pennyGrid');
  grid.innerHTML = `<div style="padding:40px 0">${spinner()}</div>`;
  loadPennySentimentBar();
  try {
    _pennyData = await API.getPennyStocks(5); // always load full $5 dataset; tabs filter client-side
    renderPennyGrid();
  } catch (e) {
    grid.innerHTML = errState('Could not load penny stocks — ' + e.message);
  }
}

function renderPennyGrid() {
  const grid = document.getElementById('pennyGrid');
  const list = _pennyMinP > 0
    ? _pennyData.filter(s => s.price >= _pennyMinP && s.price <= _pennyMaxP)
    : _pennyData.filter(s => s.price <= _pennyMaxP);

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state"><div class="es-icon">💸</div><div class="es-title">No penny stocks found</div><div class="es-body">Try a different price filter or refresh.</div></div>`;
    return;
  }

  grid.innerHTML = `<div class="penny-grid">${list.map(pennyCard).join('')}</div>`;
}

function pennyCard(s) {
  const up  = s.change >= 0;
  const col = up ? 'var(--green)' : 'var(--red)';
  const vol = s.volume >= 1e6 ? (s.volume / 1e6).toFixed(1) + 'M'
            : s.volume >= 1e3 ? (s.volume / 1e3).toFixed(0) + 'K' : s.volume;
  const mcap = s.marketCap >= 1e9 ? '$' + (s.marketCap / 1e9).toFixed(2) + 'B'
             : s.marketCap >= 1e6 ? '$' + (s.marketCap / 1e6).toFixed(1) + 'M'
             : s.marketCap > 0   ? '$' + s.marketCap : '—';
  const alert = s.price < 0.1 ? '<span class="penny-risk-tag">⚠️ Sub-penny</span>' : s.price < 0.5 ? '<span class="penny-risk-tag">🔴 High Risk</span>' : '';

  return `
    <div class="penny-card" onclick="loadStockView('${esc(s.symbol)}')">
      <div class="penny-card-top">
        <div>
          <div class="penny-sym">${esc(s.symbol)} ${alert}</div>
          <div class="penny-name">${esc(s.name)}</div>
        </div>
        <div class="penny-price-wrap">
          <div class="penny-price">$${s.price.toFixed(s.price < 0.1 ? 4 : 2)}</div>
          <div class="penny-chg" style="color:${col}">${up ? '▲' : '▼'} ${Math.abs(s.change).toFixed(2)}%</div>
        </div>
      </div>
      <div class="penny-stats">
        <div class="penny-stat"><span class="ps-lbl">Volume</span><span class="ps-val">${vol}</span></div>
        <div class="penny-stat"><span class="ps-lbl">Mkt Cap</span><span class="ps-val">${mcap}</span></div>
      </div>
      <div class="penny-sent-row" id="psent-${esc(s.symbol)}">
        <span class="ps-lbl">Sentiment</span><span class="ps-loading">Loading…</span>
      </div>
    </div>`;
}

async function loadPennySentimentBar() {
  const el = document.getElementById('pennySentBar');
  try {
    // Use penny-weighted trending sentiment from the trending endpoint, with penny context
    const d = await API.getTrending();
    const v = marketVerdict(d.score);
    el.innerHTML = `
      <div class="sent-body" style="padding:0">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div class="sent-score" style="color:${sentColor(d.label)};font-size:28px">${d.score >= 0 ? '+' : ''}${d.score.toFixed(1)}</div>
          <div>
            <div class="sent-label" style="color:${sentColor(d.label)}">${d.label}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">Based on r/pennystocks, r/OTCstocks, r/RobinHoodPennyStocks + forums</div>
          </div>
          <div class="verdict-card" style="flex:1;min-width:240px;border-color:${v.color}30;background:${v.color}0e;margin:0">
            <div class="verdict-top"><span class="verdict-icon">${v.icon}</span><span class="verdict-label" style="color:${v.color}">${v.label}</span><span class="verdict-action" style="background:${v.color}22;color:${v.color}">${v.action}</span></div>
            <p class="verdict-advice" style="margin:4px 0 0">${v.advice}</p>
          </div>
        </div>
      </div>`;
  } catch {
    el.innerHTML = '<p style="color:var(--muted);font-size:12px">Sentiment unavailable</p>';
  }
}

// Load penny sentiment inline on each card (lazy, after grid renders)
async function loadPennyCardSentiments() {
  const visible = _pennyData.slice(0, 12); // only first 12 to avoid rate limits
  await Promise.allSettled(visible.map(async s => {
    try {
      const d = await API.getPennySentiment(s.symbol);
      const el = document.getElementById(`psent-${s.symbol}`);
      if (!el) return;
      const cls = d.score > 1 ? 'pos' : d.score < -1 ? 'neg' : 'neu';
      el.innerHTML = `<span class="ps-lbl">Sentiment</span><span class="wl-sent-pill ${cls}">${d.score >= 0 ? '+' : ''}${d.score.toFixed(1)}</span><span class="ps-lbl" style="margin-left:8px">${d.label}</span>`;
    } catch {}
  }));
}

// Penny filter tab handler
document.getElementById('view-pennystocks')?.addEventListener('click', e => {
  const tab = e.target.closest('.ipo-tab');
  if (!tab || !tab.dataset.pmax) return;
  document.querySelectorAll('#view-pennystocks .ipo-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  _pennyMaxP = parseFloat(tab.dataset.pmax);
  _pennyMinP = parseFloat(tab.dataset.pmin || 0);
  renderPennyGrid();
});

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
// Definition: low media/analyst attention (proxied by market cap + 52W position)
// with high algorithmic quality (fundamentals + EMA/Bollinger technical bias).

const UNDERDOG_POOL = [
  // Energy — cyclical, often deeply undervalued, little media love outside oil spikes
  'OXY','DVN','HAL','SLB','PSX','VLO','MRO','APA','CNX','CIVI','MTDR','RRC','AR',
  // Finance — regional banks and old-guard players trade at deep discounts with no hype
  'C','USB','KEY','FITB','RF','ZION','BK','STT','MTB','CFG','TFC','HBAN',
  // Technology — old-guard tech overshadowed by AI narrative despite solid fundamentals
  'INTC','IBM','HPQ','CSCO','JNPR','DELL','STX','WDC',
  // Healthcare — large pharma with real earnings but pipeline skepticism keeps P/E low
  'BMY','PFE','MRK','ABBV','GILD','BIIB','VTRS','AMGN',
  // Consumer — brand fatigue, margin pressure — the market has priced in maximum pessimism
  'KHC','WBA','PARA','DIS','MO','PM','F','GM','VFC','HBI','BTI',
  // Industrials — boring compounders that rarely trend on social media
  'MMM','GE','HON','EMR','ETN','DOV','ROK',
  // Communications — priced like dying businesses despite massive infrastructure value
  'VZ','T','LUMN',
  // Utilities — rate-sensitive but operationally resilient; zero retail investor excitement
  'D','SO','AES','NRG','AEE','CMS','DTE','LNT','POR',
  // REITs — punished by rate fears, real estate cashflows largely intact
  'VNO','SLG','BXP','KIM','REG','FRT','EPR','MPW',
];

async function loadUnderdogs() {
  const el = document.getElementById('underdogGrid');
  el.innerHTML = `<div style="padding:20px 0">${spinner()}</div>`;
  try {
    // Stage 1 — batch fundamentals for all ~81 tickers in chunks of 30
    const chunks = [];
    for (let i = 0; i < UNDERDOG_POOL.length; i += 30) chunks.push(UNDERDOG_POOL.slice(i, i + 30));
    const batchResults = await Promise.allSettled(chunks.map(c => API.getBatch(c.join(','))));

    const allData = [];
    batchResults.forEach(r => {
      if (r.status !== 'fulfilled') return;
      r.value.forEach(d => { if (d.quote?.c > 0 && d.metrics) allData.push(d); });
    });

    const fundamentalScored = allData
      .map(d => {
        const { score, reasons } = scoreUnderdogFundamentals(d.quote, d.metrics);
        return { ...d, fundScore: score, reasons };
      })
      .filter(d => d.fundScore >= 3)
      .sort((a, b) => b.fundScore - a.fundScore);

    // Stage 2 — fetch 1Y candles for top 12 fundamental picks, compute technical bias
    const TOP_N = 12;
    const topStocks = fundamentalScored.slice(0, TOP_N);
    const candleResults = await Promise.allSettled(
      topStocks.map(d => API.getCandles(d.ticker, '1Y'))
    );

    const final = topStocks.map((d, i) => {
      let techScore = 0;
      let techSignal = null;
      const candles = candleResults[i].status === 'fulfilled' ? candleResults[i].value : null;
      if (candles?.s === 'ok' && candles.c?.length >= 15) {
        const tech = computeTechnicals(candles.c);
        techScore = (tech.biasScore || 0) + (tech.slopeBias || 0) + (tech.levelBias || 0);
        if (tech.bbBias > 0) techScore += 1;
        techSignal = tech.signal;
      }
      return { ...d, techScore, techSignal, udScore: d.fundScore * 0.60 + techScore * 0.40 };
    });

    const scored = final
      .filter(d => d.udScore >= 2)
      .sort((a, b) => b.udScore - a.udScore)
      .slice(0, 10);

    if (!scored.length) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="es-icon">🌱</div>
          <div class="es-title">No standout underdogs today</div>
          <div class="es-body">No stocks in the pool currently clear all criteria. Check back after market close.</div>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="ud-count-row">${scored.length} algorithmic underdogs — low media attention, strong fundamentals</div>
      <div class="ud-grid">${scored.map(d => underdogCard(d)).join('')}</div>`;
  } catch (e) {
    el.innerHTML = errState(e.message);
  }
}

function scoreUnderdogFundamentals(quote, metrics) {
  let score = 0;
  const reasons = [];
  const price = quote.c;
  const m = metrics.metric || {};
  const high52  = m['52WeekHigh'];
  const low52   = m['52WeekLow'];
  const range   = (high52 && low52 && high52 > low52) ? high52 - low52 : 0;
  const inRange = range > 0 ? (price - low52) / range : 0.5;
  const mcapM   = m.marketCapitalization || 0; // Finnhub returns in millions
  const mcapB   = mcapM / 1000;

  // 52W position — near lows means the market is sleeping on it
  if (inRange < 0.25) {
    score += 3;
    reasons.push(`In the bottom ${Math.round(inRange * 100)}% of its 52-week range — market is deeply discounting it`);
  } else if (inRange < 0.45) {
    score += 1;
    reasons.push(`Lower half of its 52-week range ($${low52?.toFixed(0)}–$${high52?.toFixed(0)})`);
  }

  // P/E — low P/E = value nobody is pricing in; high P/E = already hyped
  if (m.peNormalizedAnnual > 0 && m.peNormalizedAnnual < 10) {
    score += 3;
    reasons.push(`P/E of ${m.peNormalizedAnnual.toFixed(1)}× — deeply undervalued vs. S&P 500 average (~22×)`);
  } else if (m.peNormalizedAnnual > 0 && m.peNormalizedAnnual < 18) {
    score += 2;
    reasons.push(`Below-average P/E of ${m.peNormalizedAnnual.toFixed(1)}× — earnings not yet priced in by the crowd`);
  } else if (m.peNormalizedAnnual > 30) {
    score -= 1;
  }

  // Profitability — only real businesses qualify
  if (m.epsNormalizedAnnual > 1.5) {
    score += 2;
    reasons.push(`Strong EPS of $${m.epsNormalizedAnnual.toFixed(2)} — materially profitable, not speculative`);
  } else if (m.epsNormalizedAnnual > 0) {
    score += 1;
    reasons.push(`Positive EPS of $${m.epsNormalizedAnnual.toFixed(2)} — generating real earnings`);
  } else if (m.epsNormalizedAnnual < 0) {
    score -= 2;
  }

  // ROE — capital efficiency the media ignores
  if (m.roeTTM > 15) {
    score += 1;
    reasons.push(`ROE of ${m.roeTTM.toFixed(1)}% — efficiently generating profit from equity`);
  }

  // Dividend — investors get paid while the market ignores the stock
  if (m.dividendYieldIndicatedAnnual > 4) {
    score += 2;
    reasons.push(`${m.dividendYieldIndicatedAnnual.toFixed(1)}% dividend yield — paid to wait for the market to notice`);
  } else if (m.dividendYieldIndicatedAnnual > 2) {
    score += 1;
    reasons.push(`${m.dividendYieldIndicatedAnnual.toFixed(1)}% dividend yield — steady income while overlooked`);
  }

  // Obscurity bonus — smaller market caps attract fewer analysts and journalists
  if (mcapB > 0) {
    if (mcapB < 15) {
      score += 2;
      reasons.push(`Small-cap ($${mcapB.toFixed(1)}B) — minimal analyst coverage and media oxygen`);
    } else if (mcapB < 75) {
      score += 1;
      reasons.push(`Mid-cap ($${mcapB.toFixed(1)}B) — flying well below the mega-cap media radar`);
    } else if (mcapB > 400) {
      score -= 1;
    }
  }

  // Beta — not a meme stock, suitable for patient investors
  if (m.beta > 0.4 && m.beta < 1.3) {
    score += 1;
    reasons.push(`Beta of ${m.beta.toFixed(2)} — sober volatility, not meme-driven noise`);
  } else if (m.beta > 2.5) {
    score -= 1;
  }

  return { score, reasons };
}

function underdogCard(d) {
  const q = d.quote;
  const m = d.metrics?.metric || {};
  const chg  = q.dp ?? 0;
  const price = q.c || 0;
  const tier = d.udScore >= 6 ? { label: 'Strong Underdog', color: '#22c55e' }
             : d.udScore >= 4 ? { label: 'Underdog',         color: '#14b8a6' }
             :                  { label: 'Watch',             color: '#f59e0b' };

  return `
    <div class="ud-card" onclick="loadStockView('${esc(d.ticker)}')">
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
        ${d.reasons.slice(0, 3).map(r => `<div class="ud-reason">✓ ${esc(r)}</div>`).join('')}
      </div>
      ${d.techSignal ? `<div class="ud-tech-signal">Algorithm signal: <strong>${esc(d.techSignal)}</strong></div>` : ''}
      <div class="ud-chips">
        ${m.peNormalizedAnnual > 0           ? `<span class="ud-chip">P/E ${m.peNormalizedAnnual.toFixed(1)}</span>` : ''}
        ${m.dividendYieldIndicatedAnnual > 0 ? `<span class="ud-chip">Div ${m.dividendYieldIndicatedAnnual.toFixed(1)}%</span>` : ''}
        ${m.beta                             ? `<span class="ud-chip">β ${m.beta.toFixed(2)}</span>` : ''}
        ${m.epsNormalizedAnnual > 0          ? `<span class="ud-chip">EPS $${m.epsNormalizedAnnual.toFixed(2)}</span>` : ''}
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
      { icon: '🌱', title: 'Understanding Underdogs', body: 'An underdog is a stock the media, Reddit, and "guru" influencers are ignoring — but algorithmic analysis reveals it should be performing significantly better than its sentiment suggests. BeanStock finds underdogs using a two-stage filter: first, fundamentals (low P/E, positive EPS, dividend, market cap below the spotlight threshold); then technical analysis (EMA crossover bias, Bollinger Band position) to confirm the algorithm sees real upside the crowd has missed. High sentiment ≠ good investment. Low attention + strong fundamentals + bullish technicals = underdog.', example: 'A mid-cap energy company trading at 8× earnings with a 5% dividend yield, in the bottom 20% of its 52-week range, with zero Reddit buzz — but EMA9 crossing above EMA21. That\'s a textbook underdog.' },
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
  if (sources.reddit)     panels.push(sourcePanel('Reddit',         sources.reddit.score,     sources.reddit.label,     `${sources.reddit.postCount || 0} posts`,                                                              '#FF4500'));
  if (sources.stocktwits) panels.push(sourcePanel('StockTwits',     sources.stocktwits.score, sources.stocktwits.label, sources.stocktwits.total ? `${sources.stocktwits.bullish} Bull · ${sources.stocktwits.bearish} Bear` : 'No data', '#40A0D0'));
  if (sources.news)       panels.push(sourcePanel('Yahoo News',     sources.news.score,       sources.news.label,       `${sources.news.articles?.length || 0} articles`,                                                     '#F5A623'));
  if (sources.wsj)        panels.push(sourcePanel('WSJ',            sources.wsj.score,        sources.wsj.label,        sources.wsj.directMentions > 0 ? `${sources.wsj.directMentions} mentions` : 'Market-wide',           '#C9A227'));
  if (sources.sa)         panels.push(sourcePanel('Seeking Alpha',  sources.sa.score,         sources.sa.label,         `${sources.sa.articleCount || 0} articles`,                                                           '#FF5733'));
  if (sources.forum)      panels.push(sourcePanel('Forums',         sources.forum.score,      sources.forum.label,      `${sources.forum.postCount || 0} posts`,                                                              '#6366F1'));
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

// ── Connect Page ──────────────────────────────────────────────────────────────

function loadConnect() {
  const el = document.getElementById('connectBody');
  if (!el) return;

  // Bookmarklet: detects ticker from selection → URL → title → prompt, then opens companion window
  const bmCode = `(function(){` +
    `var t=(window.getSelection()||{}).toString().trim().toUpperCase().replace(/[^A-Z.]/g,'');` +
    `var P=[/\\/stocks\\/([A-Z]{1,5})(?:\\/|\\?|$)/i,/\\/quote\\/([A-Z.]{1,6})(?:\\/|:|\\?|$)/i,` +
    `/\\/symbol\\/([A-Z]{1,5})(?:\\/|\\?|$)/i,/[?&]t=([A-Z]{1,5})(?:&|$)/i,` +
    `/\\/stock\\/([A-Z]{1,5})(?:\\/|\\?|$)/i,/\\/([A-Z]{2,5})\\/(?:summary|overview|chart)/i];` +
    `if(!t)for(var i=0;i<P.length;i++){var m=location.href.match(P[i]);if(m){t=m[1].toUpperCase();break;}}` +
    `if(!t){var r=document.title.match(/^\\$?([A-Z]{2,5})\\s*[-|–]/);if(r)t=r[1];}` +
    `if(!t)t=prompt('Enter ticker (e.g. AAPL):','');` +
    `if(t)window.open('http://localhost:3001/?quick='+t,'BeanStock','width=460,height=720,top=20,left='+Math.max(0,screen.width-490));` +
    `})()`;

  const sites = ['Robinhood','Webull','Yahoo Finance','MarketWatch','Seeking Alpha',
                 'Google Finance','TD Ameritrade','Fidelity','StockAnalysis','Finviz','TradingView'];

  el.innerHTML = `
    <div class="connect-hero">
      <div class="connect-hero-icon">🔌</div>
      <h2 class="connect-hero-title">BeanStock — Anywhere</h2>
      <p class="connect-hero-sub">Get instant Buy / Hold / Sell analysis on any stock, on any trading site, with one click.</p>
    </div>

    <div class="connect-steps-grid">
      <div class="connect-step-card">
        <div class="csc-num">1</div>
        <div class="csc-body">
          <div class="csc-title">Keep BeanStock running</div>
          <div class="csc-desc">The server must be active on port 3001. Run it in a terminal — or start it silently in the background with the script below.</div>
          <code class="connect-inline-code">node server/index.js</code>
        </div>
      </div>

      <div class="connect-step-card">
        <div class="csc-num">2</div>
        <div class="csc-body">
          <div class="csc-title">Drag the bookmarklet to your browser bar</div>
          <div class="csc-desc">This button is a live bookmarklet — drag it to your bookmarks bar. One click on any page opens a companion BeanStock window.</div>
          <div class="bm-drag-zone">
            <a id="bm-link" class="bm-drag-btn" title="Drag to your bookmarks bar">🫘 BeanStock Quick</a>
            <span class="bm-drag-arrow">← drag me</span>
          </div>
          <div class="bm-tip">💡 Tip: select a ticker first and it auto-detects it. Otherwise a prompt appears.</div>
        </div>
      </div>

      <div class="connect-step-card">
        <div class="csc-num">3</div>
        <div class="csc-body">
          <div class="csc-title">Works with all major platforms</div>
          <div class="csc-desc">Auto-detects tickers from URLs and page titles on popular brokerages and finance sites.</div>
          <div class="connect-sites">${sites.map(s => `<span class="site-chip">${s}</span>`).join('')}</div>
        </div>
      </div>

      <div class="connect-step-card highlight-card">
        <div class="csc-num">4</div>
        <div class="csc-body">
          <div class="csc-title">Try it right now</div>
          <div class="csc-desc">Type any ticker below and open the companion window to preview exactly what you'll see.</div>
          <div class="connect-test-row">
            <input id="connectTestInput" class="connect-test-input" placeholder="AAPL, TSLA, NVDA…" maxlength="6" />
            <button class="btn-primary" onclick="testConnectQuick()">Open companion →</button>
          </div>
        </div>
      </div>
    </div>

    <div class="connect-bg-card">
      <div class="connect-bg-icon">🖥️</div>
      <div>
        <div class="connect-bg-title">Run BeanStock in the background (macOS)</div>
        <div class="connect-bg-desc">Paste this into Terminal once. BeanStock starts silently and stays running even after you close the terminal.</div>
        <pre class="connect-bg-code">cd ~/programs/beanstock/v2 &amp;&amp; nohup node server/index.js &gt; /tmp/beanstock.log 2&gt;&amp;1 &amp;
echo "🫘 BeanStock started — PID $!"</pre>
        <div class="connect-bg-stop">To stop: <code>pkill -f "beanstock/v2/server"</code></div>
      </div>
    </div>`;

  // Set bookmarklet href programmatically (avoids HTML-entity issues)
  const bmLink = document.getElementById('bm-link');
  if (bmLink) bmLink.href = 'javascript:' + bmCode;
}

function testConnectQuick() {
  const t = (document.getElementById('connectTestInput')?.value || '').trim().toUpperCase().replace(/[^A-Z.]/g, '');
  if (!t) { document.getElementById('connectTestInput')?.focus(); return; }
  window.open(`/?quick=${t}`, 'BeanStock', `width=460,height=720,top=20,left=${Math.max(0, screen.width - 490)}`);
}

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
  // Mega-cap / S&P 500 well-knowns
  AAPL:'Apple',MSFT:'Microsoft',NVDA:'NVIDIA',GOOGL:'Alphabet',META:'Meta',
  AMZN:'Amazon',TSLA:'Tesla',JNJ:'Johnson & Johnson',PFE:'Pfizer',UNH:'UnitedHealth',
  ABBV:'AbbVie',MRK:'Merck',JPM:'JPMorgan Chase',BAC:'Bank of America',GS:'Goldman Sachs',
  MS:'Morgan Stanley',WFC:'Wells Fargo',XOM:'ExxonMobil',CVX:'Chevron',
  COP:'ConocoPhillips',EOG:'EOG Resources',SLB:'SLB',WMT:'Walmart',
  HD:'Home Depot',NKE:'Nike',TGT:'Target',SBUX:'Starbucks',LOW:'Lowe\'s',MCD:'McDonald\'s',
  CAT:'Caterpillar',DE:'John Deere',BA:'Boeing',UPS:'UPS',HON:'Honeywell',
  LMT:'Lockheed Martin',RTX:'RTX Corporation',NOC:'Northrop Grumman',
  NEE:'NextEra Energy',DUK:'Duke Energy',AEP:'Am Electric Power',EXC:'Exelon',
  AMT:'American Tower',PLD:'Prologis',EQIX:'Equinix',CCI:'Crown Castle',SPG:'Simon Property',
  WELL:'Welltower',DLR:'Digital Realty',O:'Realty Income',PSA:'Public Storage',AVB:'AvalonBay',
  AMD:'AMD',CRM:'Salesforce',ORCL:'Oracle',ADBE:'Adobe',LLY:'Eli Lilly',
  BLK:'BlackRock',AXP:'American Express',V:'Visa',MA:'Mastercard',
  // ETFs
  SPY:'S&P 500 ETF',QQQ:'NASDAQ 100 ETF',DIA:'Dow Jones ETF',IWM:'Russell 2000 ETF',
  // Underdog pool — energy
  OXY:'Occidental Petroleum',DVN:'Devon Energy',HAL:'Halliburton',PSX:'Phillips 66',
  VLO:'Valero Energy',MRO:'Marathon Oil',APA:'APA Corporation',CNX:'CNX Resources',
  CIVI:'Civitas Resources',MTDR:'Matador Resources',RRC:'Range Resources',AR:'Antero Resources',
  // Underdog pool — finance
  C:'Citigroup',USB:'US Bancorp',KEY:'KeyCorp',FITB:'Fifth Third Bancorp',
  RF:'Regions Financial',ZION:'Zions Bancorp',BK:'BNY Mellon',STT:'State Street',
  MTB:'M&T Bank',CFG:'Citizens Financial',TFC:'Truist Financial',HBAN:'Huntington Bancshares',
  // Underdog pool — technology old-guard
  INTC:'Intel',IBM:'IBM',HPQ:'HP Inc',CSCO:'Cisco',JNPR:'Juniper Networks',
  DELL:'Dell Technologies',STX:'Seagate Technology',WDC:'Western Digital',
  // Underdog pool — healthcare
  BMY:'Bristol-Myers Squibb',GILD:'Gilead Sciences',BIIB:'Biogen',VTRS:'Viatris',AMGN:'Amgen',
  // Underdog pool — consumer
  F:'Ford Motor',GM:'General Motors',KHC:'Kraft Heinz',WBA:'Walgreens Boots',
  CVS:'CVS Health',PARA:'Paramount Global',DIS:'Disney',MO:'Altria Group',
  PM:'Philip Morris',VFC:'VF Corporation',HBI:'Hanesbrands',BTI:'British American Tobacco',
  // Underdog pool — industrials
  MMM:'3M Company',GE:'GE Aerospace',EMR:'Emerson Electric',ETN:'Eaton Corporation',
  DOV:'Dover Corporation',ROK:'Rockwell Automation',
  // Underdog pool — communications
  VZ:'Verizon',T:'AT&T',LUMN:'Lumen Technologies',
  // Underdog pool — utilities
  D:'Dominion Energy',AES:'AES Corporation',NRG:'NRG Energy',
  AEE:'Ameren',CMS:'CMS Energy',DTE:'DTE Energy',LNT:'Alliant Energy',POR:'Portland General Electric',
  // Underdog pool — REITs
  VNO:'Vornado Realty',SLG:'SL Green Realty',BXP:'BXP Inc',KIM:'Kimco Realty',
  REG:'Regency Centers',FRT:'Federal Realty',EPR:'EPR Properties',MPW:'Medical Properties Trust',
  // Meme / popular
  GME:'GameStop',AMC:'AMC Entertainment',
};
function tickerName(t) { return NAMES[t] || t; }

// ── Init ──────────────────────────────────────────────────────────────────────

// Quick mode — companion window launched from the bookmarklet (?quick=TICKER)
(function initQuickMode() {
  const qt = new URLSearchParams(location.search).get('quick')?.toUpperCase().trim();
  if (!qt) return;
  document.body.classList.add('quick-mode');
  document.title = `${qt} — BeanStock Quick`;
  loadStockView(qt);
})();

checkSetup();
checkFirstVisit();
markViewLoaded('dashboard');
loadDashboard();
loadLearn();

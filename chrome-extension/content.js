/**
 * BeanStock — Content Script
 *
 * Injected automatically on 20+ stock / finance sites.
 * Detects the current ticker from the URL or page DOM,
 * fetches analysis from the local BeanStock server,
 * and renders a floating side-panel with zero user interaction.
 *
 * Handles SPA navigation (Robinhood, Yahoo Finance, etc.) via
 * pushState/replaceState intercepts + a MutationObserver fallback.
 */
(function beanstockExtension() {
  'use strict';

  const HOST    = 'http://localhost:3001';
  const PANEL_ID = 'bs-ext-panel';
  const STYLE_ID = 'bs-ext-styles';

  let activeTicker = null;   // ticker whose analysis is currently shown
  let panelEl      = null;
  let minimized    = false;
  let navDebounce  = null;
  let lastHref     = location.href;

  // ── 1. Ticker Detection ────────────────────────────────────────────────────

  // Ordered from most-specific to least-specific.
  // Each entry: [regex, capture-group-index]
  const URL_RULES = [
    [/robinhood\.com\/(?:stocks|options)\/([A-Z]{1,5})(?:[/?#]|$)/i,              1],
    [/finance\.yahoo\.com\/quote\/([A-Z.]{1,6})(?:[/?#]|$)/i,                     1],
    [/marketwatch\.com\/investing\/stock\/([A-Z]{1,5})(?:[/?#]|$)/i,              1],
    [/seekingalpha\.com\/symbol\/([A-Z]{1,5})(?:[/?#]|$)/i,                       1],
    [/stockanalysis\.com\/stocks\/([A-Z]{1,5})(?:[/?#]|$)/i,                      1],
    [/finviz\.com\/quote\.ashx.*[?&]t=([A-Z]{1,5})(?:&|$)/i,                     1],
    [/google\.com\/finance\/quote\/([A-Z]{1,6}):/i,                               1],
    [/webull\.com\/(?:quote|us-stock-detail)\/([A-Z]{1,5})/i,                     1],
    [/tradingview\.com\/symbols\/[A-Z]+-([A-Z]{1,6})(?:[/?#]|$)/i,               1],
    [/schwab\.com\/research\/stocks\/details\/[a-z]+\/([A-Z]{1,5})(?:[/?#]|$)/i, 1],
    [/tdameritrade\.com\/tools\/ticker\/([A-Z]{1,5})(?:[/?#]|$)/i,               1],
    [/nasdaq\.com\/market-activity\/stocks\/([A-Z]{1,5})(?:[/?#]|$)/i,           1],
    [/fool\.com\/investing\/stock\/([A-Z]{1,5})(?:[/?#]|$)/i,                    1],
    [/bloomberg\.com\/quote\/([A-Z]{1,5}):/i,                                     1],
    [/cnbc\.com\/quotes\/([A-Z]{1,5})(?:[/?#]|$)/i,                              1],
    [/wsj\.com\/market-data\/stocks\/([A-Z]{1,5})(?:[/?#]|$)/i,                  1],
    [/barrons\.com\/quote\/stock\/[a-z]+\/([A-Z]{1,5})(?:[/?#]|$)/i,            1],
    [/zacks\.com\/stock\/quote\/([A-Z]{1,5})(?:[/?#]|$)/i,                       1],
    [/fidelity\.com\/.*[/?]([A-Z]{2,5})(?:[/?#]|$)/i,                            1],
  ];

  function tickerFromUrl(url) {
    for (const [re, g] of URL_RULES) {
      const m = url.match(re);
      if (m) {
        const t = m[g].toUpperCase().replace(/\./g, '');
        if (t.length >= 1 && t.length <= 5) return t;
      }
    }
    return null;
  }

  // DOM attribute/element selectors for when the URL alone isn't enough
  const DOM_ATTRS = ['data-symbol', 'data-ticker', 'data-test-id="symbol"'];
  const DOM_SELS  = [
    '[data-symbol]', '[data-ticker]',
    '[class*="tickerSymbol"]', '[class*="ticker-symbol"]',
    '[class*="StockSymbol"]',  '[class*="stock-symbol"]',
    'h1[class*="ticker"]',     'h1[class*="symbol"]',
  ];

  function tickerFromDom() {
    for (const sel of DOM_SELS) {
      try {
        const el = document.querySelector(sel);
        if (!el) continue;
        const raw = (el.dataset?.symbol || el.dataset?.ticker || el.textContent || '').trim();
        const t   = raw.toUpperCase().replace(/[^A-Z]/g, '');
        if (t.length >= 1 && t.length <= 5) return t;
      } catch (_) {}
    }
    // Title fallback: "AAPL – Apple Inc. | Nasdaq" or "(AAPL)"
    const m1 = document.title.match(/^\$?([A-Z]{2,5})\s*[-–|(:]/);
    if (m1) return m1[1];
    const m2 = document.title.match(/\(([A-Z]{2,5})\)/);
    if (m2) return m2[1];
    return null;
  }

  function detectTicker() {
    return tickerFromUrl(location.href) || tickerFromDom();
  }

  // ── 2. API ─────────────────────────────────────────────────────────────────

  async function fetchQuick(ticker) {
    const ac = new AbortController();
    const t  = setTimeout(() => ac.abort(), 7000);
    try {
      const r = await fetch(`${HOST}/api/stocks/quick/${ticker}`, { signal: ac.signal });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  // ── 3. Styles ──────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = `
      #${PANEL_ID} {
        all: initial !important;
        position: fixed !important;
        top: 60px !important;
        right: 0 !important;
        width: 320px !important;
        max-height: calc(100vh - 72px) !important;
        z-index: 2147483647 !important;
        display: flex !important;
        flex-direction: column !important;
        font-family: Inter,-apple-system,BlinkMacSystemFont,sans-serif !important;
        font-size: 13px !important;
        color: #e4ecff !important;
        background: rgba(4,9,24,0.97) !important;
        backdrop-filter: blur(28px) saturate(1.9) !important;
        -webkit-backdrop-filter: blur(28px) saturate(1.9) !important;
        border: 1px solid rgba(129,140,248,0.2) !important;
        border-right: none !important;
        border-radius: 14px 0 0 14px !important;
        box-shadow: -8px 0 48px rgba(0,0,0,0.7) !important;
        overflow: hidden !important;
        transform: translateX(110%) !important;
        opacity: 0 !important;
        transition: transform 0.32s cubic-bezier(0.34,1.15,0.7,1), opacity 0.2s ease, width 0.22s ease !important;
      }
      #${PANEL_ID}.bs-visible {
        transform: translateX(0) !important;
        opacity: 1 !important;
      }
      #${PANEL_ID}.bs-mini {
        width: 86px !important;
      }
      #${PANEL_ID} * { box-sizing: border-box !important; }
      @keyframes bs-spin { to { transform: rotate(360deg); } }
      .bs-spinning { animation: bs-spin 0.85s linear infinite !important; display: inline-block !important; }
    `;
    (document.head || document.documentElement).appendChild(el);
  }

  // ── 4. Panel Rendering ─────────────────────────────────────────────────────

  function css(obj) {
    return Object.entries(obj).map(([k, v]) => `${k}:${v}`).join(';');
  }

  const C = {
    Buy:  '#34d399',
    Sell: '#fb7185',
    Hold: '#fbbf24',
  };

  function header(ticker, showFull = true) {
    return `
      <div style="${css({ display:'flex', alignItems:'center', gap:'8px', padding:'11px 13px', borderBottom:'1px solid rgba(129,140,248,0.12)', background:'rgba(129,140,248,0.06)', flexShrink:'0' })}">
        <span style="font-size:15px">🫘</span>
        ${showFull ? `<span style="font-weight:800;font-size:13px;color:#e4ecff;flex:1">${ticker}</span>` : ''}
        <button id="bs-min"   style="${css({ all:'unset', cursor:'pointer', color:'#5a7093', fontSize:'16px', lineHeight:'1', padding:'2px 5px', borderRadius:'4px' })}" title="Minimize">−</button>
        <button id="bs-close" style="${css({ all:'unset', cursor:'pointer', color:'#5a7093', fontSize:'15px', lineHeight:'1', padding:'2px 5px', borderRadius:'4px' })}" title="Close">✕</button>
      </div>`;
  }

  function renderLoading(ticker) {
    const p = getPanel();
    p.innerHTML = `
      ${header(ticker)}
      <div style="${css({ padding:'36px 20px', textAlign:'center', flex:'1' })}">
        <span class="bs-spinning" style="font-size:32px">🫘</span>
        <div style="${css({ marginTop:'12px', fontSize:'12px', color:'#5a7093' })}">
          Fetching <strong style="color:#c4d4f0">${ticker}</strong>…
        </div>
      </div>`;
    wire(ticker);
    show(p);
  }

  function renderData(ticker, d) {
    const vc  = C[d.verdict] || '#fbbf24';
    const up  = d.change >= 0;
    const p   = getPanel();

    p.innerHTML = `
      ${header(ticker)}
      <div id="bs-body" style="${css({ overflowY:'auto', flex:'1', padding:'13px' })}">

        <div style="${css({ display:'flex', alignItems:'baseline', gap:'8px', marginBottom:'2px' })}">
          <span style="${css({ fontSize:'19px', fontWeight:'900', color:'#e4ecff' })}">${ticker}</span>
          <span style="${css({ fontSize:'17px', fontWeight:'700', color:'#c4d4f0' })}">$${d.price}</span>
        </div>
        <div style="${css({ fontSize:'11px', fontWeight:'700', color: up ? '#34d399' : '#fb7185', marginBottom:'13px' })}">
          ${up ? '▲' : '▼'} ${Math.abs(d.change).toFixed(2)}% today
        </div>

        <!-- Verdict badge -->
        <div style="${css({ textAlign:'center', background:vc+'18', border:`1px solid ${vc}45`, borderRadius:'10px', padding:'13px 8px', marginBottom:'13px' })}">
          <div style="${css({ fontSize:'26px', fontWeight:'900', color:vc, lineHeight:'1' })}">${d.verdict}</div>
          <div style="${css({ fontSize:'10px', color:'#5a7093', marginTop:'4px', fontWeight:'600' })}">${d.confidence}</div>
        </div>

        <!-- Advice -->
        <p style="${css({ fontSize:'11px', lineHeight:'1.65', color:'#6a8aaa', margin:'0 0 13px' })}">${d.advice}</p>

        <!-- Support / Resistance -->
        <div style="${css({ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'7px', marginBottom:'13px' })}">
          <div style="${css({ background:'rgba(52,211,153,.08)', border:'1px solid rgba(52,211,153,.22)', borderRadius:'8px', padding:'9px' })}">
            <div style="${css({ fontSize:'9px', color:'#34d399', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'3px', fontWeight:'700' })}">Support</div>
            <div style="${css({ fontSize:'14px', fontWeight:'800', color:'#e4ecff' })}">$${d.support}</div>
          </div>
          <div style="${css({ background:'rgba(251,113,133,.08)', border:'1px solid rgba(251,113,133,.22)', borderRadius:'8px', padding:'9px' })}">
            <div style="${css({ fontSize:'9px', color:'#fb7185', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'3px', fontWeight:'700' })}">Resistance</div>
            <div style="${css({ fontSize:'14px', fontWeight:'800', color:'#e4ecff' })}">$${d.resistance}</div>
          </div>
        </div>

        <!-- Details -->
        <div style="${css({ background:'rgba(8,16,42,.7)', border:'1px solid rgba(129,140,248,.1)', borderRadius:'8px', padding:'10px', marginBottom:'13px', fontSize:'11px' })}">
          ${d.technical ? `<div style="color:#5a7093;margin-bottom:4px">Technicals: <span style="color:#b4c4e0">${d.technical}</span></div>` : ''}
          ${d.pe        ? `<div style="color:#5a7093;margin-bottom:4px">Valuation: <span style="color:#b4c4e0">${d.pe}</span></div>` : ''}
          ${d.w52       ? `<div style="color:#5a7093;margin-bottom:4px">52W: <span style="color:#b4c4e0">${d.w52}</span></div>` : ''}
          ${d.dividend  ? `<div style="color:#5a7093">Dividend: <span style="color:#34d399">${d.dividend}</span></div>` : ''}
        </div>

        <!-- Open full -->
        <div style="text-align:center;margin-bottom:10px">
          <a href="http://localhost:3001/?quick=${ticker}" target="_blank"
             style="${css({ all:'unset', display:'inline-block', padding:'7px 16px', background:'linear-gradient(135deg,#818cf8,#22d3ee)', borderRadius:'7px', fontSize:'11px', fontWeight:'700', color:'#fff', cursor:'pointer' })}">
            Full analysis →
          </a>
        </div>
        <div style="${css({ textAlign:'center', fontSize:'9px', color:'#2a3d56' })}">Not financial advice · BeanStock</div>
      </div>`;

    wire(ticker);
    show(p);
  }

  function renderError(ticker, retry) {
    const p = getPanel();
    p.innerHTML = `
      ${header(ticker)}
      <div style="${css({ padding:'28px 18px', textAlign:'center', flex:'1' })}">
        <div style="font-size:28px;margin-bottom:10px">⚠️</div>
        <div style="${css({ color:'#fb7185', fontSize:'13px', fontWeight:'600', marginBottom:'8px' })}">BeanStock not reachable</div>
        <div style="${css({ color:'#3a5069', fontSize:'11px', lineHeight:'1.7', marginBottom:'14px' })}">
          Start the server:<br>
          <code style="${css({ color:'#818cf8', background:'rgba(129,140,248,.1)', padding:'2px 6px', borderRadius:'4px', fontSize:'11px' })}">node server/index.js</code>
        </div>
        <button id="bs-retry" style="${css({ all:'unset', cursor:'pointer', display:'inline-block', padding:'7px 14px', background:'rgba(129,140,248,.14)', border:'1px solid rgba(129,140,248,.25)', borderRadius:'8px', fontSize:'12px', fontWeight:'600', color:'#818cf8' })}">
          Retry
        </button>
      </div>`;
    wire(ticker);
    document.getElementById('bs-retry')?.addEventListener('click', retry);
    show(p);
  }

  // ── 5. Panel Lifecycle ─────────────────────────────────────────────────────

  function getPanel() {
    let el = document.getElementById(PANEL_ID);
    if (!el) {
      injectStyles();
      el = document.createElement('div');
      el.id = PANEL_ID;
      document.documentElement.appendChild(el);
      panelEl = el;
    }
    return el;
  }

  function show(p) {
    requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('bs-visible')));
  }

  function hidePanel() {
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    p.classList.remove('bs-visible');
    setTimeout(() => p.remove(), 320);
    panelEl = null; activeTicker = null; minimized = false;
  }

  function wire(ticker) {
    document.getElementById('bs-close')?.addEventListener('click', hidePanel);
    document.getElementById('bs-min')?.addEventListener('click', () => {
      minimized = !minimized;
      const p   = document.getElementById(PANEL_ID);
      const body = document.getElementById('bs-body');
      const btn  = document.getElementById('bs-min');
      if (!p) return;
      p.classList.toggle('bs-mini', minimized);
      if (body) body.style.display = minimized ? 'none' : '';
      if (btn)  btn.textContent    = minimized ? '+' : '−';
    });
  }

  // ── 6. Main Analyze Flow ───────────────────────────────────────────────────

  async function analyze(ticker, force = false) {
    if (!force && ticker === activeTicker && document.getElementById(PANEL_ID)) return;
    activeTicker = ticker;
    minimized    = false;

    renderLoading(ticker);
    try {
      const data = await fetchQuick(ticker);
      if (activeTicker !== ticker) return;
      renderData(ticker, data);
    } catch {
      if (activeTicker !== ticker) return;
      renderError(ticker, () => analyze(ticker, true));
    }
  }

  // ── 7. SPA Navigation ─────────────────────────────────────────────────────

  function onNav() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    clearTimeout(navDebounce);
    navDebounce = setTimeout(() => {
      const t = detectTicker();
      if (t && t !== activeTicker)       analyze(t);
      else if (!t && activeTicker)       hidePanel();
    }, 700);
  }

  // Patch SPA history methods
  const _push    = history.pushState.bind(history);
  const _replace = history.replaceState.bind(history);
  history.pushState    = (...a) => { _push(...a);    onNav(); };
  history.replaceState = (...a) => { _replace(...a); onNav(); };
  window.addEventListener('popstate', onNav);

  // MutationObserver covers sites that mutate without history events
  new MutationObserver(onNav).observe(document.body || document.documentElement, {
    childList: true, subtree: true,
  });

  // ── 8. Extension Popup Messages ────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _, reply) => {
    if (msg.type === 'GET_TICKER')      reply({ ticker: detectTicker() });
    if (msg.type === 'ANALYZE')         analyze(msg.ticker.toUpperCase().replace(/[^A-Z]/g, ''), true);
    if (msg.type === 'CLOSE')           hidePanel();
    return true;
  });

  // ── 9. Boot ────────────────────────────────────────────────────────────────

  const boot = () => { const t = detectTicker(); if (t) analyze(t); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 600));
  } else {
    setTimeout(boot, 600);
  }
})();

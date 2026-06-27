/**
 * BeanStock Extension + Agent — Content Script
 *
 * Runs on every page (<all_urls>).
 *
 * TWO MODES:
 *   Finance-site mode  — recognised trading/finance domains.
 *                        Panel appears automatically on navigation.
 *   Universal mode     — any other website.
 *                        Scans for $TICKER mentions and makes them clickable.
 *                        Selection listener: highlight any ticker text → "Analyze?" bubble.
 *                        Context-menu: right-click any text → "Analyze with BeanStock".
 *
 * AGENT PANEL:
 *   Verdict + agent reasoning · support / resistance bar · async peer chips · news feed
 */
(function bsAgent() {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────

  const HOST     = 'http://localhost:3001';
  const PANEL_ID = 'bs-agent-panel';
  const STYLE_ID = 'bs-agent-styles';
  const WRAP_CLS = 'bs-tick';       // class on $TICKER spans

  const FINANCE_HOSTS = new Set([
    'robinhood.com', 'webull.com', 'finance.yahoo.com', 'marketwatch.com',
    'seekingalpha.com', 'tradingview.com', 'finviz.com', 'stockanalysis.com',
    'fidelity.com', 'schwab.com', 'tdameritrade.com', 'wsj.com',
    'bloomberg.com', 'cnbc.com', 'nasdaq.com', 'fool.com',
    'barrons.com', 'zacks.com', 'google.com',
  ]);

  const host          = location.hostname.replace(/^www\./, '');
  const isFinanceSite = FINANCE_HOSTS.has(host) || [...FINANCE_HOSTS].some(h => host.endsWith('.' + h));

  // ─── State ──────────────────────────────────────────────────────────────────

  let activeTicker = null;
  let minimized    = false;
  let lastHref     = location.href;
  let navTimer     = null;
  let selBubble    = null;
  let selTimer     = null;

  // ─── 1. URL-based ticker detection ─────────────────────────────────────────

  const URL_RULES = [
    [/robinhood\.com\/(?:stocks|options)\/([A-Z]{1,6})(?:[/?#]|$)/i,              1],
    [/finance\.yahoo\.com\/quote\/([A-Z.]{1,6})(?:[/?#]|$)/i,                     1],
    [/marketwatch\.com\/investing\/stock\/([A-Z]{1,5})(?:[/?#]|$)/i,              1],
    [/seekingalpha\.com\/symbol\/([A-Z]{1,5})(?:[/?#]|$)/i,                       1],
    [/stockanalysis\.com\/stocks\/([A-Z]{1,5})(?:[/?#]|$)/i,                      1],
    [/finviz\.com\/quote\.ashx.*[?&]t=([A-Z]{1,5})(?:&|$)/i,                     1],
    [/google\.com\/finance\/quote\/([A-Z.]{1,6}):/i,                              1],
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

  const DOM_SELS = [
    '[data-symbol]','[data-ticker]','[data-testid="symbol"]',
    '[class*="tickerSymbol"]','[class*="ticker-symbol"]','[class*="StockSymbol"]',
    'h1[class*="ticker"]','h1[class*="symbol"]',
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
    const m1 = document.title.match(/^\$?([A-Z]{2,5})\s*[-–|(:]/);
    if (m1) return m1[1];
    const m2 = document.title.match(/\(([A-Z]{2,5})\)/);
    if (m2) return m2[1];
    return null;
  }

  function detectTicker() {
    return tickerFromUrl(location.href) || tickerFromDom();
  }

  // ─── 2. Network ─────────────────────────────────────────────────────────────

  async function api(path, timeout = 8000) {
    const ac = new AbortController();
    const t  = setTimeout(() => ac.abort(), timeout);
    try {
      const r = await fetch(HOST + path, { signal: ac.signal });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  // ─── 3. Session history (chrome.storage.session) ────────────────────────────

  async function pushHistory(ticker, verdict) {
    try {
      const { bsHistory = [] } = await chrome.storage.session.get('bsHistory');
      const next = [{ ticker, verdict, time: Date.now() },
                    ...bsHistory.filter(h => h.ticker !== ticker)].slice(0, 12);
      await chrome.storage.session.set({ bsHistory: next });
    } catch (_) {}
  }

  // ─── 4. Styles ──────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      @keyframes bs-in   { from{opacity:0;transform:translateX(100%)} to{opacity:1;transform:translateX(0)} }
      @keyframes bs-spin  { to{transform:rotate(360deg)} }
      @keyframes bs-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

      #${PANEL_ID} {
        all:initial!important;
        position:fixed!important; top:0!important; right:0!important;
        width:334px!important; max-height:100vh!important;
        display:flex!important; flex-direction:column!important;
        font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif!important;
        font-size:13px!important; color:#E8D870!important;
        background:#191200!important;
        border-left:1px solid rgba(185,140,20,0.35)!important;
        border-radius:0!important;
        box-shadow:-4px 0 32px rgba(0,0,0,0.6)!important;
        z-index:2147483647!important; overflow:hidden!important;
        animation:bs-in 0.28s ease both!important;
        transition:width 0.24s ease,opacity 0.2s ease!important;
      }
      #${PANEL_ID}.bs-mini { width:100px!important; }
      #${PANEL_ID} * { box-sizing:border-box!important; font-family:inherit!important; }

      /* $TICKER highlights on non-finance pages */
      .${WRAP_CLS} {
        color:#C8F000!important; cursor:pointer!important;
        border-bottom:1px dotted rgba(200,240,0,0.5)!important;
        border-radius:2px!important;
        transition:background 0.12s!important;
      }
      .${WRAP_CLS}:hover { background:rgba(200,240,0,0.10)!important; }

      /* Selection bubble */
      #bs-sel-bubble {
        all:initial!important;
        position:fixed!important; z-index:2147483646!important;
        background:#191200!important;
        border:1px solid rgba(200,240,0,0.35)!important; border-radius:3px!important;
        padding:7px 13px!important; font-size:12px!important; font-weight:700!important;
        color:#C8F000!important; cursor:pointer!important;
        box-shadow:0 4px 20px rgba(0,0,0,0.5)!important;
        font-family:Inter,-apple-system,sans-serif!important;
        white-space:nowrap!important;
        animation:bs-in 0.18s ease both!important;
        transition:opacity 0.15s!important;
      }
      #bs-sel-bubble:hover { background:rgba(26,20,0,0.98)!important; }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  // ─── 5. Panel helpers ────────────────────────────────────────────────────────

  function getPanel() {
    let el = document.getElementById(PANEL_ID);
    if (!el) {
      injectStyles();
      el = document.createElement('div');
      el.id = PANEL_ID;
      document.documentElement.appendChild(el);
    }
    return el;
  }

  function hidePanel() {
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    p.style.opacity = '0';
    p.style.transform = 'translateX(110%)';
    p.style.transition = 'opacity 0.2s ease, transform 0.26s ease';
    setTimeout(() => p.remove(), 280);
    activeTicker = null; minimized = false;
  }

  const VC = { Buy:'#C8F000', Sell:'#FF3300', Hold:'rgba(185,140,20,0.8)' };

  function hdl(ticker) {
    return `<div style="all:unset;display:flex;align-items:center;gap:8px;padding:11px 14px;
      border-bottom:1px solid rgba(185,140,20,0.20);background:#111000;flex-shrink:0">
      <span style="font-size:13px">🫘</span>
      <span style="font-weight:800;font-size:11px;color:#C8F000;flex:1;letter-spacing:2px;text-transform:uppercase;font-family:'Space Grotesk',Inter,sans-serif">BEANSTOCK</span>
      <button id="bs-min"   style="all:unset;cursor:pointer;color:#5A4A1A;font-size:16px;padding:1px 5px;border-radius:2px;line-height:1" title="Minimize">−</button>
      <button id="bs-close" style="all:unset;cursor:pointer;color:#5A4A1A;font-size:14px;padding:1px 5px;border-radius:2px;line-height:1" title="Close">✕</button>
    </div>`;
  }

  function wireButtons(ticker) {
    document.getElementById('bs-close')?.addEventListener('click', hidePanel);
    document.getElementById('bs-min')?.addEventListener('click', () => {
      minimized = !minimized;
      const p    = document.getElementById(PANEL_ID);
      const body = document.getElementById('bs-body');
      const btn  = document.getElementById('bs-min');
      if (!p) return;
      p.classList.toggle('bs-mini', minimized);
      if (body) body.style.display = minimized ? 'none' : '';
      if (btn)  btn.textContent    = minimized ? '+' : '−';
    });
    document.querySelectorAll('.bs-peer-chip').forEach(chip => {
      chip.addEventListener('click', () => analyze(chip.dataset.ticker, true));
    });
  }

  // ─── 6. Render states ───────────────────────────────────────────────────────

  function renderLoading(ticker) {
    const p = getPanel();
    p.innerHTML = hdl(ticker) + `
      <div id="bs-body" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:36px 20px;gap:12px">
        <span style="font-size:36px;display:inline-block;animation:bs-spin 0.85s linear infinite;filter:hue-rotate(60deg) saturate(2)">🫘</span>
        <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#5A4A1A">Analyzing <strong style="color:#C8F000">${ticker}</strong>…</div>
      </div>`;
    wireButtons(ticker);
  }

  function renderError(ticker) {
    const p = getPanel();
    p.innerHTML = hdl(ticker) + `
      <div id="bs-body" style="flex:1;padding:28px 18px;text-align:center">
        <div style="font-size:26px;margin-bottom:10px">⚠️</div>
        <div style="color:#FF3300;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Can't reach BeanStock</div>
        <div style="color:#5A4A1A;font-size:11px;line-height:1.7;margin-bottom:14px">
          Start the server in your terminal:<br>
          <code style="color:#C8F000;background:rgba(200,240,0,0.08);padding:2px 7px;border-radius:2px">node server/index.js</code>
        </div>
        <button id="bs-retry" style="all:unset;cursor:pointer;display:inline-block;padding:7px 16px;
          background:rgba(200,240,0,0.10);border:1px solid rgba(200,240,0,0.30);
          border-radius:2px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#C8F000">Retry</button>
      </div>`;
    wireButtons(ticker);
    document.getElementById('bs-retry')?.addEventListener('click', () => analyze(ticker, true));
  }

  function renderData(ticker, d) {
    const vc  = VC[d.verdict] || '#fbbf24';
    const up  = d.change >= 0;
    const p   = getPanel();

    // Support / resistance position bar (0–100%)
    const sup = parseFloat(d.support), res = parseFloat(d.resistance), cur = parseFloat(d.price);
    const pct = sup < res ? Math.max(0, Math.min(100, ((cur - sup) / (res - sup)) * 100)) : 50;

    // News items
    const newsHtml = (d.news || []).map(n => `
      <a href="${n.url || '#'}" target="_blank" rel="noopener" style="all:unset;display:block;cursor:pointer;
        padding:7px 0;border-bottom:1px solid rgba(185,140,20,0.12)">
        <div style="font-size:11px;color:#E8D870;line-height:1.5;margin-bottom:2px">
          ${(n.headline || '').slice(0, 80)}${(n.headline || '').length > 80 ? '…' : ''}
        </div>
        <div style="font-size:10px;color:#5A4A1A">
          ${n.source ? n.source + ' · ' : ''}${n.time ? timeAgo(n.time) : ''}
        </div>
      </a>`).join('') || '<div style="font-size:11px;color:#5A4A1A">No recent news</div>';

    // Peers placeholder — will be replaced async
    const peersPlaceholder = (d.peers || []).length
      ? `<div id="bs-peers-wrap" style="margin-top:6px">
           <div style="font-size:10px;color:#5A4A1A;animation:bs-pulse 1.2s infinite">Fetching peer data…</div>
         </div>`
      : `<div id="bs-peers-wrap" style="font-size:11px;color:#5A4A1A;margin-top:4px">No peer data</div>`;

    p.innerHTML = hdl(ticker) + `
      <div id="bs-body" style="overflow-y:auto;flex:1;padding:13px">

        <!-- Price row -->
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px">
          <span style="font-size:20px;font-weight:900;color:#E8D870;font-family:'JetBrains Mono',monospace">${ticker}</span>
          <span style="font-size:17px;font-weight:700;color:#9A8440;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums">$${d.price}</span>
          <span style="font-size:11px;font-weight:700;color:${up ? '#C8F000' : '#FF3300'};margin-left:auto;font-family:'JetBrains Mono',monospace">
            ${up ? '▲' : '▼'} ${Math.abs(d.change).toFixed(2)}%
          </span>
        </div>

        <!-- Verdict -->
        <div style="background:${vc === '#C8F000' ? 'rgba(200,240,0,0.08)' : vc === '#FF3300' ? 'rgba(255,51,0,0.08)' : 'rgba(185,140,20,0.08)'};
          border:1px solid ${vc === '#C8F000' ? 'rgba(200,240,0,0.35)' : vc === '#FF3300' ? 'rgba(255,51,0,0.35)' : 'rgba(185,140,20,0.35)'};
          border-radius:3px;padding:13px 10px;text-align:center;margin:10px 0">
          <div style="font-size:22px;font-weight:900;color:${vc};letter-spacing:2px;text-transform:uppercase;font-family:'Space Grotesk',Inter,sans-serif">${d.verdict}</div>
          <div style="font-size:10px;color:#5A4A1A;margin-top:3px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">${d.confidence}</div>
        </div>

        <!-- Agent reasoning -->
        <p style="font-size:11px;line-height:1.68;color:#9A8440;margin:0 0 12px;font-style:italic">
          ${d.agentReason || d.advice || ''}
        </p>

        <!-- Support / Resistance bar -->
        <div style="margin-bottom:13px">
          <div style="display:flex;justify-content:space-between;font-size:9px;font-weight:700;
            text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px">
            <span style="color:#C8F000">Support $${d.support}</span>
            <span style="color:#FF3300">Resistance $${d.resistance}</span>
          </div>
          <div style="height:4px;background:rgba(185,140,20,0.12);border-radius:2px;position:relative;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#C8F000,#E8A000);border-radius:2px;transition:width 0.6s ease"></div>
          </div>
          <div style="font-size:9px;color:#5A4A1A;margin-top:3px;text-align:center;font-family:'JetBrains Mono',monospace">
            $${d.price} · ${pct.toFixed(0)}% between zones
          </div>
        </div>

        <!-- Peer comparison -->
        <div style="border-top:1px solid rgba(185,140,20,0.18);padding-top:11px;margin-bottom:11px">
          <div style="font-size:9px;color:#5A4A1A;text-transform:uppercase;letter-spacing:2px;
            font-weight:700;margin-bottom:7px">Sector Peers</div>
          ${peersPlaceholder}
        </div>

        <!-- News -->
        <div style="border-top:1px solid rgba(185,140,20,0.18);padding-top:11px;margin-bottom:11px">
          <div style="font-size:9px;color:#5A4A1A;text-transform:uppercase;letter-spacing:2px;
            font-weight:700;margin-bottom:7px">Recent News</div>
          ${newsHtml}
        </div>

        <!-- Detail row -->
        <div style="background:rgba(26,20,0,0.6);border:1px solid rgba(185,140,20,0.15);
          border-radius:3px;padding:10px;font-size:11px;margin-bottom:13px">
          ${d.technical ? `<div style="color:#5A4A1A;margin-bottom:4px">Technicals: <span style="color:#E8D870">${d.technical}</span></div>` : ''}
          ${d.pe        ? `<div style="color:#5A4A1A;margin-bottom:4px">Valuation: <span style="color:#E8D870">${d.pe}</span></div>` : ''}
          ${d.w52       ? `<div style="color:#5A4A1A;margin-bottom:4px">52W range: <span style="color:#E8D870">${d.w52}</span></div>` : ''}
          ${d.dividend  ? `<div style="color:#5A4A1A">Dividend: <span style="color:#C8F000">${d.dividend}</span></div>` : ''}
        </div>

        <!-- Footer -->
        <div style="text-align:center;margin-bottom:10px">
          <a href="${HOST}/?quick=${ticker}" target="_blank"
             style="all:unset;display:inline-block;padding:8px 18px;
             background:#C8F000;border-radius:3px;
             font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#191200;cursor:pointer">
            Full Analysis →
          </a>
        </div>
        <div style="text-align:center;font-size:9px;color:#3A2D00;letter-spacing:0.5px">
          Not financial advice · BeanStock Agent
        </div>
      </div>`;

    wireButtons(ticker);

    // Async: fetch peer verdicts and inject chips
    if (d.peers?.length) loadPeers(d.peers.slice(0, 4), ticker);
  }

  // Fetch peer verdicts, then inject coloured chips
  async function loadPeers(peers, excludeTicker) {
    const wrap = document.getElementById('bs-peers-wrap');
    if (!wrap) return;
    try {
      const results = await api(`/api/stocks/compare?tickers=${peers.join(',')}`);
      if (!document.getElementById('bs-peers-wrap')) return; // panel was closed

      const chips = results
        .filter(r => !r.error && r.ticker !== excludeTicker)
        .map(r => {
          const c = VC[r.verdict] || 'rgba(185,140,20,0.8)';
          const chg = r.change >= 0;
          return `<span class="bs-peer-chip" data-ticker="${r.ticker}"
            style="all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:4px;
            padding:3px 8px;border-radius:2px;font-size:10px;font-weight:700;letter-spacing:0.5px;
            background:${c === '#C8F000' ? 'rgba(200,240,0,0.10)' : c === '#FF3300' ? 'rgba(255,51,0,0.10)' : 'rgba(185,140,20,0.08)'};
            border:1px solid ${c === '#C8F000' ? 'rgba(200,240,0,0.30)' : c === '#FF3300' ? 'rgba(255,51,0,0.30)' : 'rgba(185,140,20,0.30)'};
            color:${c};margin:0 4px 4px 0;font-family:'JetBrains Mono',monospace">
            ${r.ticker}
            <span style="font-size:8px;opacity:0.75">${r.verdict}</span>
            <span style="font-size:9px;color:${chg ? '#C8F000' : '#FF3300'}">${chg ? '▲' : '▼'}${Math.abs(r.change).toFixed(1)}%</span>
          </span>`;
        }).join('');

      wrap.innerHTML = chips || '<div style="font-size:11px;color:#5A4A1A">No peer data</div>';
      wrap.querySelectorAll('.bs-peer-chip').forEach(chip => {
        chip.addEventListener('click', () => analyze(chip.dataset.ticker, true));
      });
    } catch (_) {
      const wrap2 = document.getElementById('bs-peers-wrap');
      if (wrap2) wrap2.innerHTML = '<div style="font-size:11px;color:#5A4A1A">Peer data unavailable</div>';
    }
  }

  // ─── 7. Main analyze flow ────────────────────────────────────────────────────

  async function analyze(ticker, force = false) {
    if (!force && ticker === activeTicker && document.getElementById(PANEL_ID)) return;
    activeTicker = ticker; minimized = false;
    renderLoading(ticker);
    try {
      const data = await api(`/api/stocks/quick/${ticker}`);
      if (activeTicker !== ticker) return;
      renderData(ticker, data);
      pushHistory(ticker, data.verdict);
    } catch (_) {
      if (activeTicker !== ticker) return;
      renderError(ticker);
    }
  }

  // ─── 8. Selection bubble (any page) ─────────────────────────────────────────

  function clearSelBubble() {
    clearTimeout(selTimer);
    selBubble?.remove(); selBubble = null;
  }

  function showSelBubble(ticker, x, y) {
    clearSelBubble();
    injectStyles();
    const el = document.createElement('div');
    el.id = 'bs-sel-bubble';
    el.textContent = `🫘 Analyze ${ticker} →`;
    el.style.cssText = `left:${Math.min(x + 8, window.innerWidth - 180)}px;top:${Math.max(y - 42, 8)}px`;
    el.addEventListener('click', () => { clearSelBubble(); analyze(ticker, true); });
    document.documentElement.appendChild(el);
    selBubble = el;
    selTimer = setTimeout(clearSelBubble, 3500);
  }

  function setupSelectionListener() {
    document.addEventListener('mouseup', (e) => {
      // Don't trigger inside our own panel or bubble
      if (e.target.closest?.(`#${PANEL_ID}, #bs-sel-bubble`)) return;
      const raw = window.getSelection?.()?.toString().trim() || '';
      const t   = raw.toUpperCase().replace(/^\$/, '').replace(/[^A-Z]/g, '');
      if (/^[A-Z]{2,5}$/.test(t)) {
        showSelBubble(t, e.clientX, e.clientY);
      } else {
        clearSelBubble();
      }
    });
    // Dismiss on next click outside
    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest?.('#bs-sel-bubble')) clearSelBubble();
    });
  }

  // ─── 9. Universal $TICKER scanning ─────────────────────────────────────────

  const SKIP_TAGS = new Set(['SCRIPT','STYLE','INPUT','TEXTAREA','SELECT','CODE','PRE','NOSCRIPT','IFRAME']);
  const TICK_RE   = /\$([A-Z]{2,5})\b/g;

  function wrapTextNode(node) {
    const text = node.textContent;
    if (!TICK_RE.test(text)) return;
    TICK_RE.lastIndex = 0;

    const parent = node.parentNode;
    if (!parent || SKIP_TAGS.has(parent.tagName) || parent.classList?.contains(WRAP_CLS)) return;

    const frag = document.createDocumentFragment();
    let last = 0, m;
    TICK_RE.lastIndex = 0;
    while ((m = TICK_RE.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const sp = document.createElement('span');
      sp.className      = WRAP_CLS;
      sp.dataset.ticker = m[1];
      sp.textContent    = m[0];
      sp.title          = `Click to analyze ${m[1]} with BeanStock`;
      sp.addEventListener('click', (ev) => {
        ev.stopPropagation();
        analyze(m[1], true);
      });
      frag.appendChild(sp);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    parent.replaceChild(frag, node);
  }

  function scanSubtree(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentNode;
        if (!p || SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.classList?.contains(WRAP_CLS)) return NodeFilter.FILTER_REJECT;
        return node.textContent.includes('$') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(wrapTextNode);
  }

  function setupUniversalMode() {
    // Initial scan
    scanSubtree(document.body);

    // Watch for new content (Reddit, Twitter, feeds)
    let mutTimer = null;
    const obs = new MutationObserver((mutations) => {
      clearTimeout(mutTimer);
      mutTimer = setTimeout(() => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) scanSubtree(node);
          }
        }
      }, 500);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // ─── 10. SPA navigation watcher ─────────────────────────────────────────────

  function onNav() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    clearTimeout(navTimer);
    navTimer = setTimeout(() => {
      const t = detectTicker();
      if (t && t !== activeTicker)  analyze(t);
      else if (!t && activeTicker)  hidePanel();
    }, 650);
  }

  const _push    = history.pushState.bind(history);
  const _replace = history.replaceState.bind(history);
  history.pushState    = (...a) => { _push(...a);    onNav(); };
  history.replaceState = (...a) => { _replace(...a); onNav(); };
  window.addEventListener('popstate', onNav);
  new MutationObserver(onNav).observe(document.documentElement, { childList: true, subtree: false });

  // ─── 11. Message listener (from popup + background context menu) ─────────────

  chrome.runtime.onMessage.addListener((msg, _, reply) => {
    if (msg.type === 'GET_TICKER')  { reply({ ticker: detectTicker() }); return true; }
    if (msg.type === 'ANALYZE')     { analyze(msg.ticker.toUpperCase().replace(/[^A-Z]/g, ''), true); reply({ ok: true }); return true; }
    if (msg.type === 'CLOSE')       { hidePanel(); reply({ ok: true }); return true; }
    return false;
  });

  // ─── 12. Utilities ───────────────────────────────────────────────────────────

  function timeAgo(ts) {
    const s = Math.floor(Date.now() / 1000) - ts;
    if (s < 3600)  return Math.floor(s / 60)    + 'm ago';
    if (s < 86400) return Math.floor(s / 3600)  + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  // ─── 13. Boot ────────────────────────────────────────────────────────────────

  function boot() {
    if (isFinanceSite) {
      // Finance site: auto-detect + auto-show
      const t = detectTicker();
      if (t) analyze(t);
      // SPA nav already wired above
    } else {
      // Universal mode: scan $TICKER text, listen for selection
      setupUniversalMode();
      setupSelectionListener();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 700));
  } else {
    setTimeout(boot, 700);
  }
})();

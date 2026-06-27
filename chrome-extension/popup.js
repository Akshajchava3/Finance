/**
 * BeanStock Extension + Agent — Popup
 * Adds: session history chips above the manual search field.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const statusBar = document.getElementById('statusBar');
  const dot       = document.getElementById('dot');
  const statusTxt = document.getElementById('statusTxt');
  const autoBox   = document.getElementById('autoBox');
  const autoBtn   = document.getElementById('autoBtn');
  const autoSpan  = document.getElementById('autoTicker');
  const divEl     = document.getElementById('div');
  const inp       = document.getElementById('inp');
  const goBtn     = document.getElementById('goBtn');
  const histWrap  = document.getElementById('histWrap');
  const histList  = document.getElementById('histList');

  // ── Server status ────────────────────────────────────────────────────────────
  async function checkServer() {
    try {
      const r = await fetch('http://localhost:3001/api/status', {
        signal: AbortSignal.timeout(3000),
      });
      if (!r.ok) throw new Error();
      dot.className    = 'dot ok';
      statusBar.className = 'status ok';
      statusTxt.textContent = 'BeanStock connected';
    } catch {
      dot.className    = 'dot err';
      statusBar.className = 'status err';
      statusTxt.textContent = 'Server not running — start on port 3001';
    }
  }

  // ── Get auto-detected ticker from active tab's content script ─────────────
  async function getDetected() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab) return resolve(null);
        chrome.tabs.sendMessage(tab.id, { type: 'GET_TICKER' }, (r) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(r?.ticker || null);
        });
      });
    });
  }

  // ── Send analyze command to content script ────────────────────────────────
  function sendAnalyze(ticker) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) return;
      chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE', ticker }, (r) => {
        if (chrome.runtime.lastError || !r?.ok) {
          chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }, () => {
            chrome.runtime.lastError; // clear error
            setTimeout(() => chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE', ticker }), 300);
          });
        }
      });
    });
    window.close();
  }

  function runManual() {
    const t = inp.value.trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (!t) { inp.focus(); return; }
    sendAnalyze(t);
  }

  // ── Session history ───────────────────────────────────────────────────────
  const VC = { Buy:  { bg: '#C8F000', bd: '#C8F000', cl: '#191200' },
               Sell: { bg: '#FF3300', bd: '#FF3300', cl: '#ffffff' },
               Hold: { bg: 'transparent', bd: 'rgba(185,140,20,0.45)', cl: '#9A8440' } };

  function timeAgo(ts) {
    const s = Math.floor(Date.now() / 1000) - Math.floor(ts / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return Math.floor(s / 60)   + 'm';
    if (s < 86400) return Math.floor(s / 3600)  + 'h';
    return Math.floor(s / 86400) + 'd';
  }

  async function loadHistory() {
    try {
      const { bsHistory = [] } = await chrome.storage.session.get('bsHistory');
      if (!bsHistory.length) return;

      histList.innerHTML = '';
      bsHistory.slice(0, 8).forEach(({ ticker, verdict, time }) => {
        const c   = VC[verdict] || VC.Hold;
        const el  = document.createElement('div');
        el.className = 'hist-chip';
        el.style.cssText = `background:${c.bg};border-color:${c.bd};color:${c.cl}`;
        el.innerHTML = `${ticker} <span class="hc-time">${timeAgo(time)}</span>`;
        el.title     = `Re-analyze ${ticker}`;
        el.addEventListener('click', () => sendAnalyze(ticker));
        histList.appendChild(el);
      });

      histWrap.classList.add('show');
    } catch (_) {}
  }

  // ── Wire events ──────────────────────────────────────────────────────────
  goBtn.addEventListener('click', runManual);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') runManual(); });

  // ── Boot (parallel) ───────────────────────────────────────────────────────
  const [, detected] = await Promise.all([
    checkServer(),
    getDetected(),
    loadHistory(),
  ]);

  if (detected) {
    autoSpan.textContent = detected;
    autoBox.classList.add('show');
    divEl.classList.add('show');
    autoBtn.addEventListener('click', () => sendAnalyze(detected));
  }

  inp.focus();
});

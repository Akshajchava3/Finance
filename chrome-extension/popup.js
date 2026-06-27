/**
 * BeanStock Extension — Popup
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

  // ── Server status ──────────────────────────────────────────────────────────
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

  // ── Get auto-detected ticker from the active tab's content script ──────────
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

  // ── Send analyze command to content script ─────────────────────────────────
  function sendAnalyze(ticker) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) return;
      // Try sending; if content script isn't loaded, inject it first
      chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE', ticker }, (r) => {
        if (chrome.runtime.lastError) {
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

  // ── Wire events ────────────────────────────────────────────────────────────
  goBtn.addEventListener('click', runManual);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') runManual(); });

  // ── Boot (parallel) ────────────────────────────────────────────────────────
  const [, detected] = await Promise.all([checkServer(), getDetected()]);

  if (detected) {
    autoSpan.textContent = detected;
    autoBox.classList.add('show');
    divEl.classList.add('show');
    autoBtn.addEventListener('click', () => sendAnalyze(detected));
  }

  inp.focus();
});

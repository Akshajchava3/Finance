/**
 * BeanStock Extension + Agent — Service Worker
 * Handles: context menu (right-click any selected ticker text)
 */

const TICK_RE = /^\$?([A-Z]{2,5})$/;

// ─── Context menu ──────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id:       'bs-analyze',
    title:    '🫘 Analyze "%s" with BeanStock',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'bs-analyze') return;
  const raw    = (info.selectionText || '').trim();
  const m      = raw.toUpperCase().replace(/[^A-Z$]/g, '').match(TICK_RE);
  const ticker = m ? m[1] : null;
  if (!ticker || !tab?.id) return;

  // Try sending to content script; if it's not loaded, inject it first then retry
  chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE', ticker }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ['content.js'] },
        () => {
          if (chrome.runtime.lastError) return; // page may not allow scripting
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE', ticker });
          }, 350);
        }
      );
    }
  });
});

// Keep service worker alive for incoming messages
chrome.runtime.onMessage.addListener(() => true);

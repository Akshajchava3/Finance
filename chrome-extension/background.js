// BeanStock — service worker (minimal; keeps MV3 extension alive)
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.log('🫘 BeanStock Quick Analysis installed. Make sure the server is running on port 3001.');
  }
});

chrome.runtime.onMessage.addListener(() => true);

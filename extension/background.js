/* Minimal service worker. The heavy lifting happens in the content script —
 * the Prompt API needs a DOM context, which a worker doesn't have. */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// Content scripts in MV3 honor page-CORS, so we fetch images from the service
// worker (which has host_permissions: <all_urls>) and shuttle back a data URL.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action !== 'fetchImage' || !msg.url) return;
  (async () => {
    try {
      const res = await fetch(msg.url, { credentials: 'omit' });
      if (!res.ok) { sendResponse({ ok: false }); return; }
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) { sendResponse({ ok: false }); return; }
      const reader = new FileReader();
      reader.onload = () => sendResponse({ ok: true, dataURL: reader.result });
      reader.onerror = () => sendResponse({ ok: false });
      reader.readAsDataURL(blob);
    } catch {
      sendResponse({ ok: false });
    }
  })();
  return true; // keep the message channel open for the async response
});

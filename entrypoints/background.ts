/// <reference path="../.wxt/wxt.d.ts" />

// Minimal service worker. The heavy lifting happens in the content script —
// the Prompt API needs a DOM context, which a worker doesn't have.

interface FetchImageMessage {
  action: 'fetchImage';
  url: string;
}

interface FetchImageResponse {
  ok: boolean;
  dataURL?: string | ArrayBuffer | null;
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
    if (details.reason === 'install') {
      chrome.runtime.openOptionsPage();
    }
  });

  // Open the options page when the content script requests it.
  chrome.runtime.onMessage.addListener(
    (msg: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (r: { ok: boolean }) => void): boolean => {
      const message = msg as { action?: string } | null;
      if (message?.action !== 'openOptions') return false;
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return false; // synchronous response — no need to keep the channel open
    },
  );

  // Content scripts in MV3 honor page-CORS, so we fetch images from the service
  // worker (which has host_permissions: <all_urls>) and shuttle back a data URL.
  chrome.runtime.onMessage.addListener(
    (msg: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (r: FetchImageResponse) => void): boolean => {
      const message = msg as FetchImageMessage | null;
      if (message?.action !== 'fetchImage' || !message.url) return false;
      (async () => {
        try {
          const res = await fetch(message.url, { credentials: 'omit' });
          if (!res.ok) {
            sendResponse({ ok: false });
            return;
          }
          const blob = await res.blob();
          if (!blob.type.startsWith('image/')) {
            sendResponse({ ok: false });
            return;
          }
          const reader = new FileReader();
          reader.onload = () => sendResponse({ ok: true, dataURL: reader.result });
          reader.onerror = () => sendResponse({ ok: false });
          reader.readAsDataURL(blob);
        } catch {
          sendResponse({ ok: false });
        }
      })();
      return true; // keep the message channel open for the async response
    },
  );
});

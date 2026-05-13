/* Minimal service worker. The heavy lifting happens in the content script —
 * the Prompt API needs a DOM context, which a worker doesn't have. */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

/* Shared markdown renderer. Depends on marked + DOMPurify being loaded first. */
(() => {
  // Restrictive on purpose: no <img>, no <input> (task lists), no <video>.
  const ALLOWED_TAGS = [
    'p', 'br', 'strong', 'em', 'b', 'i', 'code', 'pre',
    'blockquote', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ];
  const ALLOWED_ATTR = ['href', 'title'];
  const SANITIZE_CONFIG = { ALLOWED_TAGS, ALLOWED_ATTR };

  if (typeof marked !== 'undefined') {
    marked.use({ gfm: true, breaks: true });
  }
  if (typeof DOMPurify !== 'undefined') {
    // Force links to open in a new tab; never leak the current page via referrer.
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }

  globalThis.renderMarkdownInto = function renderMarkdownInto(el, text) {
    if (!text) { el.textContent = ''; return; }
    if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
      console.warn('[wiggle-magic] marked or DOMPurify not loaded — falling back to plain text');
      el.textContent = text;
      return;
    }
    el.innerHTML = DOMPurify.sanitize(marked.parse(String(text)), SANITIZE_CONFIG);
  };
})();

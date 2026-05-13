import { marked } from 'marked';
import DOMPurify from 'dompurify';

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

marked.use({ gfm: true, breaks: true });

// Force links to open in a new tab; never leak the current page via referrer.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function renderMarkdownInto(el: HTMLElement, text: string): void {
  if (!text) {
    el.textContent = '';
    return;
  }
  const html = marked.parse(String(text), { async: false }) as string;
  el.innerHTML = DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

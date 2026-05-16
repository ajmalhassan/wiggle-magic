// src/lib/picker/resolve-target.ts

const SEMANTIC_TAGS = new Set([
  'p', 'li', 'blockquote',
  'article', 'section', 'figure', 'picture',
  'video', 'audio',
  'table', 'tr', 'th', 'td',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'button',
]);

export function resolveTarget(el: Element): Element {
  let cur: Element | null = el;
  while (cur && cur !== document.body) {
    if (SEMANTIC_TAGS.has(cur.tagName.toLowerCase())) return cur;
    if (cur.parentElement && cur.parentElement.children.length > 30) return cur;
    cur = cur.parentElement;
  }
  return el;
}

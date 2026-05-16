// src/lib/dom-utils.ts

/**
 * Escape arbitrary text for safe inclusion as HTML. Uses textContent's
 * built-in entity encoding via a throwaway div — no regex, no edge cases.
 */
export function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

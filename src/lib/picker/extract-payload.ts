// src/lib/picker/extract-payload.ts
import type { Payload } from '../types/payload';

/**
 * Build a Payload from a DOM Element and a pre-computed CSS selector.
 *
 * Ported verbatim from the inline `getPayload` function in
 * entrypoints/content/index.ts — behavioural parity is intentional.
 *
 * Notable details preserved from the original:
 *  - `data` keys have the "data-" prefix stripped (stored as bare key name).
 *  - Image src prefers `currentSrc` over `src` (responsive images).
 *  - Text is trimmed then capped at 1 000 chars (original limit, not 16 000).
 *  - `link.text` is trimmed via `(a.innerText || '').trim()`.
 *  - `value` is extracted by checking `el.tagName` string, matching original.
 */
export function extractPayload(el: Element, selector: string): Payload {
  const rect = el.getBoundingClientRect();
  const aria: Record<string, string> = {};
  const data: Record<string, string> = {};

  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith('aria-')) aria[attr.name] = attr.value;
    if (attr.name.startsWith('data-')) data[attr.name.slice(5)] = attr.value;
  }
  if (el.getAttribute('role')) aria.role = el.getAttribute('role')!;
  if (el.id) aria.id = el.id;
  if ((el as HTMLElement).title) aria.title = (el as HTMLElement).title;

  let image: Payload['image'] = null;
  if (el.tagName === 'IMG') {
    const img = el as HTMLImageElement;
    image = {
      src: img.currentSrc || img.src,
      alt: img.alt,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    };
  } else {
    const img = el.querySelector('img');
    if (img) image = { src: img.currentSrc || img.src, alt: img.alt };
  }

  let link: Payload['link'] = null;
  const a = el.tagName === 'A' ? (el as HTMLAnchorElement) : el.closest('a');
  if (a && a.href) link = { href: a.href, text: (a.innerText || a.textContent || '').trim().slice(0, 200) };

  let value: string | null = null;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
    value = (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  return {
    selector,
    tag: el.tagName.toLowerCase(),
    text: ((el as HTMLElement).innerText || el.textContent || '').trim().slice(0, 1000),
    aria,
    data,
    image,
    link,
    value,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  };
}

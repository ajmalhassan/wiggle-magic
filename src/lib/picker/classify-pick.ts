// src/lib/picker/classify-pick.ts
import type { PickTag } from '../types/payload';

const CURRENCY_REGEX = /[$€£¥₹]\s?\d/;
const CODE_CLASS_REGEX = /\b(hljs|prism|highlight|language-|code-block)\b/;

export function classifyPick(el: Element): PickTag[] {
  const tags: PickTag[] = [];
  const tag = el.tagName.toLowerCase();
  const text = (el as HTMLElement).innerText ?? el.textContent ?? '';

  // Code
  if (tag === 'pre' || tag === 'code') tags.push('code');
  else if (el.className && CODE_CLASS_REGEX.test((el as HTMLElement).className)) tags.push('code');
  else if (el.querySelector('pre, code')) tags.push('code');

  // Table
  if (tag === 'table' || el.getAttribute('role') === 'grid') tags.push('table');

  // Price
  if (CURRENCY_REGEX.test(text)) tags.push('price');

  // Video
  if (tag === 'video' || el.querySelector('video')) tags.push('video');

  // Length
  const len = text.length;
  if (len > 1500) tags.push('long');
  else if (len < 200 && len > 0) tags.push('short');

  return tags;
}

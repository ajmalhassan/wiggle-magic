// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractPayload } from './extract-payload';

function dom(html: string) {
  const w = document.createElement('div');
  w.innerHTML = html;
  document.body.appendChild(w);
  return w.firstElementChild as HTMLElement;
}

describe('extractPayload', () => {
  it('captures text of a paragraph', () => {
    const p = dom('<p>Hello world</p>');
    const out = extractPayload(p, 'div > p');
    expect(out.text).toBe('Hello world');
    expect(out.tag).toBe('p');
  });

  it('collects aria-* attributes', () => {
    const el = dom('<button aria-label="Close" aria-pressed="false">X</button>');
    const out = extractPayload(el, 'button');
    expect(out.aria['aria-label']).toBe('Close');
    expect(out.aria['aria-pressed']).toBe('false');
  });

  it('extracts image src + alt', () => {
    const el = dom('<img src="/cat.jpg" alt="A cat">');
    const out = extractPayload(el, 'img');
    expect(out.image?.src).toContain('cat.jpg');
    expect(out.image?.alt).toBe('A cat');
  });

  it('extracts link href + text', () => {
    const el = dom('<a href="https://example.com">Click me</a>');
    const out = extractPayload(el, 'a');
    expect(out.link?.href).toBe('https://example.com/');
    expect(out.link?.text).toBe('Click me');
  });

  it('returns null link/image for plain elements', () => {
    const el = dom('<p>nothing special</p>');
    const out = extractPayload(el, 'p');
    expect(out.image).toBeNull();
    expect(out.link).toBeNull();
  });

  it('records the bounding rect', () => {
    const el = dom('<div style="width: 100px; height: 50px"></div>');
    const out = extractPayload(el, 'div');
    expect(out.rect).toHaveProperty('x');
    expect(out.rect).toHaveProperty('width');
  });
});

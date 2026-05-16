// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { classifyPick } from './classify-pick';

function el(html: string): HTMLElement {
  const w = document.createElement('div');
  w.innerHTML = html;
  document.body.appendChild(w);
  return w.firstElementChild as HTMLElement;
}

describe('classifyPick', () => {
  it('tags a <pre> as code', () => {
    expect(classifyPick(el('<pre>const x = 1;</pre>'))).toContain('code');
  });

  it('tags an element with hljs class as code', () => {
    expect(classifyPick(el('<div class="hljs">code</div>'))).toContain('code');
  });

  it('tags a <table> as table', () => {
    expect(classifyPick(el('<table><tr><td>x</td></tr></table>'))).toContain('table');
  });

  it('tags currency-bearing text as price', () => {
    expect(classifyPick(el('<p>The price is $19.99</p>'))).toContain('price');
  });

  it('tags long text as long', () => {
    const long = 'word '.repeat(400);
    expect(classifyPick(el(`<p>${long}</p>`))).toContain('long');
  });

  it('tags short text as short', () => {
    expect(classifyPick(el('<p>hi</p>'))).toContain('short');
  });

  it('returns empty array for an unremarkable paragraph', () => {
    const mid = 'word '.repeat(80);
    expect(classifyPick(el(`<p>${mid}</p>`))).toEqual([]);
  });
});

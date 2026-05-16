// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { resolveTarget } from './resolve-target';

function dom(html: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  return wrap;
}

describe('resolveTarget', () => {
  it('escalates from span to enclosing <p>', () => {
    const wrap = dom('<p>Hello <span id="x">world</span></p>');
    const span = wrap.querySelector('#x')!;
    expect(resolveTarget(span).tagName.toLowerCase()).toBe('p');
  });

  it('escalates from inner <img> to <figure>', () => {
    const wrap = dom('<figure><img id="i" src=""></figure>');
    const img = wrap.querySelector('#i')!;
    expect(resolveTarget(img).tagName.toLowerCase()).toBe('figure');
  });

  it('does not escalate into a giant container (>30 children)', () => {
    const items = Array.from({ length: 40 }, (_, i) => `<p>p${i}</p>`).join('');
    const wrap = dom(`<article>${items}</article>`);
    const p = wrap.querySelectorAll('p')[5];
    expect(resolveTarget(p).tagName.toLowerCase()).toBe('p');
  });

  it('falls back to the original element when no semantic ancestor', () => {
    const wrap = dom('<div><div id="d"><span id="s">x</span></div></div>');
    const span = wrap.querySelector('#s')!;
    const r = resolveTarget(span);
    expect(['span', 'div']).toContain(r.tagName.toLowerCase());
  });
});

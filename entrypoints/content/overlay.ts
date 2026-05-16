// entrypoints/content/overlay.ts
import './overlay.css';

export interface Overlay {
  mount(): void;
  setCursor(x: number, y: number, visible: boolean): void;
  setHighlight(rect: DOMRect | null, picked: boolean): void;
  setTag(rect: DOMRect | null, tag: string): void;
  spawnBurst(x: number, y: number): void;
  el: HTMLElement;
}

export function createOverlay(parent: HTMLElement, cursorUrl: string): Overlay {
  const el = document.createElement('div');
  el.id = 'wm-overlay';
  el.innerHTML = `
    <div id="wm-edge"></div>
    <div id="wm-ripples"></div>
    <div id="wm-highlight"></div>
    <div id="wm-tag" aria-hidden="true"></div>
    <div id="wm-cursor"><div class="shape"><div class="grad"></div></div></div>
  `;

  const cursor = el.querySelector<HTMLElement>('#wm-cursor')!;
  const shape = el.querySelector<HTMLElement>('#wm-cursor .shape')!;
  const highlight = el.querySelector<HTMLElement>('#wm-highlight')!;
  const tagBadge = el.querySelector<HTMLElement>('#wm-tag')!;
  const ripples = el.querySelector<HTMLElement>('#wm-ripples')!;

  shape.style.webkitMaskImage = `url("${cursorUrl}")`;
  shape.style.maskImage = `url("${cursorUrl}")`;

  return {
    el,
    mount() { parent.appendChild(el); },

    setCursor(x, y, visible) {
      cursor.style.transform = `translate(${x}px, ${y}px) scale(${visible ? 1 : 0.4})`;
      cursor.classList.toggle('visible', visible);
    },

    setHighlight(rect, picked) {
      if (!rect) { highlight.style.opacity = '0'; return; }
      highlight.style.opacity = '1';
      highlight.classList.toggle('picked', picked);
      highlight.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
      highlight.style.width = rect.width + 'px';
      highlight.style.height = rect.height + 'px';
    },

    setTag(rect, tag) {
      if (!rect) { tagBadge.style.opacity = '0'; return; }
      tagBadge.style.opacity = '1';
      tagBadge.textContent = tag;
      tagBadge.style.transform = `translate(${rect.left}px, ${rect.top - 18}px)`;
    },

    spawnBurst(x, y) {
      for (const cls of ['', 'b', 'c']) {
        const ring = document.createElement('div');
        ring.className = 'wm-ring' + (cls ? ' ' + cls : '');
        ring.style.left = x + 'px';
        ring.style.top  = y + 'px';
        ripples.appendChild(ring);
        ring.addEventListener('animationend', () => ring.remove(), { once: true });
      }
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
        const r = 80 + Math.random() * 60;
        const s = document.createElement('div');
        s.className = 'wm-spark';
        s.style.left = x + 'px';
        s.style.top  = y + 'px';
        s.style.setProperty('--dx', (Math.cos(a) * r) + 'px');
        s.style.setProperty('--dy', (Math.sin(a) * r) + 'px');
        ripples.appendChild(s);
        s.addEventListener('animationend', () => s.remove(), { once: true });
      }
    },
  };
}

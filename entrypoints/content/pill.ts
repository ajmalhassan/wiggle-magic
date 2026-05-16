// entrypoints/content/pill.ts
import type { PickRef } from '@/src/lib/types/thread';
import { escapeHtml } from '@/src/lib/dom-utils';
import { iconFor } from './sidebar/chip';
import './pill.css';

export interface Pill {
  mount(): void;
  unmount(): void;
  setPicks(picks: PickRef[]): void;
  onChipRemove(fn: (id: string) => void): void;
  el: HTMLElement;
}

export function createPill(parent: HTMLElement): Pill {
  const el = document.createElement('div');
  el.id = 'wm-pill';
  el.setAttribute('role', 'toolbar');
  el.setAttribute('aria-label', 'Selected items');
  el.innerHTML = `
    <div class="pill-left">
      <svg class="sparkle" viewBox="-3 -3 6 6" aria-hidden="true">
        <polygon points="0,-2.6 0.7,-0.7 2.6,0 0.7,0.7 0,2.6 -0.7,0.7 -2.6,0 -0.7,-0.7" />
      </svg>
      <span class="count">0 picked</span>
    </div>
    <div class="pill-chips"></div>
    <div class="pill-right">
      <span class="hint">Press <kbd>⏎</kbd> for Magic</span>
    </div>
  `;

  const countEl = el.querySelector<HTMLElement>('.count')!;
  const chipsEl = el.querySelector<HTMLElement>('.pill-chips')!;
  let removeFn: ((id: string) => void) | null = null;

  return {
    el,
    mount() {
      parent.appendChild(el);
      requestAnimationFrame(() => el.classList.add('visible'));
    },
    unmount() {
      el.classList.remove('visible');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    },
    setPicks(picks) {
      countEl.textContent = `${picks.length} picked`;
      chipsEl.innerHTML = '';
      for (const p of picks) {
        const chip = document.createElement('button');
        chip.className = 'pill-chip';
        chip.dataset.id = p.id;
        chip.innerHTML = `<span class="chip-icon">${iconFor(p)}</span><span class="chip-label">${escapeHtml(p.label)}</span><span class="chip-x" aria-label="Remove">×</span>`;
        chip.querySelector('.chip-x')!.addEventListener('click', (e) => {
          e.stopPropagation();
          removeFn?.(p.id);
        });
        chipsEl.appendChild(chip);
      }
    },
    onChipRemove(fn) { removeFn = fn; },
  };
}

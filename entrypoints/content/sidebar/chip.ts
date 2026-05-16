// entrypoints/content/sidebar/chip.ts
import type { PickRef } from '@/src/lib/types/thread';

export interface ChipOpts {
  removable?: boolean;
  onRemove?: () => void;
  clickable?: boolean;
  onClick?: () => void;
  missing?: boolean;
}

export function renderChip(p: PickRef, opts: ChipOpts = {}): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'wm-chip';
  if (opts.missing) chip.classList.add('missing');
  if (opts.clickable) chip.classList.add('clickable');

  const icon = document.createElement('span');
  icon.className = 'chip-icon';
  icon.textContent = iconFor(p);
  chip.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'chip-label';
  label.textContent = p.label;
  chip.appendChild(label);

  if (opts.removable) {
    const x = document.createElement('button');
    x.className = 'chip-x';
    x.type = 'button';
    x.setAttribute('aria-label', `Remove pick: ${p.label}`);
    x.textContent = '×';
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onRemove?.();
    });
    chip.appendChild(x);
  }

  if (opts.clickable && opts.onClick) {
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-label', `Scroll to: ${p.label}`);
    chip.tabIndex = 0;
    chip.addEventListener('click', opts.onClick);
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') opts.onClick?.();
    });
  }

  return chip;
}

export function iconFor(p: PickRef): string {
  if (p.payload.image) return '🖼';
  if (p.payload.link) return '🔗';
  if (p.tags.includes('code')) return '⌨';
  if (p.payload.tag === 'button') return '→';
  return '¶';
}

// entrypoints/content/sidebar/slash-menu.ts
import type { ActionRegistry } from '@/src/lib/actions/registry';
import type { ActionDef, ActionContext } from '@/src/lib/types/action';

export interface SlashMenu {
  setContext(ctx: ActionContext): void;
  update(text: string): void;
  acceptHighlighted(): { action: ActionDef; trailingText: string } | null;
  next(): void;
  prev(): void;
  isOpen(): boolean;
  hide(): void;
  el: HTMLElement;
}

export function createSlashMenu(
  parent: HTMLElement,
  registry: ActionRegistry,
): SlashMenu {
  let ctx: ActionContext | null = null;
  let open = false;
  let highlighted = 0;
  let matches: ActionDef[] = [];
  let currentText = '';

  const root = document.createElement('div');
  root.className = 'slash-menu';
  root.setAttribute('role', 'listbox');
  root.hidden = true;
  parent.appendChild(root);

  function render() {
    root.innerHTML = '';
    matches.forEach((a, i) => {
      const item = document.createElement('div');
      item.className = 'slash-item';
      item.setAttribute('role', 'option');
      item.dataset.actionId = a.id;
      if (i === highlighted) item.setAttribute('aria-selected', 'true');
      item.innerHTML = `
        <span class="slash-icon">${a.icon ?? '✦'}</span>
        <span class="slash-label">/${a.id}</span>
        <span class="slash-desc">${escape(a.description ?? a.label)}</span>
      `;
      item.addEventListener('mouseenter', () => { highlighted = i; render(); });
      root.appendChild(item);
    });
  }

  function show() {
    if (matches.length === 0) { hide(); return; }
    if (!open) { open = true; root.hidden = false; }
    render();
  }

  function hide() {
    open = false;
    root.hidden = true;
  }

  return {
    el: root,
    setContext(c) { ctx = c; },
    update(text) {
      currentText = text;
      if (!text.startsWith('/')) { hide(); return; }
      if (!ctx) return;
      const prefix = text.slice(1).split(/\s+/)[0].toLowerCase();
      const all = registry.getSlashOptions(ctx);
      matches = all.filter(a => a.id.toLowerCase().startsWith(prefix)).slice(0, 8);
      highlighted = 0;
      show();
    },
    acceptHighlighted() {
      if (!open || matches.length === 0) return null;
      const action = matches[highlighted];
      const firstSpace = currentText.indexOf(' ');
      const trailing = firstSpace >= 0 ? currentText.slice(firstSpace + 1) : '';
      hide();
      return { action, trailingText: trailing };
    },
    next() { if (matches.length) { highlighted = (highlighted + 1) % matches.length; render(); } },
    prev() { if (matches.length) { highlighted = (highlighted - 1 + matches.length) % matches.length; render(); } },
    isOpen: () => open,
    hide,
  };
}

function escape(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

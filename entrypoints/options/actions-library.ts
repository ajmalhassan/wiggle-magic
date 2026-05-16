// entrypoints/options/actions-library.ts
import { chromeKV } from '@/src/lib/storage';
import { createRegistry } from '@/src/lib/actions/registry';
import { escapeHtml } from '@/src/lib/dom-utils';
import type { ActionDef } from '@/src/lib/types/action';

export async function initActionsUI() {
  const registry = await createRegistry(chromeKV());

  const coreList = document.getElementById('builtin-core-list')!;
  const libList = document.getElementById('library-list')!;
  const heroList = document.getElementById('hero-order-list')!;

  function renderCore() {
    coreList.innerHTML = '';
    for (const a of registry.getAll().filter(x => x.source === 'builtin-core')) {
      coreList.appendChild(renderActionRow(a));
    }
  }

  function renderLibrary() {
    libList.innerHTML = '';
    for (const a of registry.getLibrary()) {
      const enabled = registry.isLibraryEnabled(a.id);
      libList.appendChild(renderLibraryRow(a, enabled));
    }
  }

  function renderHeroOrder() {
    heroList.innerHTML = '';
    const all = registry.getAll();
    const heroIds = registry.getHeroOrder();
    heroIds.forEach((id, i) => {
      const a = all.find(x => x.id === id);
      if (!a) return;
      heroList.appendChild(renderHeroRow(a, i, heroIds));
    });
  }

  function renderActionRow(a: ActionDef): HTMLElement {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="action-label">${escapeHtml(a.icon ?? '✦')} ${escapeHtml(a.label)}</span>
      <span class="action-desc">${escapeHtml(a.description ?? '')}</span>
      <span class="action-toggle enabled">enabled</span>
    `;
    return li;
  }

  function renderLibraryRow(a: ActionDef, enabled: boolean): HTMLElement {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="action-label">${escapeHtml(a.icon ?? '✦')} ${escapeHtml(a.label)}</span>
      <span class="action-desc">${escapeHtml(a.description ?? '')}</span>
      <button class="action-toggle ${enabled ? 'enabled' : ''}" type="button">${enabled ? 'enabled' : 'enable'}</button>
    `;
    const toggle = li.querySelector<HTMLButtonElement>('.action-toggle')!;
    toggle.addEventListener('click', async () => {
      if (enabled) {
        await registry.disableFromLibrary(a.id);
        // Also remove from hero order if present
        const heroIds = registry.getHeroOrder();
        const filtered = heroIds.filter(id => id !== a.id);
        if (filtered.length !== heroIds.length) await registry.setHeroOrder(filtered);
      } else {
        await registry.enableFromLibrary(a.id);
        const heroIds = registry.getHeroOrder();
        if (!heroIds.includes(a.id)) {
          heroIds.push(a.id);
          await registry.setHeroOrder(heroIds);
        }
      }
      renderLibrary();
      renderHeroOrder();
    });
    return li;
  }

  function renderHeroRow(a: ActionDef, idx: number, heroIds: string[]): HTMLElement {
    const li = document.createElement('li');
    li.innerHTML = `
      <button class="arrow-btn up" type="button" aria-label="Move up" ${idx === 0 ? 'disabled' : ''}>↑</button>
      <button class="arrow-btn down" type="button" aria-label="Move down" ${idx === heroIds.length - 1 ? 'disabled' : ''}>↓</button>
      <span class="action-label">${escapeHtml(a.icon ?? '✦')} ${escapeHtml(a.label)}</span>
    `;
    const up = li.querySelector<HTMLButtonElement>('.up')!;
    const down = li.querySelector<HTMLButtonElement>('.down')!;
    up.addEventListener('click', async () => { swap(heroIds, idx, idx - 1); await registry.setHeroOrder(heroIds); renderHeroOrder(); });
    down.addEventListener('click', async () => { swap(heroIds, idx, idx + 1); await registry.setHeroOrder(heroIds); renderHeroOrder(); });
    return li;
  }

  function swap<T>(arr: T[], i: number, j: number) { const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }

  renderCore();
  renderLibrary();
  renderHeroOrder();
}

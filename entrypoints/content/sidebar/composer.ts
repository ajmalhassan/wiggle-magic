// entrypoints/content/sidebar/composer.ts
import type { State } from '../state';
import type { ActionRegistry } from '@/src/lib/actions/registry';
import type { ActionDef, ActionContext } from '@/src/lib/types/action';
import type { PickRef } from '@/src/lib/types/thread';
import type { SlashMenu } from './slash-menu';
import { escapeHtml } from '@/src/lib/dom-utils';
import { renderChip } from './chip';

export interface Composer {
  setPicks(picks: PickRef[]): void;
  getStagedPicks(): PickRef[];
  setContext(ctx: ActionContext): void;
  focusInput(): void;
  el: HTMLElement;
}

export function createComposer(
  parent: HTMLElement,
  state: State,
  registry: ActionRegistry,
  slashMenu?: SlashMenu,
): Composer {
  let stagedPicks: PickRef[] = [];
  let activeCtx: ActionContext | null = null;

  const root = document.createElement('div');
  root.className = 'composer-root';
  root.innerHTML = `
    <div class="staged-chips"></div>
    <button class="add-btn" type="button" aria-label="Add more picks">+ Add</button>
    <div class="hero-row"></div>
    <div class="composer-input-row">
      <input class="composer-input" type="text" placeholder="Ask anything about your selection…" autocomplete="off" />
      <button class="composer-send" type="button" aria-label="Send">
        <svg viewBox="-3 -3 6 6" width="12" height="12" aria-hidden="true">
          <polygon points="0,-2.6 0.7,-0.7 2.6,0 0.7,0.7 0,2.6 -0.7,0.7 -2.6,0 -0.7,-0.7" fill="#0b0d12"/>
        </svg>
      </button>
    </div>
  `;
  parent.appendChild(root);

  const stagedEl = root.querySelector<HTMLElement>('.staged-chips')!;
  const heroRow = root.querySelector<HTMLElement>('.hero-row')!;
  const addBtn = root.querySelector<HTMLButtonElement>('.add-btn')!;
  const input = root.querySelector<HTMLInputElement>('.composer-input')!;
  const sendBtn = root.querySelector<HTMLButtonElement>('.composer-send')!;

  function renderStaged() {
    stagedEl.innerHTML = '';
    for (const p of stagedPicks) {
      stagedEl.appendChild(renderChip(p, {
        removable: true,
        onRemove() {
          stagedPicks = stagedPicks.filter(x => x.id !== p.id);
          renderStaged();
          renderHeroes();
          state.emit('picks:change', { picks: stagedPicks, source: 'staging' });
        },
      }));
    }
  }

  function renderHeroes() {
    heroRow.innerHTML = '';
    if (!activeCtx) return;
    const ctxWithStaged: ActionContext = { ...activeCtx, picks: stagedPicks };
    const heroes = registry.getVisibleHeroes(ctxWithStaged);
    for (const a of heroes) heroRow.appendChild(renderHeroButton(a));
  }

  function renderHeroButton(a: ActionDef): HTMLElement {
    const b = document.createElement('button');
    b.className = 'hero-btn';
    b.type = 'button';
    b.dataset.actionId = a.id;
    b.innerHTML = `${escapeHtml(a.icon ?? '✦')} ${escapeHtml(a.label)}`;
    b.addEventListener('click', () => submit(a, undefined));
    return b;
  }

  function submit(action: ActionDef, freeText: string | undefined) {
    state.emit('turn:submit', {
      actionId: action.id,
      modifiers: [],
      text: freeText,
      picks: stagedPicks,
    });
    input.value = '';
  }

  const ASK_ID = 'ask';

  addBtn.addEventListener('click', () => state.emit('add-clicked', {}));

  input.addEventListener('keydown', (e) => {
    if (slashMenu?.isOpen()) {
      if (e.key === 'ArrowDown')   { e.preventDefault(); slashMenu.next(); return; }
      if (e.key === 'ArrowUp')     { e.preventDefault(); slashMenu.prev(); return; }
      if (e.key === 'Escape')      { e.preventDefault(); slashMenu.hide(); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && input.value.startsWith('/'))) {
        e.preventDefault();
        const accepted = slashMenu.acceptHighlighted();
        if (accepted) submit(accepted.action, accepted.trailingText.trim() || undefined);
        return;
      }
    }
    if (e.key === 'Enter' && input.value.trim().length > 0) {
      e.preventDefault();
      const ask = registry.getById(ASK_ID);
      if (ask) submit(ask, input.value);
    }
  });

  input.addEventListener('input', () => slashMenu?.update(input.value));

  sendBtn.addEventListener('click', () => {
    if (input.value.trim().length === 0) return;
    const ask = registry.getById(ASK_ID);
    if (ask) submit(ask, input.value);
  });

  return {
    el: root,
    setPicks(picks) {
      stagedPicks = [...picks];
      renderStaged();
      renderHeroes();
    },
    getStagedPicks() { return [...stagedPicks]; },
    setContext(ctx) {
      activeCtx = ctx;
      renderHeroes();
    },
    focusInput() { input.focus(); },
  };
}


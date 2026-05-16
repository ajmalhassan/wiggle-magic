// entrypoints/content/sidebar/turn-magic.ts
import type { MagicTurn } from '@/src/lib/types/thread';
import type { ActionRegistry } from '@/src/lib/actions/registry';
import { escapeHtml } from '@/src/lib/dom-utils';
import { renderChip } from './chip';
import { renderMarkdownInto } from '@/src/lib/markdown';

export interface MagicTurnHandle {
  el: HTMLElement;
  appendChunk(chunk: string): void;
  finalize(answer: string): void;
  showError(code: string, body: string, primaryAction?: { label: string; onClick: () => void }): void;
  setStale(stale: boolean): void;
}

export interface MagicTurnCallbacks {
  onSave(): void;
  onCopy(): void;
  onRerun(): void;
  onBackRefClick(selector: string): void;
}

export function renderMagicTurn(
  turn: MagicTurn,
  _registry: ActionRegistry,
  callbacks: MagicTurnCallbacks,
): MagicTurnHandle {
  const card = document.createElement('article');
  card.className = 'turn-card turn-magic';
  card.dataset.turnId = turn.id;
  card.setAttribute('role', 'article');

  const header = document.createElement('div');
  header.className = 'turn-header';
  header.innerHTML = `
    <span class="visually-hidden">From Magic</span>
    <span class="role-label">✦ Magic</span>
  `;
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'turn-body';
  if (turn.status === 'streaming') body.classList.add('streaming');
  card.appendChild(body);

  if (turn.status === 'done' && turn.answer) {
    renderMarkdownInto(body, turn.answer);
  }

  const sourcesWrap = document.createElement('div');
  sourcesWrap.className = 'turn-sources';
  if (turn.sources.length > 0) {
    const label = document.createElement('span');
    label.className = 'sources-label';
    label.textContent = 'Based on:';
    sourcesWrap.appendChild(label);
    for (const p of turn.sources) {
      const missing = !document.querySelector(p.selector);
      sourcesWrap.appendChild(renderChip(p, {
        clickable: true,
        missing,
        onClick() { callbacks.onBackRefClick(p.selector); },
      }));
    }
    card.appendChild(sourcesWrap);
  }

  const stale = document.createElement('div');
  stale.className = 'stale-badge';
  stale.hidden = true;
  stale.innerHTML = `<span>↻ may be stale</span>`;
  card.appendChild(stale);

  const footer = document.createElement('div');
  footer.className = 'turn-footer';
  footer.hidden = turn.status !== 'done';
  footer.innerHTML = `
    <button class="footer-btn save-btn" type="button">Save</button>
    <button class="footer-btn copy-btn" type="button">Copy</button>
    <button class="footer-btn rerun-btn" type="button">↻ Rerun</button>
    <span class="saved-msg" hidden>saved ✓</span>
  `;
  const saveBtn = footer.querySelector<HTMLButtonElement>('.save-btn')!;
  const copyBtn = footer.querySelector<HTMLButtonElement>('.copy-btn')!;
  const rerunBtn = footer.querySelector<HTMLButtonElement>('.rerun-btn')!;
  const savedMsg = footer.querySelector<HTMLElement>('.saved-msg')!;
  saveBtn.addEventListener('click', () => {
    callbacks.onSave();
    savedMsg.hidden = false;
    setTimeout(() => { savedMsg.hidden = true; }, 1800);
  });
  copyBtn.addEventListener('click', callbacks.onCopy);
  rerunBtn.addEventListener('click', callbacks.onRerun);
  card.appendChild(footer);

  let buffer = '';

  return {
    el: card,
    appendChunk(chunk) {
      buffer += chunk;
      body.textContent = buffer;
    },
    finalize(answer) {
      body.classList.remove('streaming');
      renderMarkdownInto(body, answer);
      footer.hidden = false;
    },
    showError(code, msg, primary) {
      body.classList.remove('streaming');
      body.innerHTML = '';
      const errEl = document.createElement('div');
      errEl.className = 'turn-error';
      errEl.setAttribute('role', 'alert');
      errEl.dataset.code = code;
      errEl.innerHTML = `<p>${escapeHtml(msg)}</p>`;
      if (primary) {
        const b = document.createElement('button');
        b.className = 'turn-error-action';
        b.type = 'button';
        b.textContent = primary.label;
        b.addEventListener('click', primary.onClick);
        errEl.appendChild(b);
      }
      body.appendChild(errEl);
    },
    setStale(s) { stale.hidden = !s; },
  };
}


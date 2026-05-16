// entrypoints/content/sidebar/turn-user.ts
import type { UserTurn } from '@/src/lib/types/thread';
import type { ActionRegistry } from '@/src/lib/actions/registry';
import { renderChip } from './chip';

export function renderUserTurn(turn: UserTurn, registry: ActionRegistry): HTMLElement {
  const card = document.createElement('article');
  card.className = 'turn-card turn-user';
  card.dataset.turnId = turn.id;
  card.setAttribute('role', 'article');

  const action = registry.getById(turn.actionId);
  const actionLabel = action?.label ?? turn.actionId;

  const header = document.createElement('div');
  header.className = 'turn-header';
  header.innerHTML = `
    <span class="visually-hidden">From you</span>
    <span class="role-label">You</span>
    <span class="action-label">${escape(actionLabel)}</span>
  `;
  card.appendChild(header);

  if (turn.text) {
    const text = document.createElement('div');
    text.className = 'user-text';
    text.textContent = turn.text;
    card.appendChild(text);
  }

  if (turn.picks.length > 0) {
    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'turn-chips';
    for (const p of turn.picks) chipsWrap.appendChild(renderChip(p));
    card.appendChild(chipsWrap);
  }

  if (turn.modifiers.length > 0) {
    const mods = document.createElement('div');
    mods.className = 'turn-modifiers';
    mods.textContent = '· ' + turn.modifiers.join(' · ');
    card.appendChild(mods);
  }

  return card;
}

function escape(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

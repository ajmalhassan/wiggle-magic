// entrypoints/content/sidebar/turn-list.ts
import type { Turn, MagicTurn, UserTurn } from '@/src/lib/types/thread';
import type { ActionRegistry } from '@/src/lib/actions/registry';
import { renderUserTurn } from './turn-user';
import { renderMagicTurn, type MagicTurnHandle, type MagicTurnCallbacks } from './turn-magic';

export interface TurnListCallbacks {
  onSave(magic: MagicTurn): void;
  onCopy(magic: MagicTurn): void;
  onRerun(magic: MagicTurn): void;
  onBackRefClick(selector: string): void;
}

export interface TurnList {
  reset(turns: Turn[]): void;
  appendUser(turn: UserTurn): void;
  appendMagic(turn: MagicTurn): MagicTurnHandle;
  replaceMagic(oldId: string, replacement: MagicTurn): MagicTurnHandle;
  setLatestStale(stale: boolean): void;
}

export function createTurnList(
  body: HTMLElement,
  registry: ActionRegistry,
  cb: TurnListCallbacks,
): TurnList {
  const handlesByMagicId = new Map<string, MagicTurnHandle>();
  let lastMagicId: string | null = null;

  function scrollToBottom() {
    body.scrollTop = body.scrollHeight;
  }

  function makeCallbacks(turn: MagicTurn): MagicTurnCallbacks {
    return {
      onSave: () => cb.onSave(turn),
      onCopy: () => cb.onCopy(turn),
      onRerun: () => cb.onRerun(turn),
      onBackRefClick: cb.onBackRefClick,
    };
  }

  return {
    reset(turns) {
      body.innerHTML = '';
      handlesByMagicId.clear();
      lastMagicId = null;
      for (const t of turns) {
        if (t.role === 'user') body.appendChild(renderUserTurn(t, registry));
        else {
          const handle = renderMagicTurn(t, registry, makeCallbacks(t));
          handlesByMagicId.set(t.id, handle);
          lastMagicId = t.id;
          body.appendChild(handle.el);
        }
      }
      scrollToBottom();
    },

    appendUser(turn) {
      body.appendChild(renderUserTurn(turn, registry));
      scrollToBottom();
    },

    appendMagic(turn) {
      const handle = renderMagicTurn(turn, registry, makeCallbacks(turn));
      handlesByMagicId.set(turn.id, handle);
      lastMagicId = turn.id;
      body.appendChild(handle.el);
      scrollToBottom();
      return handle;
    },

    replaceMagic(oldId, replacement) {
      const oldHandle = handlesByMagicId.get(oldId);
      if (!oldHandle) throw new Error(`magic turn handle not found: ${oldId}`);
      const newHandle = renderMagicTurn(replacement, registry, makeCallbacks(replacement));
      handlesByMagicId.delete(oldId);
      handlesByMagicId.set(replacement.id, newHandle);
      if (lastMagicId === oldId) lastMagicId = replacement.id;
      oldHandle.el.replaceWith(newHandle.el);
      return newHandle;
    },

    setLatestStale(stale) {
      if (!lastMagicId) return;
      handlesByMagicId.get(lastMagicId)?.setStale(stale);
    },
  };
}

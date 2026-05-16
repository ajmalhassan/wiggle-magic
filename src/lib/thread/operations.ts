// src/lib/thread/operations.ts
import type { Thread, Turn, MagicTurn, UserTurn, PickRef } from '../types/thread';
import type { ThreadStore } from './store';
import type { KVStore } from '../storage';
import type { MemoryEntry, MemoryAction, SavedSelection } from '../types';
import { KEYS } from '../storage-keys';

export const MAX_TURNS_PER_THREAD = 20;

export interface ThreadOperations {
  appendTurn(origin: string, pathname: string, turn: Turn): Promise<Thread>;
  rerunTurn(origin: string, pathname: string, oldMagicId: string, replacement: MagicTurn): Promise<Thread>;
  promoteToMemory(thread: Thread, magic: MagicTurn): Promise<void>;
}

/**
 * Maps a new action id to the legacy MemoryAction enum so the popup keeps
 * rendering correctly. New code should read MemoryEntry.action *only* for
 * back-compat display; the real action id will land in a future
 * `actionId` field added in Plan 2.
 */
function mapToLegacyAction(actionId: string, modifiers: string[]): MemoryAction {
  if (modifiers.includes('bullets')) return 'bullets';
  if (actionId === 'summarize') return 'summary';
  if (actionId === 'compare') return 'compare';
  return 'ask';
}

/**
 * Projects a PickRef into the SavedSelection shape the popup renders.
 * Exported so the Plan 2 sidebar can reuse the same projection when saving
 * answers directly without going through promoteToMemory.
 */
export function pickRefToSavedSelection(p: PickRef): SavedSelection {
  const sel: SavedSelection = { tag: p.payload.tag };
  if (p.payload.text) sel.text = p.payload.text;
  if (p.payload.link) sel.link = { href: p.payload.link.href, text: p.payload.link.text };
  if (p.payload.image) sel.image = { src: p.payload.image.src, alt: p.payload.image.alt };
  if (p.selector) sel.selector = p.selector;
  return sel;
}

export function createThreadOperations(store: ThreadStore, kv: KVStore): ThreadOperations {
  async function loadOrThrow(origin: string, pathname: string): Promise<Thread> {
    const t = await store.load(origin, pathname);
    if (!t) throw new Error(`thread not found: ${origin}${pathname}`);
    return t;
  }

  return {
    async appendTurn(origin, pathname, turn) {
      const t = await loadOrThrow(origin, pathname);
      t.turns.push(turn);
      while (t.turns.length > MAX_TURNS_PER_THREAD) t.turns.shift();
      t.lastTouchedAt = Date.now();
      await store.save(t);
      return t;
    },

    async rerunTurn(origin, pathname, oldMagicId, replacement) {
      const t = await loadOrThrow(origin, pathname);
      const idx = t.turns.findIndex(x => x.role === 'magic' && x.id === oldMagicId);
      if (idx < 0) throw new Error(`magic turn not found: ${oldMagicId}`);
      t.turns[idx] = replacement;
      t.lastTouchedAt = Date.now();
      await store.save(t);
      return t;
    },

    async promoteToMemory(thread, magic) {
      const user = thread.turns.find(x => x.role === 'user' && x.id === magic.inReplyTo) as UserTurn | undefined;
      const question = user?.text ?? user?.actionId ?? magic.inReplyTo;
      const entry: MemoryEntry = {
        id: crypto.randomUUID(),
        ts: Date.now(),
        url: `${thread.origin}${thread.pathname}`,
        title: thread.title,
        hostname: thread.origin.replace(/^https?:\/\//, ''),
        question,
        answer: magic.answer,
        selections: magic.sources.map(pickRefToSavedSelection),
        action: mapToLegacyAction(user?.actionId ?? 'ask', user?.modifiers ?? []),
      };
      const existing = (await kv.get<MemoryEntry[]>(KEYS.memory)) ?? [];
      existing.push(entry);
      await kv.set(KEYS.memory, existing);
    },
  };
}

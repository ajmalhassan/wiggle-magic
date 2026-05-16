// src/lib/thread/store.ts
import type { Thread, ThreadIndexEntry } from '../types/thread';
import type { KVStore } from '../storage';

const PREFIX = 'wm:thread:';
const ARCHIVE_PREFIX = 'wm:thread-archive:';
const INDEX_KEY = 'wm:thread-index';

export const MAX_ACTIVE_THREADS = 50;
export const RESTORATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;     // 7 days

function key(origin: string, pathname: string): string {
  return `${PREFIX}${origin}${pathname}`;
}

function archiveKey(threadId: string): string {
  return `${ARCHIVE_PREFIX}${threadId}`;
}

export interface ThreadStore {
  load(origin: string, pathname: string): Promise<Thread | null>;
  loadIfFresh(origin: string, pathname: string): Promise<Thread | null>;
  save(thread: Thread): Promise<void>;
  archive(origin: string, pathname: string): Promise<void>;
  loadIndex(): Promise<ThreadIndexEntry[]>;
}

export function createThreadStore(kv: KVStore): ThreadStore {
  async function readIndex(): Promise<ThreadIndexEntry[]> {
    return (await kv.get<ThreadIndexEntry[]>(INDEX_KEY)) ?? [];
  }

  async function writeIndex(idx: ThreadIndexEntry[]): Promise<void> {
    await kv.set(INDEX_KEY, idx);
  }

  async function evictIfNeeded(): Promise<void> {
    const idx = await readIndex();
    const active = idx.filter(e => !e.archived).sort((a, b) => a.lastTouchedAt - b.lastTouchedAt);
    while (active.length > MAX_ACTIVE_THREADS) {
      const oldest = active.shift()!;
      // Remove its KV entry; mark out of index entirely (no archive — strict LRU).
      const parts = oldest.id.match(/^(https?:\/\/[^/]+)(\/.*)?$/);
      if (parts) {
        const origin = parts[1];
        const pathname = parts[2] ?? '/';
        await kv.remove(key(origin, pathname));
      }
    }
    const remaining = (await readIndex()).filter(e => e.archived || active.some(a => a.id === e.id));
    await writeIndex(remaining);
  }

  return {
    async load(origin, pathname) {
      return await kv.get<Thread>(key(origin, pathname));
    },

    async loadIfFresh(origin, pathname) {
      const t = await kv.get<Thread>(key(origin, pathname));
      if (!t) return null;
      if (Date.now() - t.lastTouchedAt > RESTORATION_WINDOW_MS) return null;
      return t;
    },

    async save(thread) {
      await kv.set(key(thread.origin, thread.pathname), thread);
      const idx = await readIndex();
      const existing = idx.find(e => e.id === thread.id);
      if (existing) {
        existing.lastTouchedAt = thread.lastTouchedAt;
        existing.title = thread.title;
        existing.archived = false;
      } else {
        idx.push({
          id: thread.id,
          lastTouchedAt: thread.lastTouchedAt,
          title: thread.title,
          archived: false,
        });
      }
      await writeIndex(idx);
      await evictIfNeeded();
    },

    async archive(origin, pathname) {
      const t = await kv.get<Thread>(key(origin, pathname));
      if (!t) return;
      await kv.set(archiveKey(t.id), t);
      await kv.remove(key(origin, pathname));
      const idx = await readIndex();
      const e = idx.find(x => x.id === t.id);
      if (e) e.archived = true;
      await writeIndex(idx);
    },

    async loadIndex() {
      return readIndex();
    },
  };
}

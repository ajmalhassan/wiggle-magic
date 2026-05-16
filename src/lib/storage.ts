// src/lib/storage.ts

export interface KVStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

/**
 * Production adapter: wraps chrome.storage.local. Constructed lazily so the
 * lib remains importable in environments without `chrome` (tests).
 */
export function chromeKV(): KVStore {
  return {
    async get<T>(key: string): Promise<T | null> {
      const out = await chrome.storage.local.get(key);
      return (out[key] as T | undefined) ?? null;
    },
    async set<T>(key: string, value: T): Promise<void> {
      await chrome.storage.local.set({ [key]: value });
    },
    async remove(key: string): Promise<void> {
      await chrome.storage.local.remove(key);
    },
    async keys(prefix: string): Promise<string[]> {
      const all = await chrome.storage.local.get(null);
      return Object.keys(all).filter(k => k.startsWith(prefix));
    },
  };
}

/**
 * Test adapter: in-memory map. Safe to instantiate per-test.
 */
export function memoryKV(): KVStore {
  const map = new Map<string, unknown>();
  return {
    async get<T>(key: string): Promise<T | null> {
      return (map.get(key) as T | undefined) ?? null;
    },
    async set<T>(key: string, value: T): Promise<void> {
      // Structured-clone-ish: keep tests honest about serializability.
      map.set(key, JSON.parse(JSON.stringify(value)));
    },
    async remove(key: string): Promise<void> {
      map.delete(key);
    },
    async keys(prefix: string): Promise<string[]> {
      return [...map.keys()].filter(k => k.startsWith(prefix));
    },
  };
}

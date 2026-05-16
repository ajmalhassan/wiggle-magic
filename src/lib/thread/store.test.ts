// src/lib/thread/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createThreadStore, RESTORATION_WINDOW_MS, MAX_ACTIVE_THREADS } from './store';
import { memoryKV } from '../storage';
import { makeThread } from '../test-fixtures';

describe('thread store', () => {
  let kv: ReturnType<typeof memoryKV>;
  let store: ReturnType<typeof createThreadStore>;
  beforeEach(() => { kv = memoryKV(); store = createThreadStore(kv); });

  it('returns null when no thread is stored for a URL', async () => {
    expect(await store.load('https://example.com', '/x')).toBeNull();
  });

  it('saves and loads a thread by origin+pathname', async () => {
    const t = makeThread({ id: 'https://example.com/x', origin: 'https://example.com', pathname: '/x' });
    await store.save(t);
    const back = await store.load('https://example.com', '/x');
    expect(back?.id).toBe(t.id);
  });

  it('updates the index entry on save', async () => {
    const t = makeThread({ id: 'https://example.com/x', origin: 'https://example.com', pathname: '/x' });
    await store.save(t);
    const idx = await store.loadIndex();
    expect(idx.find(e => e.id === t.id)).toBeTruthy();
  });

  it('skips restoration when older than the window', async () => {
    const oldTs = Date.now() - RESTORATION_WINDOW_MS - 1000;
    const t = makeThread({
      id: 'https://example.com/old',
      origin: 'https://example.com',
      pathname: '/old',
      lastTouchedAt: oldTs,
    });
    await store.save(t);
    expect(await store.loadIfFresh('https://example.com', '/old')).toBeNull();
  });

  it('returns the thread when inside the restoration window', async () => {
    const t = makeThread({
      id: 'https://example.com/fresh',
      origin: 'https://example.com',
      pathname: '/fresh',
      lastTouchedAt: Date.now() - 1000,
    });
    await store.save(t);
    expect(await store.loadIfFresh('https://example.com', '/fresh')).not.toBeNull();
  });

  it('evicts the oldest thread when over MAX_ACTIVE_THREADS', async () => {
    for (let i = 0; i < MAX_ACTIVE_THREADS + 2; i++) {
      const t = makeThread({
        id: `https://example.com/p${i}`,
        origin: 'https://example.com',
        pathname: `/p${i}`,
        lastTouchedAt: i,    // small ts → oldest
      });
      await store.save(t);
    }
    const idx = await store.loadIndex();
    expect(idx.filter(e => !e.archived).length).toBe(MAX_ACTIVE_THREADS);
    // p0 (oldest) should be gone.
    expect(await store.load('https://example.com', '/p0')).toBeNull();
    // p1 was the second-oldest; also gone since we added two over the cap.
    expect(await store.load('https://example.com', '/p1')).toBeNull();
  });

  it('archive() moves a thread aside and removes its active key', async () => {
    const t = makeThread({ id: 'https://example.com/a', origin: 'https://example.com', pathname: '/a' });
    await store.save(t);
    await store.archive('https://example.com', '/a');
    expect(await store.load('https://example.com', '/a')).toBeNull();
    const idx = await store.loadIndex();
    expect(idx.find(e => e.id === t.id)?.archived).toBe(true);
  });
});

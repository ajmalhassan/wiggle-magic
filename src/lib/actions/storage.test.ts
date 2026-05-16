// src/lib/actions/storage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createActionsStorage } from './storage';
import { memoryKV } from '../storage';
import { makeAction } from '../test-fixtures';

describe('actions storage', () => {
  let store: ReturnType<typeof createActionsStorage>;
  beforeEach(() => { store = createActionsStorage(memoryKV()); });

  it('returns empty defaults when nothing is stored', async () => {
    expect(await store.loadUserActions()).toEqual([]);
    expect(await store.loadHeroOrder()).toEqual([]);
    expect(await store.loadHidden()).toEqual([]);
    expect(await store.loadEnabledLibrary()).toEqual([]);
  });

  it('round-trips a user action', async () => {
    const a = makeAction({ id: 'my-action' });
    await store.saveUserActions([a]);
    const back = await store.loadUserActions();
    expect(back).toHaveLength(1);
    expect(back[0].id).toBe('my-action');
  });

  it('round-trips hero order', async () => {
    await store.saveHeroOrder(['summarize', 'compare']);
    expect(await store.loadHeroOrder()).toEqual(['summarize', 'compare']);
  });

  it('round-trips hidden and enabled-library sets', async () => {
    await store.saveHidden(['ask']);
    await store.saveEnabledLibrary(['eli5', 'counter-argument']);
    expect(await store.loadHidden()).toEqual(['ask']);
    expect(await store.loadEnabledLibrary()).toEqual(['eli5', 'counter-argument']);
  });
});

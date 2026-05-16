// src/lib/actions/registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createRegistry } from './registry';
import { memoryKV } from '../storage';
import { makeContext, makePick } from '../test-fixtures';

describe('ActionRegistry', () => {
  it('initializes with built-in core only when no user state stored', async () => {
    const r = await createRegistry(memoryKV());
    const ids = r.getAll().map(a => a.id).sort();
    expect(ids).toEqual(['ask', 'compare', 'summarize']);
  });

  it('seeds default hero order with [summarize, compare] on first run', async () => {
    const kv = memoryKV();
    await createRegistry(kv);
    const stored = await kv.get('wm:actions:hero');
    expect(stored).toEqual(['summarize', 'compare']);
  });

  it('includes enabled library entries in getAll', async () => {
    const kv = memoryKV();
    await kv.set('wm:actions:enabled-library', ['eli5']);
    const r = await createRegistry(kv);
    expect(r.getAll().some(a => a.id === 'eli5')).toBe(true);
  });

  it('excludes hidden ids from getAll', async () => {
    const kv = memoryKV();
    await kv.set('wm:actions:hidden', ['compare']);
    const r = await createRegistry(kv);
    expect(r.getAll().some(a => a.id === 'compare')).toBe(false);
  });

  it('getVisibleHeroes uses ranker output', async () => {
    const r = await createRegistry(memoryKV());
    const ctx = makeContext({ picks: [makePick(), makePick({ id: 'b' })] });
    const out = r.getVisibleHeroes(ctx);
    expect(out.map(a => a.id)).toEqual(['summarize', 'compare']);
  });

  it('getSlashOptions returns surface-slash actions that pass availability', async () => {
    const r = await createRegistry(memoryKV());
    const ctx = makeContext({ picks: [makePick()] });
    const out = r.getSlashOptions(ctx);
    const ids = out.map(a => a.id);
    expect(ids).toContain('summarize');
    expect(ids).toContain('ask');
    expect(ids).not.toContain('compare');     // compare needs 2+ picks
  });

  it('enableFromLibrary persists the id', async () => {
    const kv = memoryKV();
    const r = await createRegistry(kv);
    const res = await r.enableFromLibrary('eli5');
    expect(res.ok).toBe(true);
    expect(await kv.get('wm:actions:enabled-library')).toEqual(['eli5']);
  });

  it('enableFromLibrary rejects an unknown id', async () => {
    const r = await createRegistry(memoryKV());
    const res = await r.enableFromLibrary('not-real');
    expect(res.ok).toBe(false);
  });

  it('registerUser validates and persists', async () => {
    const kv = memoryKV();
    const r = await createRegistry(kv);
    const def = {
      id: 'my-act',
      label: 'My',
      source: 'user' as const,
      surface: ['slash'] as ('hero' | 'slash')[],
      acceptsFreeText: false,
      acceptsModifiers: [],
      availableWhen: { kind: 'always' as const },
      prompt: { user: 'Do {{selections}}' },
      apiPreference: 'prompt' as const,
    };
    const res = await r.registerUser(def);
    expect(res.ok).toBe(true);
    expect(r.getById('my-act')).toBeTruthy();
  });

  it('rankForContext orders arbitrary candidate sets by tag-match against context', async () => {
    const r = await createRegistry(memoryKV());
    const ctx = makeContext({ picks: [makePick({ tags: ['code'] })] });
    // ask + summarize: summarize matches text type, ask has no tags.
    // Order by score (1 for summarize, 0 for ask) then label.
    const out = r.rankForContext(ctx, [r.getById('ask')!, r.getById('summarize')!]);
    expect(out.map(a => a.id)).toEqual(['summarize', 'ask']);
  });

  it('registerUser rejects invalid action', async () => {
    const r = await createRegistry(memoryKV());
    const res = await r.registerUser({
      id: '',
      label: '',
      source: 'user',
      surface: [],
      acceptsFreeText: false,
      acceptsModifiers: [],
      availableWhen: { kind: 'always' },
      prompt: { user: '' },
      apiPreference: 'prompt',
    });
    expect(res.ok).toBe(false);
  });
});

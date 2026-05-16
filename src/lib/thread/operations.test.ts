// src/lib/thread/operations.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createThreadOperations, MAX_TURNS_PER_THREAD } from './operations';
import { createThreadStore } from './store';
import { memoryKV } from '../storage';
import { makeThread, makeUserTurn, makeMagicTurn } from '../test-fixtures';
import type { MagicTurn } from '../types/thread';
import type { MemoryEntry } from '../types';

describe('thread operations', () => {
  let kv: ReturnType<typeof memoryKV>;
  let store: ReturnType<typeof createThreadStore>;
  let ops: ReturnType<typeof createThreadOperations>;
  beforeEach(() => {
    kv = memoryKV();
    store = createThreadStore(kv);
    ops = createThreadOperations(store, kv);
  });

  it('appendTurn adds a turn and bumps lastTouchedAt', async () => {
    const t = makeThread();
    await store.save(t);
    const before = t.lastTouchedAt;
    await new Promise(r => setTimeout(r, 5));
    const updated = await ops.appendTurn(t.origin, t.pathname, makeUserTurn());
    expect(updated.turns).toHaveLength(1);
    expect(updated.lastTouchedAt).toBeGreaterThan(before);
  });

  it('appendTurn trims to MAX_TURNS_PER_THREAD when over cap', async () => {
    const t = makeThread();
    for (let i = 0; i < MAX_TURNS_PER_THREAD; i++) {
      t.turns.push(makeUserTurn({ id: `seed-${i}` }));
    }
    await store.save(t);
    const updated = await ops.appendTurn(t.origin, t.pathname, makeUserTurn({ id: 'fresh' }));
    expect(updated.turns).toHaveLength(MAX_TURNS_PER_THREAD);
    expect(updated.turns[updated.turns.length - 1].id).toBe('fresh');
    expect(updated.turns[0].id).toBe('seed-1');     // first seed evicted
  });

  it('rerunTurn replaces the matching Magic turn in place', async () => {
    const t = makeThread();
    t.turns.push(makeUserTurn());
    t.turns.push(makeMagicTurn({ id: 't-magic-old', answer: 'OLD' }));
    await store.save(t);

    const replacement = makeMagicTurn({ id: 't-magic-new', answer: 'NEW' });
    const updated = await ops.rerunTurn(t.origin, t.pathname, 't-magic-old', replacement);
    expect(updated.turns).toHaveLength(2);
    const last = updated.turns[updated.turns.length - 1] as MagicTurn;
    expect(last.id).toBe('t-magic-new');
    expect(last.answer).toBe('NEW');
  });

  it('promoteToMemory appends a MemoryEntry mapped from the turn', async () => {
    const t = makeThread();
    const user = makeUserTurn({ kind: 'ask', actionId: 'ask', text: 'why?' });
    const magic = makeMagicTurn({ inReplyTo: user.id, answer: 'because.' });
    t.turns.push(user, magic);
    await store.save(t);

    await ops.promoteToMemory(t, magic);

    const mem = (await kv.get<MemoryEntry[]>('wm_memory')) ?? [];
    expect(mem).toHaveLength(1);
    expect(mem[0].question).toBe('why?');
    expect(mem[0].answer).toBe('because.');
    expect(mem[0].action).toBe('ask');
    expect(mem[0].selections?.length).toBeGreaterThan(0);
  });

  it('promoteToMemory maps actionId to legacy MemoryAction', async () => {
    const t = makeThread();
    const user = makeUserTurn({ actionId: 'summarize', kind: 'hero', text: undefined });
    const magic = makeMagicTurn({ inReplyTo: user.id });
    t.turns.push(user, magic);
    await store.save(t);

    await ops.promoteToMemory(t, magic);
    const mem = (await kv.get<MemoryEntry[]>('wm_memory')) ?? [];
    expect(mem[0].action).toBe('summary');           // legacy mapping: summarize → summary
  });
});

// src/lib/actions/ranker.test.ts
import { describe, it, expect } from 'vitest';
import { rankHeroes } from './ranker';
import { makeAction, makeContext, makePick, makePageMeta } from '../test-fixtures';
import type { ActionDef } from '../types/action';

const a = (id: string, overrides: Partial<ActionDef> = {}) =>
  makeAction({ id, label: id, surface: ['hero', 'slash'], ...overrides });

describe('rankHeroes', () => {
  it('filters out actions whose availableWhen fails', () => {
    const actions = [
      a('summarize', { availableWhen: { kind: 'minPicks', n: 1 } }),
      a('compare',   { availableWhen: { kind: 'minPicks', n: 2 } }),
    ];
    const heroPin = ['summarize', 'compare'];
    const out = rankHeroes(actions, heroPin, makeContext({ picks: [makePick()] }));
    expect(out.visible.map(x => x.id)).toEqual(['summarize']);
    expect(out.overflow).toEqual([]);
  });

  it('only considers actions whose id is in the user hero pin set', () => {
    const actions = [
      a('summarize'),
      a('eli5'),
      a('compare', { availableWhen: { kind: 'minPicks', n: 2 } }),
    ];
    const heroPin = ['eli5'];
    const out = rankHeroes(actions, heroPin, makeContext({ picks: [makePick()] }));
    expect(out.visible.map(x => x.id)).toEqual(['eli5']);
  });

  it('orders by score (tag match) desc, then by pin order, then by label', () => {
    const actions = [
      a('plain', { tags: undefined }),
      a('codey', { tags: { picksContains: ['code'] } }),
      a('texty', { tags: { picksContains: ['text'] } }),
    ];
    const heroPin = ['plain', 'codey', 'texty'];
    const ctx = makeContext({ picks: [makePick({ tags: ['code'] })] });
    const out = rankHeroes(actions, heroPin, ctx);
    expect(out.visible.map(x => x.id)).toEqual(['codey', 'texty', 'plain']);
  });

  it('respects user pin order on ties', () => {
    const actions = [a('alpha'), a('beta')];
    const heroPin = ['beta', 'alpha'];
    const out = rankHeroes(actions, heroPin, makeContext());
    expect(out.visible.map(x => x.id)).toEqual(['beta', 'alpha']);
  });

  it('caps visible at 4 and pushes the rest to overflow', () => {
    const actions = [a('a'), a('b'), a('c'), a('d'), a('e'), a('f')];
    const heroPin = ['a', 'b', 'c', 'd', 'e', 'f'];
    const out = rankHeroes(actions, heroPin, makeContext());
    expect(out.visible.map(x => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(out.overflow.map(x => x.id)).toEqual(['e', 'f']);
  });

  it('matches against pageMeta.pageType', () => {
    const actions = [
      a('plain'),
      a('producty', { tags: { pageType: ['product'] } }),
    ];
    const heroPin = ['plain', 'producty'];
    const ctx = makeContext({ pageMeta: makePageMeta({ pageType: 'product' }) });
    const out = rankHeroes(actions, heroPin, ctx);
    expect(out.visible.map(x => x.id)).toEqual(['producty', 'plain']);
  });
});

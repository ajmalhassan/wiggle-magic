// src/lib/actions/availability.test.ts
import { describe, it, expect } from 'vitest';
import { isAvailable } from './availability';
import { makeContext, makePick } from '../test-fixtures';
import type { AvailabilityRule } from '../types/action';

describe('isAvailable', () => {
  it('always: true regardless of picks', () => {
    const rule: AvailabilityRule = { kind: 'always' };
    expect(isAvailable(rule, makeContext({ picks: [] }))).toBe(true);
    expect(isAvailable(rule, makeContext({ picks: [makePick()] }))).toBe(true);
  });

  it('minPicks: passes when picks length ≥ n', () => {
    const rule: AvailabilityRule = { kind: 'minPicks', n: 2 };
    expect(isAvailable(rule, makeContext({ picks: [makePick()] }))).toBe(false);
    expect(isAvailable(rule, makeContext({ picks: [makePick(), makePick({ id: 'b' })] }))).toBe(true);
  });

  it('pickTypesIncludes: minCount defaults to 1', () => {
    const rule: AvailabilityRule = { kind: 'pickTypesIncludes', types: ['img'] };
    expect(isAvailable(rule, makeContext({ picks: [makePick({ type: 'text' })] }))).toBe(false);
    expect(isAvailable(rule, makeContext({ picks: [makePick({ type: 'img' })] }))).toBe(true);
  });

  it('pickTypesIncludes: respects minCount', () => {
    const rule: AvailabilityRule = { kind: 'pickTypesIncludes', types: ['text'], minCount: 2 };
    expect(isAvailable(rule, makeContext({ picks: [makePick()] }))).toBe(false);
    const twoText = [makePick({ id: 'a' }), makePick({ id: 'b' })];
    expect(isAvailable(rule, makeContext({ picks: twoText }))).toBe(true);
  });

  it('pickTagsIncludes: matches by tag', () => {
    const rule: AvailabilityRule = { kind: 'pickTagsIncludes', tags: ['code'] };
    expect(isAvailable(rule, makeContext({ picks: [makePick({ tags: ['code'] })] }))).toBe(true);
    expect(isAvailable(rule, makeContext({ picks: [makePick({ tags: [] })] }))).toBe(false);
  });

  it('and: requires every sub-rule to pass', () => {
    const rule: AvailabilityRule = {
      kind: 'and',
      rules: [
        { kind: 'minPicks', n: 2 },
        { kind: 'pickTypesIncludes', types: ['text'] },
      ],
    };
    const two = [makePick({ id: 'a' }), makePick({ id: 'b' })];
    expect(isAvailable(rule, makeContext({ picks: two }))).toBe(true);
    expect(isAvailable(rule, makeContext({ picks: [makePick()] }))).toBe(false);
    const twoImg = [makePick({ id: 'a', type: 'img' }), makePick({ id: 'b', type: 'img' })];
    expect(isAvailable(rule, makeContext({ picks: twoImg }))).toBe(false);
  });
});

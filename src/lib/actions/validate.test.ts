// src/lib/actions/validate.test.ts
import { describe, it, expect } from 'vitest';
import { validateAction } from './validate';
import { makeAction } from '../test-fixtures';

describe('validateAction', () => {
  it('accepts a well-formed action', () => {
    expect(validateAction(makeAction()).ok).toBe(true);
  });

  it('rejects an empty id', () => {
    const r = validateAction(makeAction({ id: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'id')).toBe(true);
  });

  it('rejects an id with invalid chars', () => {
    const r = validateAction(makeAction({ id: 'Bad ID!' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'id')).toBe(true);
  });

  it('rejects a label over 40 chars', () => {
    const r = validateAction(makeAction({ label: 'x'.repeat(41) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'label')).toBe(true);
  });

  it('rejects an empty user prompt', () => {
    const r = validateAction(makeAction({ prompt: { user: '' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'prompt.user')).toBe(true);
  });

  it('rejects unknown placeholder in prompt', () => {
    const r = validateAction(makeAction({ prompt: { user: 'Hi {{nope}}' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'prompt.user')).toBe(true);
  });

  it('rejects unknown apiPreference', () => {
    const r = validateAction(makeAction({ apiPreference: 'magic' as any }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'apiPreference')).toBe(true);
  });

  it('rejects empty surface array', () => {
    const r = validateAction(makeAction({ surface: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'surface')).toBe(true);
  });

  it('rejects an availableWhen with unknown kind', () => {
    const r = validateAction(makeAction({ availableWhen: { kind: 'bogus' } as any }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'availableWhen')).toBe(true);
  });

  it('rejects an availableWhen.minPicks without n', () => {
    const r = validateAction(makeAction({ availableWhen: { kind: 'minPicks' } as any }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'availableWhen')).toBe(true);
  });

  it('rejects an availableWhen.and with non-array rules', () => {
    const r = validateAction(makeAction({ availableWhen: { kind: 'and', rules: 'nope' } as any }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'availableWhen')).toBe(true);
  });

  it('rejects an availableWhen.pickTypesIncludes without types array', () => {
    const r = validateAction(makeAction({ availableWhen: { kind: 'pickTypesIncludes' } as any }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'availableWhen')).toBe(true);
  });

  it('rejects minPicks with non-positive n', () => {
    const r = validateAction(makeAction({ availableWhen: { kind: 'minPicks', n: 0 } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'availableWhen')).toBe(true);
  });

  it('rejects minPicks with non-integer n', () => {
    const r = validateAction(makeAction({ availableWhen: { kind: 'minPicks', n: 1.5 } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'availableWhen')).toBe(true);
  });

  it('rejects pickTypesIncludes with empty types array', () => {
    const r = validateAction(makeAction({ availableWhen: { kind: 'pickTypesIncludes', types: [] } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'availableWhen')).toBe(true);
  });

  it('rejects pickTypesIncludes with unknown type value', () => {
    const r = validateAction(makeAction({ availableWhen: { kind: 'pickTypesIncludes', types: ['bogus' as any] } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'availableWhen')).toBe(true);
  });

  it('rejects pickTagsIncludes with empty tags array', () => {
    const r = validateAction(makeAction({ availableWhen: { kind: 'pickTagsIncludes', tags: [] } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'availableWhen')).toBe(true);
  });

  it('rejects pickTagsIncludes with unknown tag value', () => {
    const r = validateAction(makeAction({ availableWhen: { kind: 'pickTagsIncludes', tags: ['nope' as any] } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'availableWhen')).toBe(true);
  });

  it('rejects and with empty rules array', () => {
    const r = validateAction(makeAction({ availableWhen: { kind: 'and', rules: [] } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'availableWhen')).toBe(true);
  });

  it('rejects and with a nested invalid rule', () => {
    const r = validateAction(makeAction({
      availableWhen: { kind: 'and', rules: [{ kind: 'minPicks', n: 0 }] },
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field.startsWith('availableWhen.rules['))).toBe(true);
  });

  it('accepts valid pickTypesIncludes and pickTagsIncludes with minCount', () => {
    expect(validateAction(makeAction({
      availableWhen: { kind: 'pickTypesIncludes', types: ['text', 'img'], minCount: 2 },
    })).ok).toBe(true);
    expect(validateAction(makeAction({
      availableWhen: { kind: 'pickTagsIncludes', tags: ['code', 'table'], minCount: 1 },
    })).ok).toBe(true);
  });

  it('accumulates multiple errors', () => {
    const r = validateAction(makeAction({ id: '', label: '', prompt: { user: '' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});

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

  it('accumulates multiple errors', () => {
    const r = validateAction(makeAction({ id: '', label: '', prompt: { user: '' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});

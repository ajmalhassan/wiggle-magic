// src/lib/actions/builtins/builtins.test.ts
import { describe, it, expect } from 'vitest';
import { BUILTIN_CORE_ACTIONS } from './index';
import { validateAction } from '../validate';

describe('built-in core actions', () => {
  for (const def of BUILTIN_CORE_ACTIONS) {
    it(`${def.id} passes validation`, () => {
      const result = validateAction(def);
      if (!result.ok) {
        // Surface the error fields directly in the assertion message.
        throw new Error(`${def.id} failed validation: ${JSON.stringify(result.errors)}`);
      }
      expect(result.ok).toBe(true);
    });
  }

  it('ids are unique', () => {
    const ids = BUILTIN_CORE_ACTIONS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every built-in core has source = builtin-core', () => {
    for (const a of BUILTIN_CORE_ACTIONS) {
      expect(a.source).toBe('builtin-core');
    }
  });
});

// src/lib/actions/library.test.ts
import { describe, it, expect } from 'vitest';
import { LIBRARY_ACTIONS } from './library';
import { validateAction } from './validate';

describe('library actions', () => {
  for (const def of LIBRARY_ACTIONS) {
    it(`${def.id} passes validation`, () => {
      const result = validateAction(def);
      if (!result.ok) {
        throw new Error(`${def.id} failed validation: ${JSON.stringify(result.errors)}`);
      }
      expect(result.ok).toBe(true);
    });

    it(`${def.id} has a description (required for library entries)`, () => {
      expect(def.description).toBeTruthy();
    });

    it(`${def.id} has source = builtin-library`, () => {
      expect(def.source).toBe('builtin-library');
    });
  }

  it('ids are unique across the library', () => {
    const ids = LIBRARY_ACTIONS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no library id collides with a built-in core id', () => {
    const coreIds = new Set(['summarize', 'compare', 'ask']);
    for (const a of LIBRARY_ACTIONS) {
      expect(coreIds.has(a.id)).toBe(false);
    }
  });
});

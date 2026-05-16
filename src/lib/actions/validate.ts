// src/lib/actions/validate.ts
import type { ActionDef, ValidateResult, ApiPref } from '../types/action';
import { ALLOWED_PLACEHOLDERS } from './prompt-builder';

const ID_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;
const VALID_API_PREFS: ApiPref[] = ['summarizer', 'prompt', 'translator'];
const VALID_SURFACES = ['hero', 'slash'] as const;

export function validateAction(def: ActionDef): ValidateResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (!def.id || !ID_PATTERN.test(def.id)) {
    errors.push({ field: 'id', message: 'must be 2-31 lowercase chars: [a-z][a-z0-9-]*' });
  }

  if (!def.label || def.label.trim().length === 0) {
    errors.push({ field: 'label', message: 'must be non-empty' });
  } else if (def.label.length > 40) {
    errors.push({ field: 'label', message: 'must be ≤ 40 characters' });
  }

  if (!def.prompt || !def.prompt.user || def.prompt.user.trim().length === 0) {
    errors.push({ field: 'prompt.user', message: 'must be non-empty' });
  } else {
    // Use a fresh regex each call to avoid stale lastIndex on the /g flag
    const placeholderPattern = /\{\{([a-zA-Z]+)\}\}/g;
    const used = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = placeholderPattern.exec(def.prompt.user)) !== null) {
      used.add(m[1]);
    }
    for (const ph of used) {
      if (!(ALLOWED_PLACEHOLDERS as readonly string[]).includes(ph)) {
        errors.push({ field: 'prompt.user', message: `unknown placeholder {{${ph}}}` });
      }
    }
  }

  if (!VALID_API_PREFS.includes(def.apiPreference)) {
    errors.push({ field: 'apiPreference', message: `must be one of ${VALID_API_PREFS.join(', ')}` });
  }

  if (!def.surface || def.surface.length === 0) {
    errors.push({ field: 'surface', message: 'must include at least one of hero, slash' });
  } else {
    for (const s of def.surface) {
      if (!(VALID_SURFACES as readonly string[]).includes(s)) {
        errors.push({ field: 'surface', message: `unknown surface: ${s}` });
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

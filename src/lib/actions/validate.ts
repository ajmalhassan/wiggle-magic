// src/lib/actions/validate.ts
import type { ActionDef, ValidateResult, ApiPref } from '../types/action';
import { ALLOWED_PLACEHOLDERS } from './prompt-builder';

const ID_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;

const VALID_AVAILABILITY_KINDS = [
  'always', 'minPicks', 'pickTypesIncludes', 'pickTagsIncludes', 'and',
] as const;

const VALID_PICK_TYPES = ['text', 'img', 'link', 'control', 'media'] as const;
const VALID_PICK_TAGS = ['code', 'table', 'price', 'video', 'long', 'short'] as const;

function validateAvailability(
  rule: unknown,
  field: string,
  errors: Array<{ field: string; message: string }>,
): void {
  if (!rule || typeof rule !== 'object') {
    errors.push({ field, message: 'must be an object' });
    return;
  }
  const r = rule as { kind?: string; [k: string]: unknown };
  if (!r.kind || !(VALID_AVAILABILITY_KINDS as readonly string[]).includes(r.kind)) {
    errors.push({ field, message: `unknown kind: ${r.kind ?? '(missing)'}` });
    return;
  }
  switch (r.kind) {
    case 'minPicks':
      if (typeof r.n !== 'number' || !Number.isInteger(r.n) || r.n <= 0) {
        errors.push({ field, message: 'minPicks requires positive integer n' });
      }
      break;
    case 'pickTypesIncludes':
      if (!Array.isArray(r.types) || r.types.length === 0) {
        errors.push({ field, message: 'pickTypesIncludes requires non-empty types array' });
      } else {
        for (const t of r.types) {
          if (!(VALID_PICK_TYPES as readonly string[]).includes(t)) {
            errors.push({ field, message: `pickTypesIncludes has unknown type: ${t}` });
          }
        }
      }
      break;
    case 'pickTagsIncludes':
      if (!Array.isArray(r.tags) || r.tags.length === 0) {
        errors.push({ field, message: 'pickTagsIncludes requires non-empty tags array' });
      } else {
        for (const t of r.tags) {
          if (!(VALID_PICK_TAGS as readonly string[]).includes(t)) {
            errors.push({ field, message: `pickTagsIncludes has unknown tag: ${t}` });
          }
        }
      }
      break;
    case 'and':
      if (!Array.isArray(r.rules) || r.rules.length === 0) {
        errors.push({ field, message: 'and requires non-empty rules array' });
      } else {
        r.rules.forEach((sub, i) => validateAvailability(sub, `${field}.rules[${i}]`, errors));
      }
      break;
    // 'always' has no extra fields.
  }
}
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

  validateAvailability(def.availableWhen, 'availableWhen', errors);

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

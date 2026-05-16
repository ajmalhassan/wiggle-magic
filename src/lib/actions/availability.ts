// src/lib/actions/availability.ts
import type { AvailabilityRule, ActionContext } from '../types/action';

export function isAvailable(rule: AvailabilityRule, ctx: ActionContext): boolean {
  switch (rule.kind) {
    case 'always':
      return true;
    case 'minPicks':
      return ctx.picks.length >= rule.n;
    case 'pickTypesIncludes': {
      const need = rule.minCount ?? 1;
      const count = ctx.picks.filter(p => rule.types.includes(p.type)).length;
      return count >= need;
    }
    case 'pickTagsIncludes': {
      const need = rule.minCount ?? 1;
      const count = ctx.picks.filter(p => p.tags.some(t => rule.tags.includes(t))).length;
      return count >= need;
    }
    case 'and':
      return rule.rules.every(r => isAvailable(r, ctx));
  }
}

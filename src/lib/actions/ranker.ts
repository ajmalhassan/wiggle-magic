// src/lib/actions/ranker.ts
import type { ActionDef, ActionContext } from '../types/action';
import { isAvailable } from './availability';

export interface RankedHeroes {
  visible: ActionDef[];    // top N up to MAX_VISIBLE
  overflow: ActionDef[];   // hero-pinned but pushed to slash for this context
}

export const MAX_VISIBLE_HEROES = 4;

function tagScore(def: ActionDef, ctx: ActionContext): number {
  const tags = def.tags;
  if (!tags) return 0;
  let score = 0;

  if (tags.picksContains) {
    const pickTags = new Set<string>();
    for (const p of ctx.picks) {
      pickTags.add(p.type);
      for (const t of p.tags) pickTags.add(t);
    }
    for (const want of tags.picksContains) {
      if (pickTags.has(want)) score += 1;
    }
  }

  if (tags.pageType && ctx.pageMeta.pageType && tags.pageType.includes(ctx.pageMeta.pageType)) {
    score += 1;
  }

  if (tags.language && tags.language.includes(ctx.pageMeta.primaryLang)) {
    score += 1;
  }

  return score;
}

export function rankHeroes(
  allActions: ActionDef[],
  heroPinOrder: string[],
  ctx: ActionContext
): RankedHeroes {
  const pinIndex = new Map(heroPinOrder.map((id, i) => [id, i]));

  const eligible = allActions
    .filter(a => pinIndex.has(a.id))
    .filter(a => a.surface.includes('hero'))
    .filter(a => isAvailable(a.availableWhen, ctx));

  const ranked = eligible
    .map(a => ({ a, score: tagScore(a, ctx), pin: pinIndex.get(a.id)! }))
    .sort((x, y) => {
      if (x.score !== y.score) return y.score - x.score;
      if (x.pin !== y.pin) return x.pin - y.pin;
      return x.a.label.localeCompare(y.a.label);
    })
    .map(({ a }) => a);

  return {
    visible: ranked.slice(0, MAX_VISIBLE_HEROES),
    overflow: ranked.slice(MAX_VISIBLE_HEROES),
  };
}

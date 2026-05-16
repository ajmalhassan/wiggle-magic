// src/lib/actions/builtins/compare.ts
import type { ActionDef } from '../../types/action';

export const COMPARE: ActionDef = {
  id: 'compare',
  label: 'Compare',
  icon: 'compare',
  source: 'builtin-core',
  surface: ['hero', 'slash'],
  acceptsFreeText: false,
  acceptsModifiers: ['bullets', 'shorter'],
  availableWhen: {
    kind: 'and',
    rules: [
      { kind: 'minPicks', n: 2 },
      { kind: 'pickTypesIncludes', types: ['text', 'img', 'link', 'media'], minCount: 2 },
    ],
  },
  apiPreference: 'prompt',
  prompt: {
    system: 'You compare items side-by-side and highlight what genuinely differs.',
    user:
      'Compare the following selections from "{{title}}". ' +
      'For each pair, identify what is the same, what is different, and which (if any) seems stronger and why.\n\n' +
      '{{selections}}',
  },
  description: 'Side-by-side comparison across two or more comparable items.',
  tags: {
    picksContains: ['text', 'img', 'link'],
    pageType: ['product', 'article'],
  },
};

// src/lib/actions/builtins/summarize.ts
import type { ActionDef } from '../../types/action';

export const SUMMARIZE: ActionDef = {
  id: 'summarize',
  label: 'Summarize',
  icon: 'sparkle',
  source: 'builtin-core',
  surface: ['hero', 'slash'],
  acceptsFreeText: false,
  acceptsModifiers: ['bullets', 'shorter'],
  availableWhen: { kind: 'minPicks', n: 1 },
  apiPreference: 'summarizer',
  fallback: ['prompt'],
  prompt: {
    system: 'You write tight, cohesive summaries across multiple selections from a web page.',
    user:
      'Summarize the following selections from "{{title}}" into one cohesive answer. ' +
      'Do not list them separately — synthesize.\n\n{{selections}}',
  },
  description: 'One cohesive summary across the selections.',
  tags: {
    picksContains: ['text'],
  },
};

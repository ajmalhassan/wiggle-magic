// src/lib/actions/builtins/ask.ts
import type { ActionDef } from '../../types/action';

export const ASK: ActionDef = {
  id: 'ask',
  label: 'Ask',
  icon: 'sparkle',
  source: 'builtin-core',
  surface: ['slash'],            // never a hero — Ask lives in the composer's free-text slot
  acceptsFreeText: true,
  acceptsModifiers: ['bullets', 'shorter'],
  availableWhen: { kind: 'minPicks', n: 1 },
  apiPreference: 'prompt',
  prompt: {
    system: 'You answer questions about specific selections from a web page. Stay grounded in the selections.',
    user:
      'Page: {{title}}\nSelections:\n{{selections}}\n\nQuestion: {{question}}',
  },
  description: 'Free-text question about the selections.',
};

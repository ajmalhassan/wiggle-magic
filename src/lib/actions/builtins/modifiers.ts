// src/lib/actions/builtins/modifiers.ts
import type { ModifierDef } from '../../types/action';

export const BUILTIN_MODIFIERS: ModifierDef[] = [
  {
    id: 'bullets',
    label: 'Bullets',
    surface: ['slash', 'inline'],
    promptAddendum: 'Format the answer as a tight bulleted list. Lead each bullet with the key noun phrase.',
  },
  {
    id: 'shorter',
    label: 'Shorter',
    surface: ['inline'],
    promptAddendum: 'Cut the answer to roughly half its previous length while preserving the most important points.',
  },
];

// src/lib/actions/library.ts
import type { ActionDef } from '../types/action';

/**
 * In-bundle catalog of curated, prompt-engineered actions. Users browse this
 * in Options → Actions → Library and enable the ones they want. Each entry is
 * a fully populated ActionDef with `source: 'builtin-library'` and a plain-
 * English `description` for the catalog UI.
 */
export const LIBRARY_ACTIONS: ActionDef[] = [
  {
    id: 'eli5',
    label: 'ELI5',
    icon: '🔍',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: ['shorter'],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      system: 'You explain things like the listener is five — concrete, vivid, no jargon.',
      user:
        'Explain the following selections like I am five years old. ' +
        'Use vivid analogies. Avoid jargon entirely.\n\n{{selections}}',
    },
    description: 'Explain like I’m five. Great for jargon-heavy articles, legal text, technical content.',
    tags: { picksContains: ['text'], pageType: ['article'] },
  },
  {
    id: 'counter-argument',
    label: 'Counter-argument',
    icon: '⚖',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: ['bullets', 'shorter'],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      user:
        'Make the strongest counter-argument to the claim(s) in the selections. ' +
        'Steelman the opposing position; don’t strawman.\n\n{{selections}}',
    },
    description: 'Find the strongest case against the selected claim.',
    tags: { picksContains: ['text'], pageType: ['article', 'social'] },
  },
  {
    id: 'find-the-flaw',
    label: 'Find the flaw',
    icon: '🐛',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: ['bullets'],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      user:
        'Find the most important flaw, missing assumption, or logical gap in the reasoning of the following. ' +
        'Be specific about why it matters.\n\n{{selections}}',
    },
    description: 'Spot logical gaps in claims and technical proposals.',
    tags: { picksContains: ['text', 'code'] },
  },
  {
    id: 'pros-cons',
    label: 'Pros & cons',
    icon: '⚖',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: ['shorter'],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      user:
        'List the most important pros and cons of the following selection(s). ' +
        'Aim for 3-5 of each. Be concrete; cite the source selection when possible.\n\n{{selections}}',
    },
    description: 'Decisions, product comparisons, life choices.',
    tags: { picksContains: ['text', 'link'], pageType: ['product', 'article'] },
  },
  {
    id: 'rewrite-clearly',
    label: 'Rewrite for clarity',
    icon: '✍',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: ['shorter'],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      user:
        'Rewrite the following selection(s) for clarity. Keep the meaning intact; cut filler, ' +
        'untangle nested clauses, use plain words. Preserve any technical terms that carry weight.\n\n{{selections}}',
    },
    description: 'Untangle confusing paragraphs and dense prose.',
    tags: { picksContains: ['text'], pageType: ['article'] },
  },
  {
    id: 'action-items',
    label: 'Extract action items',
    icon: '✅',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: [],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      user:
        'Extract the action items from the following. Each item should be one short imperative line. ' +
        'If an item has an owner or deadline mentioned, include it in parentheses. ' +
        'If nothing actionable is present, say so.\n\n{{selections}}',
    },
    description: 'Pull a to-do list out of meeting notes, memos, email threads.',
    tags: { picksContains: ['text'] },
  },
  {
    id: 'followup-questions',
    label: 'Generate questions',
    icon: '❓',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: [],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      user:
        'Generate 5 sharp follow-up questions a thoughtful reader would ask after reading the following. ' +
        'Prioritize questions that probe unstated assumptions over surface-level clarifications.\n\n{{selections}}',
    },
    description: 'Research, learning, interview prep.',
    tags: { picksContains: ['text'], pageType: ['article'] },
  },
  {
    id: 'explain-code',
    label: 'Explain this code',
    icon: '💻',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: ['bullets', 'shorter'],
    availableWhen: { kind: 'pickTagsIncludes', tags: ['code'] },
    apiPreference: 'prompt',
    prompt: {
      system: 'You explain code clearly: what it does, how it works, and where the non-obvious parts live.',
      user:
        'Explain the following code from "{{title}}". Start with what it does in one line, ' +
        'then walk through the non-obvious mechanics.\n\n{{selections}}',
    },
    description: 'Auto-surfaces when you pick a code block.',
    tags: { picksContains: ['code'], pageType: ['code-host', 'article'] },
  },
  {
    id: 'suggest-headline',
    label: 'Better headline',
    icon: '📰',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: [],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      user:
        'Suggest 3 better headlines for the following content. ' +
        'The current headline (from page title) is "{{title}}". ' +
        'Each suggestion should be more specific and lead with the actual news.\n\n{{selections}}',
    },
    description: 'For articles where the headline buried the lede.',
    tags: { picksContains: ['text'], pageType: ['article'] },
  },
];

export const LIBRARY_IDS = new Set(LIBRARY_ACTIONS.map(a => a.id));

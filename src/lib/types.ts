// Shared types for entrypoints that talk through chrome.storage or message passing.
// Lives outside any entrypoint so the same shape can be imported by content,
// popup, and options without each redeclaring it.

export interface WmSettings {
  backend: string;
  provider: string;
  apiKey: string;
  model: string;
}

// SavedSelection is the persisted subset of a content-script Payload — see
// the entry build site in entrypoints/content/index.ts (saveCurrentAnswer).
// Drops runtime-only fields (aria, data, value, rect); makes optional fields
// optional because some elements lack text/link/image.
export interface SavedSelection {
  tag: string;
  text?: string;
  link?: { href: string; text?: string };
  image?: { src: string; alt?: string };
  selector?: string;
}

// Note: 'compare' is retained for back-compat with entries saved by earlier
// versions; new entries never write it.
export type MemoryAction = 'summary' | 'bullets' | 'ask' | 'compare';

export interface MemoryEntry {
  id: string;
  ts: number;
  url: string;
  title?: string;
  hostname: string;
  question: string;
  answer: string;
  selections?: SavedSelection[];
  /** Which hero action produced this answer. Optional for back-compat with pre-Spec-1 entries. */
  action?: MemoryAction;
}

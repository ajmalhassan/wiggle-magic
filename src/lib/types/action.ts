// src/lib/types/action.ts
import type { PickRef } from './thread';
import type { PickTag } from './payload';
import type { Thread, Backend } from './thread';

export type ApiPref = 'summarizer' | 'prompt' | 'translator';

export type AvailabilityRule =
  | { kind: 'always' }
  | { kind: 'minPicks'; n: number }
  | { kind: 'pickTypesIncludes'; types: PickRef['type'][]; minCount?: number }
  | { kind: 'pickTagsIncludes'; tags: PickTag[]; minCount?: number }
  | { kind: 'and'; rules: AvailabilityRule[] };

export interface PromptTemplate {
  system?: string;
  user: string;
}

export interface ActionTags {
  picksContains?: ('text' | 'img' | 'link' | 'code' | 'table' | 'price' | 'video')[];
  pageType?: ('article' | 'product' | 'code-host' | 'social' | 'media')[];
  language?: string[];
}

export interface ActionDef {
  id: string;
  label: string;
  icon?: string;
  source: 'builtin-core' | 'builtin-library' | 'user';
  surface: ('hero' | 'slash')[];
  acceptsFreeText: boolean;
  acceptsModifiers: string[];
  availableWhen: AvailabilityRule;
  prompt: PromptTemplate;
  apiPreference: ApiPref;
  fallback?: ApiPref[];
  description?: string;
  tags?: ActionTags;
  examples?: Array<{ input: string; output: string }>;
}

export interface ModifierDef {
  id: string;
  label: string;
  surface: ('slash' | 'inline')[];
  promptAddendum: string;
}

export interface PageMeta {
  host: string;
  title: string;
  primaryLang: string;
  pageType?: 'article' | 'product' | 'code-host' | 'social' | 'media';
}

export interface ActionContext {
  picks: PickRef[];
  thread: Thread | null;
  backend: Backend;
  pageMeta: PageMeta;
}

/**
 * Result of a validation pass. `ok: true` means the value is safe to use;
 * `ok: false` carries field-level errors for surfacing in the options editor.
 */
export type ValidateResult =
  | { ok: true }
  | { ok: false; errors: Array<{ field: string; message: string }> };

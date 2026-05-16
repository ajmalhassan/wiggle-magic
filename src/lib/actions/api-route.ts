// src/lib/actions/api-route.ts
import type { ApiPref } from '../types/action';
import type { BuiltPrompt } from './prompt-builder';

export interface AnswerStream {
  chunks(): AsyncIterable<string>;
  abort(): void;
}

/**
 * Minimal adapter shape: enough for the registry/router to introspect.
 * `run` is optional so tests/registry construction don't need it; the content
 * script's orchestrator requires it at call time.
 */
export interface ApiAdapter {
  name: ApiPref;
  available(): boolean;
  /**
   * Execute the adapter against a prompt. Returns an AnswerStream. Optional
   * because tests/registry construction don't need it; the content script's
   * orchestrator requires it at call time.
   */
  run?(prompt: BuiltPrompt, signal: AbortSignal): Promise<AnswerStream>;
}

export type AdapterMap = Record<ApiPref, ApiAdapter>;

export function selectAdapter(
  preferred: ApiPref,
  fallback: ApiPref[] | undefined,
  adapters: AdapterMap
): ApiAdapter | null {
  const chain: ApiPref[] = [preferred, ...(fallback ?? [])];
  for (const id of chain) {
    const a = adapters[id];
    if (a && a.available()) return a;
  }
  return null;
}

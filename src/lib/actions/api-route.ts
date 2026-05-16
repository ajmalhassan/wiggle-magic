// src/lib/actions/api-route.ts
import type { ApiPref } from '../types/action';

/**
 * Minimal adapter shape: enough for the registry/router to introspect.
 * The actual `run` method is added in Plan 2 when real Chrome AI / BYOK
 * adapters are wired. Keeping this lean here means the registry can be
 * tested without pulling in AI implementations.
 */
export interface ApiAdapter {
  name: ApiPref;
  available(): boolean;
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

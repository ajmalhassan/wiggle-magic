// src/lib/ai/backend.ts
import type { ApiPref } from '../types/action';
import type { Backend } from '../types/thread';

export interface BackendStatus {
  pref: ApiPref;
  available: boolean;
  reason?: string;
}

/**
 * Sniff each Chrome AI API's availability without instantiating it.
 * Synchronous-safe: only checks for the globals.
 */
export function probeAvailability(pref: ApiPref): BackendStatus {
  switch (pref) {
    case 'summarizer':
      return {
        pref,
        available: typeof (globalThis as any).Summarizer !== 'undefined'
                && typeof ((globalThis as any).Summarizer?.availability) === 'function',
      };
    case 'prompt':
      return {
        pref,
        available: typeof (globalThis as any).LanguageModel !== 'undefined'
                && typeof ((globalThis as any).LanguageModel?.availability) === 'function',
      };
    case 'translator':
      return {
        pref,
        available: typeof (globalThis as any).Translator !== 'undefined'
                && typeof ((globalThis as any).Translator?.availability) === 'function',
      };
  }
}

export function activeBackend(settings: { provider: string; backend: string }): Backend {
  if (settings.backend === 'nano') return 'nano';
  if (settings.provider === 'openai') return 'openai';
  if (settings.provider === 'anthropic') return 'anthropic';
  if (settings.provider === 'gemini') return 'gemini';
  return 'nano';
}

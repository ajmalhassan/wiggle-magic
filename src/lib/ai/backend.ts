// src/lib/ai/backend.ts
import type { Backend } from '../types/thread';

export function activeBackend(settings: { provider: string; backend: string }): Backend {
  if (settings.backend === 'nano') return 'nano';
  if (settings.provider === 'openai') return 'openai';
  if (settings.provider === 'anthropic') return 'anthropic';
  if (settings.provider === 'gemini') return 'gemini';
  return 'nano';
}

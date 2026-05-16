// src/lib/actions/api-route.test.ts
import { describe, it, expect } from 'vitest';
import { selectAdapter, AdapterMap } from './api-route';

describe('selectAdapter', () => {
  const adapters: AdapterMap = {
    summarizer: { name: 'summarizer', available: () => true },
    prompt:     { name: 'prompt',     available: () => true },
    translator: { name: 'translator', available: () => true },
  };

  it('picks the preferred adapter when available', () => {
    expect(selectAdapter('prompt', undefined, adapters)?.name).toBe('prompt');
  });

  it('falls back when the preferred adapter is unavailable', () => {
    const half: AdapterMap = {
      summarizer: { name: 'summarizer', available: () => false },
      prompt:     { name: 'prompt',     available: () => true },
      translator: { name: 'translator', available: () => true },
    };
    expect(selectAdapter('summarizer', ['prompt'], half)?.name).toBe('prompt');
  });

  it('returns null when no adapter in the chain is available', () => {
    const none: AdapterMap = {
      summarizer: { name: 'summarizer', available: () => false },
      prompt:     { name: 'prompt',     available: () => false },
      translator: { name: 'translator', available: () => false },
    };
    expect(selectAdapter('summarizer', ['prompt', 'translator'], none)).toBeNull();
  });

  it('ignores unknown adapter ids in the fallback chain', () => {
    expect(selectAdapter('summarizer', ['unknown' as any, 'prompt'], adapters)?.name).toBe('summarizer');
  });
});

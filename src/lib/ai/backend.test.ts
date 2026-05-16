import { describe, it, expect } from 'vitest';
import { activeBackend } from './backend';
import { createPromptAdapter } from './adapters/prompt';

describe('activeBackend', () => {
  it('returns nano when backend=nano', () => {
    expect(activeBackend({ backend: 'nano', provider: '' })).toBe('nano');
  });

  it('returns the BYOK provider when not nano', () => {
    expect(activeBackend({ backend: 'cloud', provider: 'openai' })).toBe('openai');
    expect(activeBackend({ backend: 'cloud', provider: 'anthropic' })).toBe('anthropic');
    expect(activeBackend({ backend: 'cloud', provider: 'gemini' })).toBe('gemini');
  });
});

describe('prompt adapter availability', () => {
  it('returns false when LanguageModel global is absent (node env)', () => {
    const adapter = createPromptAdapter();
    expect(adapter.available()).toBe(false);
  });
});

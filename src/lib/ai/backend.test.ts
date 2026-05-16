import { describe, it, expect } from 'vitest';
import { probeAvailability, activeBackend } from './backend';

describe('probeAvailability', () => {
  it('returns available=false when globals are missing (node env)', () => {
    expect(probeAvailability('summarizer').available).toBe(false);
    expect(probeAvailability('prompt').available).toBe(false);
    expect(probeAvailability('translator').available).toBe(false);
  });
});

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

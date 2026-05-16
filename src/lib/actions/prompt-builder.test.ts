import { describe, it, expect } from 'vitest';
import { buildPrompt, ALLOWED_PLACEHOLDERS } from './prompt-builder';
import { makePick, makePageMeta } from '../test-fixtures';

describe('buildPrompt', () => {
  it('substitutes {{selections}} with formatted picks', () => {
    const picks = [
      makePick({ id: 'a', label: 'First', payload: { ...makePick().payload, text: 'First text.' } }),
      makePick({ id: 'b', label: 'Second', payload: { ...makePick().payload, text: 'Second text.' } }),
    ];
    const out = buildPrompt(
      { user: 'Summarize:\n{{selections}}' },
      { picks, question: undefined, pageMeta: makePageMeta(), modifiers: [] }
    );
    expect(out.user).toContain('First text.');
    expect(out.user).toContain('Second text.');
    expect(out.user.startsWith('Summarize:')).toBe(true);
  });

  it('substitutes {{question}} {{title}} {{url}} {{lang}}', () => {
    const out = buildPrompt(
      { user: 'Q: {{question}} · {{title}} · {{url}} · {{lang}}' },
      {
        picks: [],
        question: 'why?',
        pageMeta: makePageMeta({ host: 'example.com', title: 'T', primaryLang: 'en' }),
        modifiers: [],
        url: 'https://example.com/x',
      }
    );
    expect(out.user).toBe('Q: why? · T · https://example.com/x · en');
  });

  it('appends modifier addenda after the user template', () => {
    const out = buildPrompt(
      { user: 'Do it.' },
      {
        picks: [],
        question: undefined,
        pageMeta: makePageMeta(),
        modifiers: ['bullets'],
        modifierAddenda: { bullets: 'Format as bullets.' },
      }
    );
    expect(out.user).toBe('Do it.\n\nFormat as bullets.');
  });

  it('leaves unknown placeholders untouched (validator catches this)', () => {
    const out = buildPrompt(
      { user: 'Hi {{nope}}' },
      { picks: [], question: undefined, pageMeta: makePageMeta(), modifiers: [] }
    );
    expect(out.user).toBe('Hi {{nope}}');
  });

  it('passes system template through unchanged when no interpolation needed', () => {
    const out = buildPrompt(
      { system: 'You are helpful.', user: '{{selections}}' },
      { picks: [makePick()], question: undefined, pageMeta: makePageMeta(), modifiers: [] }
    );
    expect(out.system).toBe('You are helpful.');
  });

  it('exposes the allowed placeholder set', () => {
    expect([...ALLOWED_PLACEHOLDERS].sort()).toEqual(['lang', 'question', 'selections', 'title', 'url']);
  });
});

import type { ApiAdapter, AnswerStream } from '../../actions/api-route';
import type { BuiltPrompt } from '../../actions/prompt-builder';

declare const Translator: any;

export function createTranslatorAdapter(): ApiAdapter {
  return {
    name: 'translator',
    available: () => typeof Translator !== 'undefined',
    async run(_prompt: BuiltPrompt, _signal: AbortSignal): Promise<AnswerStream> {
      // No translation actions ship in Plan 2's library; this adapter is a stub
      // so the AdapterMap covers all ApiPref values.
      return {
        // eslint-disable-next-line require-yield
        chunks: () => ({ async *[Symbol.asyncIterator]() {
          throw new Error('translator adapter not yet wired — use prompt fallback');
        }}),
        abort: () => {},
      };
    },
  };
}

import type { ApiAdapter, AnswerStream } from '../../actions/api-route';
import type { BuiltPrompt } from '../../actions/prompt-builder';

declare const Summarizer: any;

export function createSummarizerAdapter(): ApiAdapter {
  return {
    name: 'summarizer',
    available: () => typeof Summarizer !== 'undefined',
    async run(prompt: BuiltPrompt, signal: AbortSignal): Promise<AnswerStream> {
      const session = await Summarizer.create({ type: 'tldr', format: 'markdown' });
      const stream = session.summarizeStreaming(prompt.user, { signal });
      return {
        chunks: () => stream,
        abort: () => session.destroy?.(),
      };
    },
  };
}

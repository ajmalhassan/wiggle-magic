import type { ApiAdapter, AnswerStream } from '../../actions/api-route';
import type { BuiltPrompt } from '../../actions/prompt-builder';

declare const LanguageModel: any;

export function createPromptAdapter(): ApiAdapter {
  return {
    name: 'prompt',
    available: () => typeof LanguageModel !== 'undefined',
    async run(prompt: BuiltPrompt, signal: AbortSignal): Promise<AnswerStream> {
      const session = await LanguageModel.create({
        initialPrompts: prompt.system ? [{ role: 'system', content: prompt.system }] : [],
      });
      const stream = session.promptStreaming(prompt.user, { signal });
      return {
        chunks: () => stream,
        abort: () => session.destroy?.(),
      };
    },
  };
}

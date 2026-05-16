import type { AdapterMap } from '../../actions/api-route';
import { createPromptAdapter } from './prompt';
import { createSummarizerAdapter } from './summarizer';
import { createTranslatorAdapter } from './translator';

export function buildAdapterMap(): AdapterMap {
  return {
    prompt: createPromptAdapter(),
    summarizer: createSummarizerAdapter(),
    translator: createTranslatorAdapter(),
  };
}

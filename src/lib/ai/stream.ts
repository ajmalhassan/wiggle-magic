// src/lib/ai/stream.ts
import type { AnswerStream } from '../actions/api-route';
export type { AnswerStream };

/**
 * Convert a ReadableStream of strings into an AnswerStream.
 * Generally not used directly — adapters often return their own implementation.
 */
export function streamFromReader(
  reader: ReadableStreamDefaultReader<string>,
  controller: AbortController,
): AnswerStream {
  return {
    chunks() {
      return {
        async *[Symbol.asyncIterator]() {
          while (true) {
            const { value, done } = await reader.read();
            if (done) return;
            if (value !== undefined) yield value;
          }
        },
      };
    },
    abort() { controller.abort(); },
  };
}

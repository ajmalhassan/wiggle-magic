/**
 * Ambient declarations for experimental Chrome built-in AI APIs
 * (Prompt API, Summarizer, Rewriter, Translator, Language Detector).
 *
 * These match the live API surface as of Chrome 138 / Chrome built-in AI early
 * access. They will be replaced by official @types/chrome entries when those
 * land. Treat as a documented patch over the type system, not as a contract.
 */

export {};

declare global {
  type AIAvailability =
    | 'available'
    | 'readily'
    | 'downloadable'
    | 'downloading'
    | 'after-download'
    | 'unavailable'
    | 'no';

  interface AIDownloadProgressEvent extends Event {
    loaded?: number;
  }

  interface AICreateMonitor {
    addEventListener(
      type: 'downloadprogress',
      listener: (e: AIDownloadProgressEvent) => void
    ): void;
  }

  interface AICreateOptions {
    monitor?: (m: AICreateMonitor) => void;
  }

  // --- LanguageModel (Prompt API) ---
  interface LanguageModelSession {
    promptStreaming(
      input: unknown,
      opts?: { signal?: AbortSignal }
    ): AsyncIterable<string>;
    destroy?: () => void;
  }

  interface LanguageModelCreateOptions extends AICreateOptions {
    initialPrompts?: Array<{ role: 'system' | 'user'; content: unknown }>;
    temperature?: number;
    topK?: number;
    expectedInputs?: Array<{ type: 'text' | 'image' | 'audio'; languages?: string[] }>;
    expectedOutputs?: Array<{ type: 'text'; languages?: string[] }>;
  }

  const LanguageModel: {
    availability(): Promise<AIAvailability>;
    create(opts?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
  };

  // --- Summarizer ---
  interface SummarizerHandle {
    summarizeStreaming(text: string): AsyncIterable<string>;
    destroy?: () => void;
  }
  const Summarizer: {
    availability(): Promise<AIAvailability>;
    create(opts?: {
      type?: 'tldr' | 'key-points' | 'teaser' | 'headline';
      format?: 'plain-text' | 'markdown';
      length?: 'short' | 'medium' | 'long';
      expectedInputLanguages?: string[];
      outputLanguage?: string;
    }): Promise<SummarizerHandle>;
  };

  // --- Rewriter ---
  interface RewriterHandle {
    rewriteStreaming(text: string): AsyncIterable<string>;
    destroy?: () => void;
  }
  const Rewriter: {
    availability(): Promise<AIAvailability>;
    create(opts?: {
      tone?: 'as-is' | 'more-formal' | 'more-casual';
      length?: 'shorter' | 'as-is' | 'longer';
      format?: 'plain-text' | 'markdown';
      expectedInputLanguages?: string[];
      outputLanguage?: string;
    }): Promise<RewriterHandle>;
  };

  // --- Translator ---
  interface TranslatorHandle {
    translateStreaming(text: string): AsyncIterable<string>;
    destroy?: () => void;
  }
  const Translator: {
    availability(opts: {
      sourceLanguage: string;
      targetLanguage: string;
    }): Promise<AIAvailability>;
    create(opts: {
      sourceLanguage: string;
      targetLanguage: string;
    }): Promise<TranslatorHandle>;
  };

  // --- LanguageDetector ---
  interface LanguageDetectorHandle {
    detect(text: string): Promise<
      Array<{ detectedLanguage: string; confidence: number }>
    >;
    destroy?: () => void;
  }
  const LanguageDetector: {
    availability(): Promise<AIAvailability>;
    create(): Promise<LanguageDetectorHandle>;
  };
}

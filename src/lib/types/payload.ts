// src/lib/types/payload.ts

/**
 * The serialized representation of an HTML element captured at selection time.
 * Mirrors the shape used by entrypoints/content/index.ts; defined here so
 * thread and action types can reference it without importing from the content
 * script (which would pull DOM and chrome.* into the lib layer).
 */
export interface Payload {
  selector: string;
  tag: string;
  text: string;
  aria: Record<string, string>;
  data: Record<string, string>;
  image: { src: string; alt: string; naturalWidth?: number; naturalHeight?: number } | null;
  link: { href: string; text: string } | null;
  value: string | null;
  rect: { x: number; y: number; width: number; height: number };
}

/**
 * Type tags attached by the picker beyond the raw `tag` HTML element name.
 * Used by the action ranker for contextual surfacing.
 */
export type PickTag = 'code' | 'table' | 'price' | 'video' | 'long' | 'short';

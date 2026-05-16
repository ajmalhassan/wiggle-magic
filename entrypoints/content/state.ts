// entrypoints/content/state.ts
import type { PickRef } from '@/src/lib/types/thread';

export type Mode = 'idle' | 'selecting' | 'sidebar' | 'sidebar+selecting';

export interface WmEvents {
  'mode:change':     { from: Mode; to: Mode };
  'picks:change':    { picks: PickRef[]; source: 'selecting' | 'staging' };
  'commit':          { picks: PickRef[] };
  'turn:submit':     { actionId: string; modifiers: string[]; text?: string; picks: PickRef[] };
  'turn:stream':     { turnId: string; chunk: string };
  'turn:done':       { turnId: string };
  'turn:error':      { turnId: string; code: string };
  'thread:loaded':   { threadId: string };
  'thread:archived': { threadId: string };
  'sidebar:close':   Record<string, never>;
  'add-clicked':     Record<string, never>;
}

type Listener<K extends keyof WmEvents> = (e: WmEvents[K]) => void;

export interface State {
  getMode(): Mode;
  setMode(next: Mode): void;
  on<K extends keyof WmEvents>(key: K, fn: Listener<K>): void;
  off<K extends keyof WmEvents>(key: K, fn: Listener<K>): void;
  emit<K extends keyof WmEvents>(key: K, payload: WmEvents[K]): void;
}

export function createState(): State {
  let mode: Mode = 'idle';
  const listeners = new Map<keyof WmEvents, Set<Listener<any>>>();

  function on<K extends keyof WmEvents>(key: K, fn: Listener<K>) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(fn);
  }
  function off<K extends keyof WmEvents>(key: K, fn: Listener<K>) {
    listeners.get(key)?.delete(fn);
  }
  function emit<K extends keyof WmEvents>(key: K, payload: WmEvents[K]) {
    const set = listeners.get(key);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  return {
    getMode: () => mode,
    setMode(next) {
      if (next === mode) return;
      const prev = mode;
      mode = next;
      emit('mode:change', { from: prev, to: next });
    },
    on, off, emit,
  };
}

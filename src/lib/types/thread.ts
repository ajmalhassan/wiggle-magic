// src/lib/types/thread.ts
import type { Payload, PickTag } from './payload';

export type ThreadId = string;      // `${origin}${pathname}`
export type TurnId = string;        // ulid

export type Backend = 'nano' | 'openai' | 'anthropic' | 'gemini';

export interface PickRef {
  id: string;
  type: 'text' | 'img' | 'link' | 'control' | 'media';
  tags: PickTag[];
  label: string;
  selector: string;
  payload: Payload;
}

export interface UserTurn {
  id: TurnId;
  role: 'user';
  kind: 'hero' | 'ask';
  actionId: string;
  text?: string;
  modifiers: string[];
  picks: PickRef[];
  ts: number;
}

export interface MagicTurn {
  id: TurnId;
  role: 'magic';
  inReplyTo: TurnId;
  answer: string;
  sources: PickRef[];
  status: 'streaming' | 'done' | 'error';
  errorCode?: string;
  backend: Backend;
  ts: number;
}

export type Turn = UserTurn | MagicTurn;

export interface Thread {
  id: ThreadId;
  origin: string;
  pathname: string;
  title: string;
  turns: Turn[];
  createdAt: number;
  lastTouchedAt: number;
}

export interface ThreadIndexEntry {
  id: ThreadId;
  lastTouchedAt: number;
  title: string;
  archived: boolean;
}

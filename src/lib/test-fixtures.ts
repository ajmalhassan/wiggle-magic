// src/lib/test-fixtures.ts
import type { ActionDef, ActionContext, PageMeta } from './types/action';
import type { PickRef, Thread, Backend } from './types/thread';
import type { Payload } from './types/payload';

export function makePayload(overrides: Partial<Payload> = {}): Payload {
  return {
    selector: 'div > p:nth-child(1)',
    tag: 'p',
    text: 'Sample paragraph text.',
    aria: {},
    data: {},
    image: null,
    link: null,
    value: null,
    rect: { x: 0, y: 0, width: 100, height: 20 },
    ...overrides,
  };
}

export function makePick(overrides: Partial<PickRef> = {}): PickRef {
  return {
    id: 'p1',
    type: 'text',
    tags: [],
    label: 'Sample paragraph…',
    selector: 'div > p:nth-child(1)',
    payload: makePayload(),
    ...overrides,
  };
}

export function makePageMeta(overrides: Partial<PageMeta> = {}): PageMeta {
  return {
    host: 'example.com',
    title: 'Example Article',
    primaryLang: 'en',
    ...overrides,
  };
}

export function makeContext(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    picks: [makePick()],
    thread: null,
    backend: 'nano' as Backend,
    pageMeta: makePageMeta(),
    ...overrides,
  };
}

export function makeAction(overrides: Partial<ActionDef> = {}): ActionDef {
  return {
    id: 'test-action',
    label: 'Test',
    source: 'user',
    surface: ['slash'],
    acceptsFreeText: false,
    acceptsModifiers: [],
    availableWhen: { kind: 'always' },
    prompt: { user: 'Test: {{selections}}' },
    apiPreference: 'prompt',
    ...overrides,
  };
}

export function makeThread(overrides: Partial<Thread> = {}): Thread {
  const now = Date.now();
  return {
    id: 'https://example.com/page',
    origin: 'https://example.com',
    pathname: '/page',
    title: 'Example',
    turns: [],
    createdAt: now,
    lastTouchedAt: now,
    ...overrides,
  };
}

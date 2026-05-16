# Sidebar + Pluggable Actions: Foundation (Plan 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the DOM-free foundation layer for the sidebar rebuild — types, KV storage abstraction, pluggable actions registry with built-in core + library + ranker, prompt builder, validation, and per-URL thread persistence — all unit-tested. No user-visible behavior changes.

**Architecture:** Pure additions under `src/lib/` arranged into focused modules under `types/`, `actions/`, `thread/`, plus a `storage.ts` KV adapter. Modules use constructor-injected dependencies (KV store) so they're trivially testable without DOM or `chrome.storage`. The existing v2.1 sheet code stays untouched; Plan 2 deletes it and wires the new sidebar UI to this foundation.

**Tech Stack:** TypeScript 5.6 (strict mode), Vitest (new), `chrome.storage.local` (in production), WXT/Vite (existing build).

**Source Spec:** `docs/superpowers/specs/2026-05-16-sidebar-and-actions-design.md`

**Plan split rationale.** This plan ships the DOM-free foundation only — no UI changes, no deletion of v2.1 code, no edits to existing `entrypoints/*` files except `package.json` for the test harness. It produces a tested library that the sidebar rebuild (Plan 2) consumes. Splitting keeps each plan reviewable, lets the foundation harden under tests before UI work begins, and means a rollback of Plan 2 leaves Plan 1's code intact and useful.

---

## File structure (created by this plan)

```
package.json                          (modified: add vitest + scripts)
vitest.config.ts                       (new)
src/lib/
  types.ts                             (moved → types/index.ts)
  types/
    index.ts                           (existing exports, re-homed)
    payload.ts                         (new)
    thread.ts                          (new)
    action.ts                          (new)
  storage.ts                           (new — KV adapter)
  storage.test.ts                      (new)
  actions/
    prompt-builder.ts                  (new)
    prompt-builder.test.ts             (new)
    availability.ts                    (new)
    availability.test.ts               (new)
    validate.ts                        (new)
    validate.test.ts                   (new)
    storage.ts                         (new — action persistence)
    storage.test.ts                    (new)
    ranker.ts                          (new)
    ranker.test.ts                     (new)
    registry.ts                        (new)
    registry.test.ts                   (new)
    api-route.ts                       (new)
    api-route.test.ts                  (new)
    library.ts                         (new — 9 entries)
    library.test.ts                    (new)
    builtins/
      modifiers.ts                     (new)
      summarize.ts                     (new)
      compare.ts                       (new)
      ask.ts                           (new)
      index.ts                         (new)
      builtins.test.ts                 (new)
  thread/
    store.ts                           (new)
    store.test.ts                      (new)
    operations.ts                      (new)
    operations.test.ts                 (new)
  test-fixtures.ts                     (new — shared test data)
```

**Files NOT touched in Plan 1:** `entrypoints/content/index.ts`, `entrypoints/content/content.css`, anything in `entrypoints/popup/`, `entrypoints/options/`, `entrypoints/help/`, `entrypoints/background.ts`, `src/lib/markdown.ts`, `src/lib/chrome-ai.d.ts`. These are Plan 2's territory.

---

## Tech context for a fresh engineer

This is a Chrome MV3 extension built with **WXT** (a Vite-based extension framework). Source TypeScript with strict mode. No tests exist today — Plan 1 adds the test harness. The codebase uses **pnpm**, not npm.

**Path aliasing:** `tsconfig.json` maps `@/*` to the project root, so `@/src/lib/types` is a valid import. Vitest must match this.

**Existing types in `src/lib/types.ts`** (kept untouched in shape, just re-homed):
- `WmSettings` (backend, provider, apiKey, model)
- `SavedSelection` (tag, text?, link?, image?, selector?)
- `MemoryAction` (`'summary' | 'bullets' | 'ask' | 'compare'`)
- `MemoryEntry` (id, ts, url, title?, hostname, question, answer, selections?, action?)

These are imported as `from '@/src/lib/types'` in popup and content scripts. **Do not rename or change their exports** — they must remain importable at the same path.

**Build commands:**
- `pnpm install` — install deps
- `pnpm compile` — type-check (no emit)
- `pnpm dev` — WXT watch mode
- `pnpm build` — production bundle

**Verification commands you'll use frequently:**
- `pnpm test` — run Vitest once (Task 1 adds this)
- `pnpm test:watch` — Vitest watch mode
- `pnpm compile` — verify the whole project still type-checks

**Pattern for cross-module communication** (relevant for design, not Plan 1 code):
Modules in `src/lib/` are pure / DOM-free. They take their dependencies (e.g., a `KVStore`) via factory functions or constructors. No singletons that reach for `chrome.storage` directly. This is what makes them unit-testable.

---

## Task 1: Add Vitest test harness

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Add vitest as a dev dependency**

Run:
```bash
pnpm add -D vitest@^2.1.0
```

Expected: `pnpm-lock.yaml` updates; `vitest` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Add test scripts to `package.json`**

Edit `package.json` to add two entries under `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Final `scripts` block should read:
```json
"scripts": {
  "dev": "wxt",
  "build": "wxt build",
  "zip": "wxt zip",
  "compile": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "postinstall": "wxt prepare"
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

Create `vitest.config.ts` at the project root:
```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 4: Verify Vitest runs with no tests yet**

Run:
```bash
pnpm test
```

Expected: Vitest starts, reports "No test files found", exits with success. (Vitest treats "no tests" as success unless `--passWithNoTests=false` is set.)

If it exits non-zero, add `--passWithNoTests` to the script. Otherwise proceed.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "build(test): add Vitest test harness"
```

---

## Task 2: Move `src/lib/types.ts` → `src/lib/types/index.ts`

This re-homes the existing types file to make room for new sibling files (`payload.ts`, `thread.ts`, `action.ts`) without changing any consumer imports. `@/src/lib/types` continues to resolve.

**Files:**
- Move: `src/lib/types.ts` → `src/lib/types/index.ts`

- [ ] **Step 1: Move the file**

Run:
```bash
mkdir -p src/lib/types && git mv src/lib/types.ts src/lib/types/index.ts
```

Expected: `src/lib/types/index.ts` now contains the original content; `src/lib/types.ts` no longer exists. Working tree is clean except for the rename.

- [ ] **Step 2: Verify no import path changed**

Run:
```bash
pnpm compile
```

Expected: No errors. TypeScript resolves `@/src/lib/types` to `src/lib/types/index.ts` automatically.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/index.ts
git commit -m "refactor(types): move src/lib/types.ts to types/index.ts"
```

---

## Task 3: Create `src/lib/types/payload.ts`

The `Payload` interface is currently inline inside `entrypoints/content/index.ts`. We mirror it as a typed module so action and thread types can reference it without depending on the content script.

**Files:**
- Create: `src/lib/types/payload.ts`

- [ ] **Step 1: Write `payload.ts`**

```ts
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
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
pnpm compile
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/payload.ts
git commit -m "feat(types): add Payload and PickTag types"
```

---

## Task 4: Create `src/lib/types/thread.ts`

**Files:**
- Create: `src/lib/types/thread.ts`

- [ ] **Step 1: Write `thread.ts`**

```ts
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
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
pnpm compile
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/thread.ts
git commit -m "feat(types): add Thread, Turn, PickRef types"
```

---

## Task 5: Create `src/lib/types/action.ts`

**Files:**
- Create: `src/lib/types/action.ts`

- [ ] **Step 1: Write `action.ts`**

```ts
// src/lib/types/action.ts
import type { PickRef } from './thread';
import type { PickTag } from './payload';
import type { Thread, Backend } from './thread';

export type ApiPref = 'summarizer' | 'prompt' | 'translator';

export type AvailabilityRule =
  | { kind: 'always' }
  | { kind: 'minPicks'; n: number }
  | { kind: 'pickTypesIncludes'; types: PickRef['type'][]; minCount?: number }
  | { kind: 'pickTagsIncludes'; tags: PickTag[]; minCount?: number }
  | { kind: 'and'; rules: AvailabilityRule[] };

export interface PromptTemplate {
  system?: string;
  user: string;
}

export interface ActionTags {
  picksContains?: ('text' | 'img' | 'link' | 'code' | 'table' | 'price' | 'video')[];
  pageType?: ('article' | 'product' | 'code-host' | 'social' | 'media')[];
  language?: string[];
}

export interface ActionDef {
  id: string;
  label: string;
  icon?: string;
  source: 'builtin-core' | 'builtin-library' | 'user';
  surface: ('hero' | 'slash')[];
  acceptsFreeText: boolean;
  acceptsModifiers: string[];
  availableWhen: AvailabilityRule;
  prompt: PromptTemplate;
  apiPreference: ApiPref;
  fallback?: ApiPref[];
  description?: string;
  tags?: ActionTags;
  examples?: Array<{ input: string; output: string }>;
}

export interface ModifierDef {
  id: string;
  label: string;
  surface: ('slash' | 'inline')[];
  promptAddendum: string;
}

export interface PageMeta {
  host: string;
  title: string;
  primaryLang: string;
  pageType?: 'article' | 'product' | 'code-host' | 'social' | 'media';
}

export interface ActionContext {
  picks: PickRef[];
  thread: Thread | null;
  backend: Backend;
  pageMeta: PageMeta;
}

/**
 * Result of a validation pass. `ok: true` means the value is safe to use;
 * `ok: false` carries field-level errors for surfacing in the options editor.
 */
export type ValidateResult =
  | { ok: true }
  | { ok: false; errors: Array<{ field: string; message: string }> };
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
pnpm compile
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/action.ts
git commit -m "feat(types): add ActionDef, ModifierDef, ActionContext types"
```

---

## Task 6: Create `src/lib/storage.ts` (KV adapter)

A thin abstraction over `chrome.storage.local` that all persistence modules use. Two implementations: `chromeKV` (production) and `memoryKV` (for tests).

**Files:**
- Create: `src/lib/storage.ts`
- Create: `src/lib/storage.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/storage.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { memoryKV } from './storage';

describe('memoryKV', () => {
  let kv: ReturnType<typeof memoryKV>;
  beforeEach(() => { kv = memoryKV(); });

  it('returns null for a missing key', async () => {
    expect(await kv.get('absent')).toBeNull();
  });

  it('round-trips an object', async () => {
    await kv.set('user', { name: 'Ada' });
    expect(await kv.get('user')).toEqual({ name: 'Ada' });
  });

  it('removes a key', async () => {
    await kv.set('k', 1);
    await kv.remove('k');
    expect(await kv.get('k')).toBeNull();
  });

  it('lists keys by prefix', async () => {
    await kv.set('wm:thread:a', 1);
    await kv.set('wm:thread:b', 2);
    await kv.set('wm:memory', 3);
    const keys = await kv.keys('wm:thread:');
    expect(keys.sort()).toEqual(['wm:thread:a', 'wm:thread:b']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm test src/lib/storage.test.ts
```

Expected: FAIL — `Cannot find module './storage'`.

- [ ] **Step 3: Write `storage.ts`**

```ts
// src/lib/storage.ts

export interface KVStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

/**
 * Production adapter: wraps chrome.storage.local. Constructed lazily so the
 * lib remains importable in environments without `chrome` (tests).
 */
export function chromeKV(): KVStore {
  return {
    async get<T>(key: string): Promise<T | null> {
      const out = await chrome.storage.local.get(key);
      return (out[key] as T | undefined) ?? null;
    },
    async set<T>(key: string, value: T): Promise<void> {
      await chrome.storage.local.set({ [key]: value });
    },
    async remove(key: string): Promise<void> {
      await chrome.storage.local.remove(key);
    },
    async keys(prefix: string): Promise<string[]> {
      const all = await chrome.storage.local.get(null);
      return Object.keys(all).filter(k => k.startsWith(prefix));
    },
  };
}

/**
 * Test adapter: in-memory map. Safe to instantiate per-test.
 */
export function memoryKV(): KVStore {
  const map = new Map<string, unknown>();
  return {
    async get<T>(key: string): Promise<T | null> {
      return (map.get(key) as T | undefined) ?? null;
    },
    async set<T>(key: string, value: T): Promise<void> {
      // Structured-clone-ish: keep tests honest about serializability.
      map.set(key, JSON.parse(JSON.stringify(value)));
    },
    async remove(key: string): Promise<void> {
      map.delete(key);
    },
    async keys(prefix: string): Promise<string[]> {
      return [...map.keys()].filter(k => k.startsWith(prefix));
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm test src/lib/storage.test.ts
```

Expected: All four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(lib): add KV storage abstraction with chrome + memory adapters"
```

---

## Task 7: Create `src/lib/test-fixtures.ts`

Shared fixture data for ranker, registry, validate, and thread-operations tests. One file, exported helpers; keeps individual test files short.

**Files:**
- Create: `src/lib/test-fixtures.ts`

- [ ] **Step 1: Write `test-fixtures.ts`**

```ts
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
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
pnpm compile
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/test-fixtures.ts
git commit -m "test(lib): add shared test fixtures"
```

---

## Task 8: Implement prompt template interpolation

**Files:**
- Create: `src/lib/actions/prompt-builder.ts`
- Create: `src/lib/actions/prompt-builder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/actions/prompt-builder.test.ts
import { describe, it, expect } from 'vitest';
import { buildPrompt, ALLOWED_PLACEHOLDERS } from './prompt-builder';
import { makePick, makePageMeta } from '../test-fixtures';

describe('buildPrompt', () => {
  it('substitutes {{selections}} with formatted picks', () => {
    const picks = [
      makePick({ id: 'a', label: 'First', payload: { ...makePick().payload, text: 'First text.' } }),
      makePick({ id: 'b', label: 'Second', payload: { ...makePick().payload, text: 'Second text.' } }),
    ];
    const out = buildPrompt(
      { user: 'Summarize:\n{{selections}}' },
      { picks, question: undefined, pageMeta: makePageMeta(), modifiers: [] }
    );
    expect(out.user).toContain('First text.');
    expect(out.user).toContain('Second text.');
    expect(out.user.startsWith('Summarize:')).toBe(true);
  });

  it('substitutes {{question}} {{title}} {{url}} {{lang}}', () => {
    const out = buildPrompt(
      { user: 'Q: {{question}} · {{title}} · {{url}} · {{lang}}' },
      {
        picks: [],
        question: 'why?',
        pageMeta: makePageMeta({ host: 'example.com', title: 'T', primaryLang: 'en' }),
        modifiers: [],
        url: 'https://example.com/x',
      }
    );
    expect(out.user).toBe('Q: why? · T · https://example.com/x · en');
  });

  it('appends modifier addenda after the user template', () => {
    const out = buildPrompt(
      { user: 'Do it.' },
      {
        picks: [],
        question: undefined,
        pageMeta: makePageMeta(),
        modifiers: ['bullets'],
        modifierAddenda: { bullets: 'Format as bullets.' },
      }
    );
    expect(out.user).toBe('Do it.\n\nFormat as bullets.');
  });

  it('leaves unknown placeholders untouched (validator catches this)', () => {
    const out = buildPrompt(
      { user: 'Hi {{nope}}' },
      { picks: [], question: undefined, pageMeta: makePageMeta(), modifiers: [] }
    );
    expect(out.user).toBe('Hi {{nope}}');
  });

  it('passes system template through unchanged when no interpolation needed', () => {
    const out = buildPrompt(
      { system: 'You are helpful.', user: '{{selections}}' },
      { picks: [makePick()], question: undefined, pageMeta: makePageMeta(), modifiers: [] }
    );
    expect(out.system).toBe('You are helpful.');
  });

  it('exposes the allowed placeholder set', () => {
    expect(ALLOWED_PLACEHOLDERS.sort()).toEqual(['lang', 'question', 'selections', 'title', 'url']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm test src/lib/actions/prompt-builder.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `prompt-builder.ts`**

```ts
// src/lib/actions/prompt-builder.ts
import type { PromptTemplate, PageMeta } from '../types/action';
import type { PickRef } from '../types/thread';

export const ALLOWED_PLACEHOLDERS = ['selections', 'question', 'title', 'url', 'lang'] as const;
export type Placeholder = (typeof ALLOWED_PLACEHOLDERS)[number];

export interface PromptInputs {
  picks: PickRef[];
  question: string | undefined;
  pageMeta: PageMeta;
  modifiers: string[];
  url?: string;                     // optional; falls back to pageMeta.host if absent
  modifierAddenda?: Record<string, string>;
}

export interface BuiltPrompt {
  system?: string;
  user: string;
}

function formatPicks(picks: PickRef[]): string {
  if (picks.length === 0) return '(no selections)';
  return picks
    .map((p, i) => {
      const head = `Selection ${i + 1} (${p.type}${p.tags.length ? ', ' + p.tags.join(', ') : ''}):`;
      if (p.payload.image) {
        return `${head}\n[image: ${p.payload.image.alt || p.payload.image.src}]`;
      }
      if (p.payload.link) {
        return `${head}\n[link: ${p.payload.link.text || p.payload.link.href}]`;
      }
      return `${head}\n${p.payload.text}`;
    })
    .join('\n\n');
}

function interpolate(tpl: string, values: Record<Placeholder, string>): string {
  let out = tpl;
  for (const k of ALLOWED_PLACEHOLDERS) {
    out = out.split(`{{${k}}}`).join(values[k]);
  }
  return out;
}

export function buildPrompt(template: PromptTemplate, inputs: PromptInputs): BuiltPrompt {
  const values: Record<Placeholder, string> = {
    selections: formatPicks(inputs.picks),
    question: inputs.question ?? '',
    title: inputs.pageMeta.title,
    url: inputs.url ?? '',
    lang: inputs.pageMeta.primaryLang,
  };

  let user = interpolate(template.user, values);

  const addenda = inputs.modifierAddenda ?? {};
  const applied = inputs.modifiers.map(m => addenda[m]).filter(Boolean);
  if (applied.length > 0) {
    user = `${user}\n\n${applied.join('\n\n')}`;
  }

  const built: BuiltPrompt = { user };
  if (template.system !== undefined) built.system = template.system;
  return built;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm test src/lib/actions/prompt-builder.test.ts
```

Expected: All six tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/prompt-builder.ts src/lib/actions/prompt-builder.test.ts
git commit -m "feat(actions): add prompt template interpolation"
```

---

## Task 9: Implement AvailabilityRule evaluation

**Files:**
- Create: `src/lib/actions/availability.ts`
- Create: `src/lib/actions/availability.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/actions/availability.test.ts
import { describe, it, expect } from 'vitest';
import { isAvailable } from './availability';
import { makeContext, makePick } from '../test-fixtures';
import type { AvailabilityRule } from '../types/action';

describe('isAvailable', () => {
  it('always: true regardless of picks', () => {
    const rule: AvailabilityRule = { kind: 'always' };
    expect(isAvailable(rule, makeContext({ picks: [] }))).toBe(true);
    expect(isAvailable(rule, makeContext({ picks: [makePick()] }))).toBe(true);
  });

  it('minPicks: passes when picks length ≥ n', () => {
    const rule: AvailabilityRule = { kind: 'minPicks', n: 2 };
    expect(isAvailable(rule, makeContext({ picks: [makePick()] }))).toBe(false);
    expect(isAvailable(rule, makeContext({ picks: [makePick(), makePick({ id: 'b' })] }))).toBe(true);
  });

  it('pickTypesIncludes: minCount defaults to 1', () => {
    const rule: AvailabilityRule = { kind: 'pickTypesIncludes', types: ['img'] };
    expect(isAvailable(rule, makeContext({ picks: [makePick({ type: 'text' })] }))).toBe(false);
    expect(isAvailable(rule, makeContext({ picks: [makePick({ type: 'img' })] }))).toBe(true);
  });

  it('pickTypesIncludes: respects minCount', () => {
    const rule: AvailabilityRule = { kind: 'pickTypesIncludes', types: ['text'], minCount: 2 };
    expect(isAvailable(rule, makeContext({ picks: [makePick()] }))).toBe(false);
    const twoText = [makePick({ id: 'a' }), makePick({ id: 'b' })];
    expect(isAvailable(rule, makeContext({ picks: twoText }))).toBe(true);
  });

  it('pickTagsIncludes: matches by tag', () => {
    const rule: AvailabilityRule = { kind: 'pickTagsIncludes', tags: ['code'] };
    expect(isAvailable(rule, makeContext({ picks: [makePick({ tags: ['code'] })] }))).toBe(true);
    expect(isAvailable(rule, makeContext({ picks: [makePick({ tags: [] })] }))).toBe(false);
  });

  it('and: requires every sub-rule to pass', () => {
    const rule: AvailabilityRule = {
      kind: 'and',
      rules: [
        { kind: 'minPicks', n: 2 },
        { kind: 'pickTypesIncludes', types: ['text'] },
      ],
    };
    const two = [makePick({ id: 'a' }), makePick({ id: 'b' })];
    expect(isAvailable(rule, makeContext({ picks: two }))).toBe(true);
    expect(isAvailable(rule, makeContext({ picks: [makePick()] }))).toBe(false);
    const twoImg = [makePick({ id: 'a', type: 'img' }), makePick({ id: 'b', type: 'img' })];
    expect(isAvailable(rule, makeContext({ picks: twoImg }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test src/lib/actions/availability.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `availability.ts`**

```ts
// src/lib/actions/availability.ts
import type { AvailabilityRule, ActionContext } from '../types/action';

export function isAvailable(rule: AvailabilityRule, ctx: ActionContext): boolean {
  switch (rule.kind) {
    case 'always':
      return true;
    case 'minPicks':
      return ctx.picks.length >= rule.n;
    case 'pickTypesIncludes': {
      const need = rule.minCount ?? 1;
      const count = ctx.picks.filter(p => rule.types.includes(p.type)).length;
      return count >= need;
    }
    case 'pickTagsIncludes': {
      const need = rule.minCount ?? 1;
      const count = ctx.picks.filter(p => p.tags.some(t => rule.tags.includes(t))).length;
      return count >= need;
    }
    case 'and':
      return rule.rules.every(r => isAvailable(r, ctx));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test src/lib/actions/availability.test.ts
```

Expected: All six tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/availability.ts src/lib/actions/availability.test.ts
git commit -m "feat(actions): add AvailabilityRule evaluator"
```

---

## Task 10: Implement action schema validation

**Files:**
- Create: `src/lib/actions/validate.ts`
- Create: `src/lib/actions/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/actions/validate.test.ts
import { describe, it, expect } from 'vitest';
import { validateAction } from './validate';
import { makeAction } from '../test-fixtures';

describe('validateAction', () => {
  it('accepts a well-formed action', () => {
    expect(validateAction(makeAction()).ok).toBe(true);
  });

  it('rejects an empty id', () => {
    const r = validateAction(makeAction({ id: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'id')).toBe(true);
  });

  it('rejects an id with invalid chars', () => {
    const r = validateAction(makeAction({ id: 'Bad ID!' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'id')).toBe(true);
  });

  it('rejects a label over 40 chars', () => {
    const r = validateAction(makeAction({ label: 'x'.repeat(41) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'label')).toBe(true);
  });

  it('rejects an empty user prompt', () => {
    const r = validateAction(makeAction({ prompt: { user: '' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'prompt.user')).toBe(true);
  });

  it('rejects unknown placeholder in prompt', () => {
    const r = validateAction(makeAction({ prompt: { user: 'Hi {{nope}}' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'prompt.user')).toBe(true);
  });

  it('rejects unknown apiPreference', () => {
    const r = validateAction(makeAction({ apiPreference: 'magic' as any }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'apiPreference')).toBe(true);
  });

  it('rejects empty surface array', () => {
    const r = validateAction(makeAction({ surface: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'surface')).toBe(true);
  });

  it('accumulates multiple errors', () => {
    const r = validateAction(makeAction({ id: '', label: '', prompt: { user: '' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test src/lib/actions/validate.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `validate.ts`**

```ts
// src/lib/actions/validate.ts
import type { ActionDef, ValidateResult, ApiPref } from '../types/action';
import { ALLOWED_PLACEHOLDERS } from './prompt-builder';

const ID_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;
const VALID_API_PREFS: ApiPref[] = ['summarizer', 'prompt', 'translator'];
const VALID_SURFACES = ['hero', 'slash'] as const;
const PLACEHOLDER_PATTERN = /\{\{([a-zA-Z]+)\}\}/g;

export function validateAction(def: ActionDef): ValidateResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (!def.id || !ID_PATTERN.test(def.id)) {
    errors.push({ field: 'id', message: 'must be 2-31 lowercase chars: [a-z][a-z0-9-]*' });
  }

  if (!def.label || def.label.trim().length === 0) {
    errors.push({ field: 'label', message: 'must be non-empty' });
  } else if (def.label.length > 40) {
    errors.push({ field: 'label', message: 'must be ≤ 40 characters' });
  }

  if (!def.prompt || !def.prompt.user || def.prompt.user.trim().length === 0) {
    errors.push({ field: 'prompt.user', message: 'must be non-empty' });
  } else {
    const used = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = PLACEHOLDER_PATTERN.exec(def.prompt.user)) !== null) {
      used.add(m[1]);
    }
    for (const ph of used) {
      if (!(ALLOWED_PLACEHOLDERS as readonly string[]).includes(ph)) {
        errors.push({ field: 'prompt.user', message: `unknown placeholder {{${ph}}}` });
      }
    }
  }

  if (!VALID_API_PREFS.includes(def.apiPreference)) {
    errors.push({ field: 'apiPreference', message: `must be one of ${VALID_API_PREFS.join(', ')}` });
  }

  if (!def.surface || def.surface.length === 0) {
    errors.push({ field: 'surface', message: 'must include at least one of hero, slash' });
  } else {
    for (const s of def.surface) {
      if (!(VALID_SURFACES as readonly string[]).includes(s)) {
        errors.push({ field: 'surface', message: `unknown surface: ${s}` });
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test src/lib/actions/validate.test.ts
```

Expected: All nine tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/validate.ts src/lib/actions/validate.test.ts
git commit -m "feat(actions): add schema validation for ActionDefs"
```

---

## Task 11: Built-in modifiers

**Files:**
- Create: `src/lib/actions/builtins/modifiers.ts`

- [ ] **Step 1: Write `modifiers.ts`**

```ts
// src/lib/actions/builtins/modifiers.ts
import type { ModifierDef } from '../../types/action';

export const BUILTIN_MODIFIERS: ModifierDef[] = [
  {
    id: 'bullets',
    label: 'Bullets',
    surface: ['slash', 'inline'],
    promptAddendum: 'Format the answer as a tight bulleted list. Lead each bullet with the key noun phrase.',
  },
  {
    id: 'shorter',
    label: 'Shorter',
    surface: ['inline'],
    promptAddendum: 'Cut the answer to roughly half its previous length while preserving the most important points.',
  },
];
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm compile
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/builtins/modifiers.ts
git commit -m "feat(actions): add built-in modifiers (bullets, shorter)"
```

---

## Task 12: Built-in core action — Summarize

**Files:**
- Create: `src/lib/actions/builtins/summarize.ts`

- [ ] **Step 1: Write `summarize.ts`**

```ts
// src/lib/actions/builtins/summarize.ts
import type { ActionDef } from '../../types/action';

export const SUMMARIZE: ActionDef = {
  id: 'summarize',
  label: 'Summarize',
  icon: 'sparkle',
  source: 'builtin-core',
  surface: ['hero', 'slash'],
  acceptsFreeText: false,
  acceptsModifiers: ['bullets', 'shorter'],
  availableWhen: { kind: 'minPicks', n: 1 },
  apiPreference: 'summarizer',
  fallback: ['prompt'],
  prompt: {
    system: 'You write tight, cohesive summaries across multiple selections from a web page.',
    user:
      'Summarize the following selections from "{{title}}" into one cohesive answer. ' +
      'Do not list them separately — synthesize.\n\n{{selections}}',
  },
  description: 'One cohesive summary across the selections.',
  tags: {
    picksContains: ['text'],
  },
};
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm compile
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/builtins/summarize.ts
git commit -m "feat(actions): add built-in Summarize action"
```

---

## Task 13: Built-in core action — Compare

**Files:**
- Create: `src/lib/actions/builtins/compare.ts`

- [ ] **Step 1: Write `compare.ts`**

```ts
// src/lib/actions/builtins/compare.ts
import type { ActionDef } from '../../types/action';

export const COMPARE: ActionDef = {
  id: 'compare',
  label: 'Compare',
  icon: 'compare',
  source: 'builtin-core',
  surface: ['hero', 'slash'],
  acceptsFreeText: false,
  acceptsModifiers: ['bullets', 'shorter'],
  availableWhen: {
    kind: 'and',
    rules: [
      { kind: 'minPicks', n: 2 },
      { kind: 'pickTypesIncludes', types: ['text', 'img', 'link', 'media'], minCount: 2 },
    ],
  },
  apiPreference: 'prompt',
  prompt: {
    system: 'You compare items side-by-side and highlight what genuinely differs.',
    user:
      'Compare the following selections from "{{title}}". ' +
      'For each pair, identify what is the same, what is different, and which (if any) seems stronger and why.\n\n' +
      '{{selections}}',
  },
  description: 'Side-by-side comparison across two or more comparable items.',
  tags: {
    picksContains: ['text', 'img', 'link'],
    pageType: ['product', 'article'],
  },
};
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm compile
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/builtins/compare.ts
git commit -m "feat(actions): add built-in Compare action"
```

---

## Task 14: Built-in core action — Ask

**Files:**
- Create: `src/lib/actions/builtins/ask.ts`

- [ ] **Step 1: Write `ask.ts`**

```ts
// src/lib/actions/builtins/ask.ts
import type { ActionDef } from '../../types/action';

export const ASK: ActionDef = {
  id: 'ask',
  label: 'Ask',
  icon: 'sparkle',
  source: 'builtin-core',
  surface: ['slash'],            // never a hero — Ask lives in the composer's free-text slot
  acceptsFreeText: true,
  acceptsModifiers: ['bullets', 'shorter'],
  availableWhen: { kind: 'minPicks', n: 1 },
  apiPreference: 'prompt',
  prompt: {
    system: 'You answer questions about specific selections from a web page. Stay grounded in the selections.',
    user:
      'Page: {{title}}\nSelections:\n{{selections}}\n\nQuestion: {{question}}',
  },
  description: 'Free-text question about the selections.',
};
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm compile
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/builtins/ask.ts
git commit -m "feat(actions): add built-in Ask action"
```

---

## Task 15: Built-ins index + validation test

**Files:**
- Create: `src/lib/actions/builtins/index.ts`
- Create: `src/lib/actions/builtins/builtins.test.ts`

- [ ] **Step 1: Write the index**

```ts
// src/lib/actions/builtins/index.ts
import { SUMMARIZE } from './summarize';
import { COMPARE } from './compare';
import { ASK } from './ask';
import { BUILTIN_MODIFIERS } from './modifiers';
import type { ActionDef, ModifierDef } from '../../types/action';

export const BUILTIN_CORE_ACTIONS: ActionDef[] = [SUMMARIZE, COMPARE, ASK];
export { BUILTIN_MODIFIERS };
export const BUILTIN_CORE_IDS = new Set(BUILTIN_CORE_ACTIONS.map(a => a.id));
```

- [ ] **Step 2: Write the validation test**

```ts
// src/lib/actions/builtins/builtins.test.ts
import { describe, it, expect } from 'vitest';
import { BUILTIN_CORE_ACTIONS } from './index';
import { validateAction } from '../validate';

describe('built-in core actions', () => {
  for (const def of BUILTIN_CORE_ACTIONS) {
    it(`${def.id} passes validation`, () => {
      const result = validateAction(def);
      if (!result.ok) {
        // Surface the error fields directly in the assertion message.
        throw new Error(`${def.id} failed validation: ${JSON.stringify(result.errors)}`);
      }
      expect(result.ok).toBe(true);
    });
  }

  it('ids are unique', () => {
    const ids = BUILTIN_CORE_ACTIONS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every built-in core has source = builtin-core', () => {
    for (const a of BUILTIN_CORE_ACTIONS) {
      expect(a.source).toBe('builtin-core');
    }
  });
});
```

- [ ] **Step 3: Run the test**

```bash
pnpm test src/lib/actions/builtins/builtins.test.ts
```

Expected: All tests PASS (summarize, compare, ask each validate; ids unique; source check).

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/builtins/index.ts src/lib/actions/builtins/builtins.test.ts
git commit -m "feat(actions): wire built-in core registry with validation test"
```

---

## Task 16: Library catalog

**Files:**
- Create: `src/lib/actions/library.ts`
- Create: `src/lib/actions/library.test.ts`

- [ ] **Step 1: Write `library.ts`**

```ts
// src/lib/actions/library.ts
import type { ActionDef } from '../types/action';

/**
 * In-bundle catalog of curated, prompt-engineered actions. Users browse this
 * in Options → Actions → Library and enable the ones they want. Each entry is
 * a fully populated ActionDef with `source: 'builtin-library'` and a plain-
 * English `description` for the catalog UI.
 */
export const LIBRARY_ACTIONS: ActionDef[] = [
  {
    id: 'eli5',
    label: 'ELI5',
    icon: '🔍',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: ['shorter'],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      system: 'You explain things like the listener is five — concrete, vivid, no jargon.',
      user:
        'Explain the following selections like I am five years old. ' +
        'Use vivid analogies. Avoid jargon entirely.\n\n{{selections}}',
    },
    description: 'Explain like I’m five. Great for jargon-heavy articles, legal text, technical content.',
    tags: { picksContains: ['text'], pageType: ['article'] },
  },
  {
    id: 'counter-argument',
    label: 'Counter-argument',
    icon: '⚖',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: ['bullets', 'shorter'],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      user:
        'Make the strongest counter-argument to the claim(s) in the selections. ' +
        'Steelman the opposing position; don’t strawman.\n\n{{selections}}',
    },
    description: 'Find the strongest case against the selected claim.',
    tags: { picksContains: ['text'], pageType: ['article', 'social'] },
  },
  {
    id: 'find-the-flaw',
    label: 'Find the flaw',
    icon: '🐛',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: ['bullets'],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      user:
        'Find the most important flaw, missing assumption, or logical gap in the reasoning of the following. ' +
        'Be specific about why it matters.\n\n{{selections}}',
    },
    description: 'Spot logical gaps in claims and technical proposals.',
    tags: { picksContains: ['text', 'code'] },
  },
  {
    id: 'pros-cons',
    label: 'Pros & cons',
    icon: '⚖',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: ['shorter'],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      user:
        'List the most important pros and cons of the following selection(s). ' +
        'Aim for 3-5 of each. Be concrete; cite the source selection when possible.\n\n{{selections}}',
    },
    description: 'Decisions, product comparisons, life choices.',
    tags: { picksContains: ['text', 'link'], pageType: ['product', 'article'] },
  },
  {
    id: 'rewrite-clearly',
    label: 'Rewrite for clarity',
    icon: '✍',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: ['shorter'],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      user:
        'Rewrite the following selection(s) for clarity. Keep the meaning intact; cut filler, ' +
        'untangle nested clauses, use plain words. Preserve any technical terms that carry weight.\n\n{{selections}}',
    },
    description: 'Untangle confusing paragraphs and dense prose.',
    tags: { picksContains: ['text'], pageType: ['article'] },
  },
  {
    id: 'action-items',
    label: 'Extract action items',
    icon: '✅',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: [],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      user:
        'Extract the action items from the following. Each item should be one short imperative line. ' +
        'If an item has an owner or deadline mentioned, include it in parentheses. ' +
        'If nothing actionable is present, say so.\n\n{{selections}}',
    },
    description: 'Pull a to-do list out of meeting notes, memos, email threads.',
    tags: { picksContains: ['text'] },
  },
  {
    id: 'followup-questions',
    label: 'Generate questions',
    icon: '❓',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: [],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      user:
        'Generate 5 sharp follow-up questions a thoughtful reader would ask after reading the following. ' +
        'Prioritize questions that probe unstated assumptions over surface-level clarifications.\n\n{{selections}}',
    },
    description: 'Research, learning, interview prep.',
    tags: { picksContains: ['text'], pageType: ['article'] },
  },
  {
    id: 'explain-code',
    label: 'Explain this code',
    icon: '💻',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: ['bullets', 'shorter'],
    availableWhen: { kind: 'pickTagsIncludes', tags: ['code'] },
    apiPreference: 'prompt',
    prompt: {
      system: 'You explain code clearly: what it does, how it works, and where the non-obvious parts live.',
      user:
        'Explain the following code from "{{title}}". Start with what it does in one line, ' +
        'then walk through the non-obvious mechanics.\n\n{{selections}}',
    },
    description: 'Auto-surfaces when you pick a code block.',
    tags: { picksContains: ['code'], pageType: ['code-host', 'article'] },
  },
  {
    id: 'suggest-headline',
    label: 'Better headline',
    icon: '📰',
    source: 'builtin-library',
    surface: ['hero', 'slash'],
    acceptsFreeText: false,
    acceptsModifiers: [],
    availableWhen: { kind: 'minPicks', n: 1 },
    apiPreference: 'prompt',
    prompt: {
      user:
        'Suggest 3 better headlines for the following content. ' +
        'The current headline (from page title) is "{{title}}". ' +
        'Each suggestion should be more specific and lead with the actual news.\n\n{{selections}}',
    },
    description: 'For articles where the headline buried the lede.',
    tags: { picksContains: ['text'], pageType: ['article'] },
  },
];

export const LIBRARY_IDS = new Set(LIBRARY_ACTIONS.map(a => a.id));
```

- [ ] **Step 2: Write a validation test for every library entry**

```ts
// src/lib/actions/library.test.ts
import { describe, it, expect } from 'vitest';
import { LIBRARY_ACTIONS } from './library';
import { validateAction } from './validate';

describe('library actions', () => {
  for (const def of LIBRARY_ACTIONS) {
    it(`${def.id} passes validation`, () => {
      const result = validateAction(def);
      if (!result.ok) {
        throw new Error(`${def.id} failed validation: ${JSON.stringify(result.errors)}`);
      }
      expect(result.ok).toBe(true);
    });

    it(`${def.id} has a description (required for library entries)`, () => {
      expect(def.description).toBeTruthy();
    });

    it(`${def.id} has source = builtin-library`, () => {
      expect(def.source).toBe('builtin-library');
    });
  }

  it('ids are unique across the library', () => {
    const ids = LIBRARY_ACTIONS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no library id collides with a built-in core id', () => {
    const coreIds = new Set(['summarize', 'compare', 'ask']);
    for (const a of LIBRARY_ACTIONS) {
      expect(coreIds.has(a.id)).toBe(false);
    }
  });
});
```

- [ ] **Step 3: Run the test**

```bash
pnpm test src/lib/actions/library.test.ts
```

Expected: All entries pass validation; descriptions present; ids unique and non-colliding.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/library.ts src/lib/actions/library.test.ts
git commit -m "feat(actions): add curated library catalog (9 entries)"
```

---

## Task 17: Actions storage adapter

Persists user-authored actions, the hero pin order, the hidden-action set, and the enabled-library list. All under `chrome.storage.local` with key prefix `wm:actions:`.

**Files:**
- Create: `src/lib/actions/storage.ts`
- Create: `src/lib/actions/storage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/actions/storage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createActionsStorage } from './storage';
import { memoryKV } from '../storage';
import { makeAction } from '../test-fixtures';

describe('actions storage', () => {
  let store: ReturnType<typeof createActionsStorage>;
  beforeEach(() => { store = createActionsStorage(memoryKV()); });

  it('returns empty defaults when nothing is stored', async () => {
    expect(await store.loadUserActions()).toEqual([]);
    expect(await store.loadHeroOrder()).toEqual([]);
    expect(await store.loadHidden()).toEqual([]);
    expect(await store.loadEnabledLibrary()).toEqual([]);
  });

  it('round-trips a user action', async () => {
    const a = makeAction({ id: 'my-action' });
    await store.saveUserActions([a]);
    const back = await store.loadUserActions();
    expect(back).toHaveLength(1);
    expect(back[0].id).toBe('my-action');
  });

  it('round-trips hero order', async () => {
    await store.saveHeroOrder(['summarize', 'compare']);
    expect(await store.loadHeroOrder()).toEqual(['summarize', 'compare']);
  });

  it('round-trips hidden and enabled-library sets', async () => {
    await store.saveHidden(['ask']);
    await store.saveEnabledLibrary(['eli5', 'counter-argument']);
    expect(await store.loadHidden()).toEqual(['ask']);
    expect(await store.loadEnabledLibrary()).toEqual(['eli5', 'counter-argument']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test src/lib/actions/storage.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `storage.ts`**

```ts
// src/lib/actions/storage.ts
import type { KVStore } from '../storage';
import type { ActionDef } from '../types/action';

const KEY_USER = 'wm:actions:user';
const KEY_HERO = 'wm:actions:hero';
const KEY_HIDDEN = 'wm:actions:hidden';
const KEY_ENABLED_LIBRARY = 'wm:actions:enabled-library';

export interface ActionsStorage {
  loadUserActions(): Promise<ActionDef[]>;
  saveUserActions(actions: ActionDef[]): Promise<void>;
  loadHeroOrder(): Promise<string[]>;
  saveHeroOrder(ids: string[]): Promise<void>;
  loadHidden(): Promise<string[]>;
  saveHidden(ids: string[]): Promise<void>;
  loadEnabledLibrary(): Promise<string[]>;
  saveEnabledLibrary(ids: string[]): Promise<void>;
}

export function createActionsStorage(kv: KVStore): ActionsStorage {
  return {
    async loadUserActions() {
      return (await kv.get<ActionDef[]>(KEY_USER)) ?? [];
    },
    async saveUserActions(actions) {
      await kv.set(KEY_USER, actions);
    },
    async loadHeroOrder() {
      return (await kv.get<string[]>(KEY_HERO)) ?? [];
    },
    async saveHeroOrder(ids) {
      await kv.set(KEY_HERO, ids);
    },
    async loadHidden() {
      return (await kv.get<string[]>(KEY_HIDDEN)) ?? [];
    },
    async saveHidden(ids) {
      await kv.set(KEY_HIDDEN, ids);
    },
    async loadEnabledLibrary() {
      return (await kv.get<string[]>(KEY_ENABLED_LIBRARY)) ?? [];
    },
    async saveEnabledLibrary(ids) {
      await kv.set(KEY_ENABLED_LIBRARY, ids);
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test src/lib/actions/storage.test.ts
```

Expected: All four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/storage.ts src/lib/actions/storage.test.ts
git commit -m "feat(actions): add storage adapter for user actions, hero order, hidden, library-enabled"
```

---

## Task 18: Ranker

Filters by availability; scores hero-eligible actions by tag-match; sorts by score, user pin order, label; caps visible heroes at 4 with overflow falling through to slash for the current context.

**Files:**
- Create: `src/lib/actions/ranker.ts`
- Create: `src/lib/actions/ranker.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/actions/ranker.test.ts
import { describe, it, expect } from 'vitest';
import { rankHeroes } from './ranker';
import { makeAction, makeContext, makePick, makePageMeta } from '../test-fixtures';
import type { ActionDef } from '../types/action';

const a = (id: string, overrides: Partial<ActionDef> = {}) =>
  makeAction({ id, label: id, surface: ['hero', 'slash'], ...overrides });

describe('rankHeroes', () => {
  it('filters out actions whose availableWhen fails', () => {
    const actions = [
      a('summarize', { availableWhen: { kind: 'minPicks', n: 1 } }),
      a('compare',   { availableWhen: { kind: 'minPicks', n: 2 } }),
    ];
    const heroPin = ['summarize', 'compare'];
    const out = rankHeroes(actions, heroPin, makeContext({ picks: [makePick()] }));
    expect(out.visible.map(x => x.id)).toEqual(['summarize']);
    expect(out.overflow).toEqual([]);
  });

  it('only considers actions whose id is in the user hero pin set', () => {
    const actions = [
      a('summarize'),
      a('eli5'),
      a('compare', { availableWhen: { kind: 'minPicks', n: 2 } }),
    ];
    const heroPin = ['eli5'];
    const out = rankHeroes(actions, heroPin, makeContext({ picks: [makePick()] }));
    expect(out.visible.map(x => x.id)).toEqual(['eli5']);
  });

  it('orders by score (tag match) desc, then by pin order, then by label', () => {
    const actions = [
      a('plain', { tags: undefined }),
      a('codey', { tags: { picksContains: ['code'] } }),
      a('texty', { tags: { picksContains: ['text'] } }),
    ];
    const heroPin = ['plain', 'codey', 'texty'];
    const ctx = makeContext({ picks: [makePick({ tags: ['code'] })] });
    const out = rankHeroes(actions, heroPin, ctx);
    expect(out.visible.map(x => x.id)).toEqual(['codey', 'plain', 'texty']);
  });

  it('respects user pin order on ties', () => {
    const actions = [a('alpha'), a('beta')];
    const heroPin = ['beta', 'alpha'];
    const out = rankHeroes(actions, heroPin, makeContext());
    expect(out.visible.map(x => x.id)).toEqual(['beta', 'alpha']);
  });

  it('caps visible at 4 and pushes the rest to overflow', () => {
    const actions = [a('a'), a('b'), a('c'), a('d'), a('e'), a('f')];
    const heroPin = ['a', 'b', 'c', 'd', 'e', 'f'];
    const out = rankHeroes(actions, heroPin, makeContext());
    expect(out.visible.map(x => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(out.overflow.map(x => x.id)).toEqual(['e', 'f']);
  });

  it('matches against pageMeta.pageType', () => {
    const actions = [
      a('plain'),
      a('producty', { tags: { pageType: ['product'] } }),
    ];
    const heroPin = ['plain', 'producty'];
    const ctx = makeContext({ pageMeta: makePageMeta({ pageType: 'product' }) });
    const out = rankHeroes(actions, heroPin, ctx);
    expect(out.visible.map(x => x.id)).toEqual(['producty', 'plain']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test src/lib/actions/ranker.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `ranker.ts`**

```ts
// src/lib/actions/ranker.ts
import type { ActionDef, ActionContext } from '../types/action';
import { isAvailable } from './availability';

export interface RankedHeroes {
  visible: ActionDef[];    // top N up to MAX_VISIBLE
  overflow: ActionDef[];   // hero-pinned but pushed to slash for this context
}

export const MAX_VISIBLE_HEROES = 4;

function tagScore(def: ActionDef, ctx: ActionContext): number {
  const tags = def.tags;
  if (!tags) return 0;
  let score = 0;

  if (tags.picksContains) {
    const pickTags = new Set<string>();
    for (const p of ctx.picks) {
      pickTags.add(p.type);
      for (const t of p.tags) pickTags.add(t);
    }
    for (const want of tags.picksContains) {
      if (pickTags.has(want)) score += 1;
    }
  }

  if (tags.pageType && ctx.pageMeta.pageType && tags.pageType.includes(ctx.pageMeta.pageType)) {
    score += 1;
  }

  if (tags.language && tags.language.includes(ctx.pageMeta.primaryLang)) {
    score += 1;
  }

  return score;
}

export function rankHeroes(
  allActions: ActionDef[],
  heroPinOrder: string[],
  ctx: ActionContext
): RankedHeroes {
  const pinIndex = new Map(heroPinOrder.map((id, i) => [id, i]));

  const eligible = allActions
    .filter(a => pinIndex.has(a.id))
    .filter(a => a.surface.includes('hero'))
    .filter(a => isAvailable(a.availableWhen, ctx));

  const ranked = eligible
    .map(a => ({ a, score: tagScore(a, ctx), pin: pinIndex.get(a.id)! }))
    .sort((x, y) => {
      if (x.score !== y.score) return y.score - x.score;
      if (x.pin !== y.pin) return x.pin - y.pin;
      return x.a.label.localeCompare(y.a.label);
    })
    .map(({ a }) => a);

  return {
    visible: ranked.slice(0, MAX_VISIBLE_HEROES),
    overflow: ranked.slice(MAX_VISIBLE_HEROES),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test src/lib/actions/ranker.test.ts
```

Expected: All six tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/ranker.ts src/lib/actions/ranker.test.ts
git commit -m "feat(actions): add rule-based hero ranker with overflow"
```

---

## Task 19: Registry

Composes built-in core + enabled library + user actions, applies the hidden filter, and exposes `getVisibleHeroes` / `getSlashOptions`. Loads state on construction; mutation methods write through to storage.

**Files:**
- Create: `src/lib/actions/registry.ts`
- Create: `src/lib/actions/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/actions/registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createRegistry } from './registry';
import { memoryKV } from '../storage';
import { makeContext, makePick } from '../test-fixtures';

describe('ActionRegistry', () => {
  it('initializes with built-in core only when no user state stored', async () => {
    const r = await createRegistry(memoryKV());
    const ids = r.getAll().map(a => a.id).sort();
    expect(ids).toEqual(['ask', 'compare', 'summarize']);
  });

  it('seeds default hero order with [summarize, compare] on first run', async () => {
    const kv = memoryKV();
    await createRegistry(kv);
    const stored = await kv.get('wm:actions:hero');
    expect(stored).toEqual(['summarize', 'compare']);
  });

  it('includes enabled library entries in getAll', async () => {
    const kv = memoryKV();
    await kv.set('wm:actions:enabled-library', ['eli5']);
    const r = await createRegistry(kv);
    expect(r.getAll().some(a => a.id === 'eli5')).toBe(true);
  });

  it('excludes hidden ids from getAll', async () => {
    const kv = memoryKV();
    await kv.set('wm:actions:hidden', ['compare']);
    const r = await createRegistry(kv);
    expect(r.getAll().some(a => a.id === 'compare')).toBe(false);
  });

  it('getVisibleHeroes uses ranker output', async () => {
    const r = await createRegistry(memoryKV());
    const ctx = makeContext({ picks: [makePick(), makePick({ id: 'b' })] });
    const out = r.getVisibleHeroes(ctx);
    expect(out.map(a => a.id)).toEqual(['summarize', 'compare']);
  });

  it('getSlashOptions returns surface-slash actions that pass availability', async () => {
    const r = await createRegistry(memoryKV());
    const ctx = makeContext({ picks: [makePick()] });
    const out = r.getSlashOptions(ctx);
    const ids = out.map(a => a.id);
    expect(ids).toContain('summarize');
    expect(ids).toContain('ask');
    expect(ids).not.toContain('compare');     // compare needs 2+ picks
  });

  it('enableFromLibrary persists the id', async () => {
    const kv = memoryKV();
    const r = await createRegistry(kv);
    const res = await r.enableFromLibrary('eli5');
    expect(res.ok).toBe(true);
    expect(await kv.get('wm:actions:enabled-library')).toEqual(['eli5']);
  });

  it('enableFromLibrary rejects an unknown id', async () => {
    const r = await createRegistry(memoryKV());
    const res = await r.enableFromLibrary('not-real');
    expect(res.ok).toBe(false);
  });

  it('registerUser validates and persists', async () => {
    const kv = memoryKV();
    const r = await createRegistry(kv);
    const def = {
      id: 'my-act',
      label: 'My',
      source: 'user' as const,
      surface: ['slash'] as ('hero' | 'slash')[],
      acceptsFreeText: false,
      acceptsModifiers: [],
      availableWhen: { kind: 'always' as const },
      prompt: { user: 'Do {{selections}}' },
      apiPreference: 'prompt' as const,
    };
    const res = await r.registerUser(def);
    expect(res.ok).toBe(true);
    expect(r.getById('my-act')).toBeTruthy();
  });

  it('registerUser rejects invalid action', async () => {
    const r = await createRegistry(memoryKV());
    const res = await r.registerUser({
      id: '',
      label: '',
      source: 'user',
      surface: [],
      acceptsFreeText: false,
      acceptsModifiers: [],
      availableWhen: { kind: 'always' },
      prompt: { user: '' },
      apiPreference: 'prompt',
    });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test src/lib/actions/registry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `registry.ts`**

```ts
// src/lib/actions/registry.ts
import type { ActionDef, ActionContext, ModifierDef, ValidateResult } from '../types/action';
import type { KVStore } from '../storage';
import { BUILTIN_CORE_ACTIONS, BUILTIN_MODIFIERS, BUILTIN_CORE_IDS } from './builtins/index';
import { LIBRARY_ACTIONS, LIBRARY_IDS } from './library';
import { createActionsStorage, ActionsStorage } from './storage';
import { isAvailable } from './availability';
import { rankHeroes } from './ranker';
import { validateAction } from './validate';

export interface ActionRegistry {
  // Read
  getAll(): ActionDef[];
  getById(id: string): ActionDef | null;
  getVisibleHeroes(ctx: ActionContext): ActionDef[];
  getSlashOptions(ctx: ActionContext): ActionDef[];
  getModifiers(): ModifierDef[];
  getLibrary(): ActionDef[];
  // Mutate
  enableFromLibrary(id: string): Promise<ValidateResult>;
  disableFromLibrary(id: string): Promise<void>;
  registerUser(def: ActionDef): Promise<ValidateResult>;
  unregister(id: string): Promise<ValidateResult>;
  setHeroOrder(ids: string[]): Promise<void>;
  setHidden(ids: string[]): Promise<void>;
}

const DEFAULT_HERO_ORDER = ['summarize', 'compare'];

export async function createRegistry(kv: KVStore): Promise<ActionRegistry> {
  const storage = createActionsStorage(kv);

  let userActions: ActionDef[] = await storage.loadUserActions();
  let heroOrder: string[] = await storage.loadHeroOrder();
  let hidden: Set<string> = new Set(await storage.loadHidden());
  let enabledLibrary: Set<string> = new Set(await storage.loadEnabledLibrary());

  // First-run seed.
  if (heroOrder.length === 0) {
    heroOrder = [...DEFAULT_HERO_ORDER];
    await storage.saveHeroOrder(heroOrder);
  }

  function compose(): ActionDef[] {
    const all: ActionDef[] = [];
    for (const a of BUILTIN_CORE_ACTIONS) all.push(a);
    for (const a of LIBRARY_ACTIONS) if (enabledLibrary.has(a.id)) all.push(a);
    for (const a of userActions) all.push(a);
    return all.filter(a => !hidden.has(a.id));
  }

  return {
    getAll() { return compose(); },

    getById(id) {
      return compose().find(a => a.id === id) ?? null;
    },

    getVisibleHeroes(ctx) {
      const { visible } = rankHeroes(compose(), heroOrder, ctx);
      return visible;
    },

    getSlashOptions(ctx) {
      return compose()
        .filter(a => a.surface.includes('slash'))
        .filter(a => isAvailable(a.availableWhen, ctx));
    },

    getModifiers() { return BUILTIN_MODIFIERS; },

    getLibrary() { return LIBRARY_ACTIONS; },

    async enableFromLibrary(id) {
      if (!LIBRARY_IDS.has(id)) {
        return { ok: false, errors: [{ field: 'id', message: `unknown library id: ${id}` }] };
      }
      enabledLibrary.add(id);
      await storage.saveEnabledLibrary([...enabledLibrary]);
      return { ok: true };
    },

    async disableFromLibrary(id) {
      enabledLibrary.delete(id);
      await storage.saveEnabledLibrary([...enabledLibrary]);
    },

    async registerUser(def) {
      const result = validateAction(def);
      if (!result.ok) return result;
      if (BUILTIN_CORE_IDS.has(def.id) || LIBRARY_IDS.has(def.id)) {
        return { ok: false, errors: [{ field: 'id', message: `id collides with a built-in: ${def.id}` }] };
      }
      const existingIdx = userActions.findIndex(a => a.id === def.id);
      if (existingIdx >= 0) userActions[existingIdx] = def;
      else userActions.push(def);
      await storage.saveUserActions(userActions);
      return { ok: true };
    },

    async unregister(id) {
      if (BUILTIN_CORE_IDS.has(id)) {
        return { ok: false, errors: [{ field: 'id', message: 'cannot unregister built-in core' }] };
      }
      userActions = userActions.filter(a => a.id !== id);
      enabledLibrary.delete(id);
      await storage.saveUserActions(userActions);
      await storage.saveEnabledLibrary([...enabledLibrary]);
      return { ok: true };
    },

    async setHeroOrder(ids) {
      heroOrder = [...ids];
      await storage.saveHeroOrder(heroOrder);
    },

    async setHidden(ids) {
      hidden = new Set(ids);
      await storage.saveHidden([...hidden]);
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test src/lib/actions/registry.test.ts
```

Expected: All ten tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/registry.ts src/lib/actions/registry.test.ts
git commit -m "feat(actions): add ActionRegistry composing core + library + user"
```

---

## Task 20: API routing

Routes an `apiPreference` (with fallback chain) to a concrete adapter. Plan 1 ships the dispatch logic and a no-op adapter set; Plan 2 wires real adapters that hit Chrome AI / BYOK providers. The point now is to have a tested seam so the registry can build prompts and dispatch to *something* in tests.

**Files:**
- Create: `src/lib/actions/api-route.ts`
- Create: `src/lib/actions/api-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/actions/api-route.test.ts
import { describe, it, expect } from 'vitest';
import { selectAdapter, AdapterMap } from './api-route';

describe('selectAdapter', () => {
  const adapters: AdapterMap = {
    summarizer: { name: 'summarizer', available: () => true },
    prompt:     { name: 'prompt',     available: () => true },
    translator: { name: 'translator', available: () => true },
  };

  it('picks the preferred adapter when available', () => {
    expect(selectAdapter('prompt', undefined, adapters)?.name).toBe('prompt');
  });

  it('falls back when the preferred adapter is unavailable', () => {
    const half: AdapterMap = {
      summarizer: { name: 'summarizer', available: () => false },
      prompt:     { name: 'prompt',     available: () => true },
      translator: { name: 'translator', available: () => true },
    };
    expect(selectAdapter('summarizer', ['prompt'], half)?.name).toBe('prompt');
  });

  it('returns null when no adapter in the chain is available', () => {
    const none: AdapterMap = {
      summarizer: { name: 'summarizer', available: () => false },
      prompt:     { name: 'prompt',     available: () => false },
      translator: { name: 'translator', available: () => false },
    };
    expect(selectAdapter('summarizer', ['prompt', 'translator'], none)).toBeNull();
  });

  it('ignores unknown adapter ids in the fallback chain', () => {
    expect(selectAdapter('summarizer', ['unknown' as any, 'prompt'], adapters)?.name).toBe('summarizer');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test src/lib/actions/api-route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `api-route.ts`**

```ts
// src/lib/actions/api-route.ts
import type { ApiPref } from '../types/action';

/**
 * Minimal adapter shape: enough for the registry/router to introspect.
 * The actual `run` method is added in Plan 2 when real Chrome AI / BYOK
 * adapters are wired. Keeping this lean here means the registry can be
 * tested without pulling in AI implementations.
 */
export interface ApiAdapter {
  name: ApiPref;
  available(): boolean;
}

export type AdapterMap = Record<ApiPref, ApiAdapter>;

export function selectAdapter(
  preferred: ApiPref,
  fallback: ApiPref[] | undefined,
  adapters: AdapterMap
): ApiAdapter | null {
  const chain: ApiPref[] = [preferred, ...(fallback ?? [])];
  for (const id of chain) {
    const a = adapters[id];
    if (a && a.available()) return a;
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test src/lib/actions/api-route.test.ts
```

Expected: All four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/api-route.ts src/lib/actions/api-route.test.ts
git commit -m "feat(actions): add api-route adapter selector with fallback chain"
```

---

## Task 21: Thread store

Per-URL thread persistence in `chrome.storage.local`, keyed by `wm:thread:<origin><pathname>`. Maintains an LRU index, enforces the 50-thread cap, and exposes archive on `Start fresh`.

**Files:**
- Create: `src/lib/thread/store.ts`
- Create: `src/lib/thread/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/thread/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createThreadStore, RESTORATION_WINDOW_MS, MAX_ACTIVE_THREADS } from './store';
import { memoryKV } from '../storage';
import { makeThread } from '../test-fixtures';

describe('thread store', () => {
  let kv: ReturnType<typeof memoryKV>;
  let store: ReturnType<typeof createThreadStore>;
  beforeEach(() => { kv = memoryKV(); store = createThreadStore(kv); });

  it('returns null when no thread is stored for a URL', async () => {
    expect(await store.load('https://example.com', '/x')).toBeNull();
  });

  it('saves and loads a thread by origin+pathname', async () => {
    const t = makeThread({ id: 'https://example.com/x', origin: 'https://example.com', pathname: '/x' });
    await store.save(t);
    const back = await store.load('https://example.com', '/x');
    expect(back?.id).toBe(t.id);
  });

  it('updates the index entry on save', async () => {
    const t = makeThread({ id: 'https://example.com/x', origin: 'https://example.com', pathname: '/x' });
    await store.save(t);
    const idx = await store.loadIndex();
    expect(idx.find(e => e.id === t.id)).toBeTruthy();
  });

  it('skips restoration when older than the window', async () => {
    const oldTs = Date.now() - RESTORATION_WINDOW_MS - 1000;
    const t = makeThread({
      id: 'https://example.com/old',
      origin: 'https://example.com',
      pathname: '/old',
      lastTouchedAt: oldTs,
    });
    await store.save(t);
    expect(await store.loadIfFresh('https://example.com', '/old')).toBeNull();
  });

  it('returns the thread when inside the restoration window', async () => {
    const t = makeThread({
      id: 'https://example.com/fresh',
      origin: 'https://example.com',
      pathname: '/fresh',
      lastTouchedAt: Date.now() - 1000,
    });
    await store.save(t);
    expect(await store.loadIfFresh('https://example.com', '/fresh')).not.toBeNull();
  });

  it('evicts the oldest thread when over MAX_ACTIVE_THREADS', async () => {
    for (let i = 0; i < MAX_ACTIVE_THREADS + 2; i++) {
      const t = makeThread({
        id: `https://example.com/p${i}`,
        origin: 'https://example.com',
        pathname: `/p${i}`,
        lastTouchedAt: i,    // small ts → oldest
      });
      await store.save(t);
    }
    const idx = await store.loadIndex();
    expect(idx.filter(e => !e.archived).length).toBe(MAX_ACTIVE_THREADS);
    // p0 (oldest) should be gone.
    expect(await store.load('https://example.com', '/p0')).toBeNull();
    // p1 was the second-oldest; also gone since we added two over the cap.
    expect(await store.load('https://example.com', '/p1')).toBeNull();
  });

  it('archive() moves a thread aside and removes its active key', async () => {
    const t = makeThread({ id: 'https://example.com/a', origin: 'https://example.com', pathname: '/a' });
    await store.save(t);
    await store.archive('https://example.com', '/a');
    expect(await store.load('https://example.com', '/a')).toBeNull();
    const idx = await store.loadIndex();
    expect(idx.find(e => e.id === t.id)?.archived).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test src/lib/thread/store.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `store.ts`**

```ts
// src/lib/thread/store.ts
import type { Thread, ThreadIndexEntry } from '../types/thread';
import type { KVStore } from '../storage';

const PREFIX = 'wm:thread:';
const ARCHIVE_PREFIX = 'wm:thread-archive:';
const INDEX_KEY = 'wm:thread-index';

export const MAX_ACTIVE_THREADS = 50;
export const RESTORATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;     // 7 days

function key(origin: string, pathname: string): string {
  return `${PREFIX}${origin}${pathname}`;
}

function archiveKey(threadId: string): string {
  return `${ARCHIVE_PREFIX}${threadId}`;
}

export interface ThreadStore {
  load(origin: string, pathname: string): Promise<Thread | null>;
  loadIfFresh(origin: string, pathname: string): Promise<Thread | null>;
  save(thread: Thread): Promise<void>;
  archive(origin: string, pathname: string): Promise<void>;
  loadIndex(): Promise<ThreadIndexEntry[]>;
}

export function createThreadStore(kv: KVStore): ThreadStore {
  async function readIndex(): Promise<ThreadIndexEntry[]> {
    return (await kv.get<ThreadIndexEntry[]>(INDEX_KEY)) ?? [];
  }

  async function writeIndex(idx: ThreadIndexEntry[]): Promise<void> {
    await kv.set(INDEX_KEY, idx);
  }

  async function evictIfNeeded(): Promise<void> {
    const idx = await readIndex();
    const active = idx.filter(e => !e.archived).sort((a, b) => a.lastTouchedAt - b.lastTouchedAt);
    while (active.length > MAX_ACTIVE_THREADS) {
      const oldest = active.shift()!;
      // Remove its KV entry; mark out of index entirely (no archive — strict LRU).
      const parts = oldest.id.match(/^(https?:\/\/[^/]+)(\/.*)?$/);
      if (parts) {
        const origin = parts[1];
        const pathname = parts[2] ?? '/';
        await kv.remove(key(origin, pathname));
      }
    }
    const remaining = (await readIndex()).filter(e => e.archived || active.some(a => a.id === e.id));
    await writeIndex(remaining);
  }

  return {
    async load(origin, pathname) {
      return await kv.get<Thread>(key(origin, pathname));
    },

    async loadIfFresh(origin, pathname) {
      const t = await kv.get<Thread>(key(origin, pathname));
      if (!t) return null;
      if (Date.now() - t.lastTouchedAt > RESTORATION_WINDOW_MS) return null;
      return t;
    },

    async save(thread) {
      await kv.set(key(thread.origin, thread.pathname), thread);
      const idx = await readIndex();
      const existing = idx.find(e => e.id === thread.id);
      if (existing) {
        existing.lastTouchedAt = thread.lastTouchedAt;
        existing.title = thread.title;
        existing.archived = false;
      } else {
        idx.push({
          id: thread.id,
          lastTouchedAt: thread.lastTouchedAt,
          title: thread.title,
          archived: false,
        });
      }
      await writeIndex(idx);
      await evictIfNeeded();
    },

    async archive(origin, pathname) {
      const t = await kv.get<Thread>(key(origin, pathname));
      if (!t) return;
      await kv.set(archiveKey(t.id), t);
      await kv.remove(key(origin, pathname));
      const idx = await readIndex();
      const e = idx.find(x => x.id === t.id);
      if (e) e.archived = true;
      await writeIndex(idx);
    },

    async loadIndex() {
      return readIndex();
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test src/lib/thread/store.test.ts
```

Expected: All seven tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/thread/store.ts src/lib/thread/store.test.ts
git commit -m "feat(thread): add per-URL thread store with LRU + archive"
```

---

## Task 22: Thread operations

High-level operations that combine the store with business rules: append a turn (and trim to 20), mark stale, rerun (replace a Magic turn), and promote a Magic turn into the existing `wm:memory` list.

**Files:**
- Create: `src/lib/thread/operations.ts`
- Create: `src/lib/thread/operations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/thread/operations.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createThreadOperations, MAX_TURNS_PER_THREAD } from './operations';
import { createThreadStore } from './store';
import { memoryKV } from '../storage';
import { makeThread, makePick } from '../test-fixtures';
import type { UserTurn, MagicTurn } from '../types/thread';
import type { MemoryEntry } from '../types';

function makeUserTurn(overrides: Partial<UserTurn> = {}): UserTurn {
  return {
    id: 't-user-1',
    role: 'user',
    kind: 'hero',
    actionId: 'summarize',
    modifiers: [],
    picks: [makePick()],
    ts: Date.now(),
    ...overrides,
  };
}

function makeMagicTurn(overrides: Partial<MagicTurn> = {}): MagicTurn {
  return {
    id: 't-magic-1',
    role: 'magic',
    inReplyTo: 't-user-1',
    answer: 'Magic answered.',
    sources: [makePick()],
    status: 'done',
    backend: 'nano',
    ts: Date.now(),
    ...overrides,
  };
}

describe('thread operations', () => {
  let kv: ReturnType<typeof memoryKV>;
  let store: ReturnType<typeof createThreadStore>;
  let ops: ReturnType<typeof createThreadOperations>;
  beforeEach(() => {
    kv = memoryKV();
    store = createThreadStore(kv);
    ops = createThreadOperations(store, kv);
  });

  it('appendTurn adds a turn and bumps lastTouchedAt', async () => {
    const t = makeThread();
    await store.save(t);
    const before = t.lastTouchedAt;
    await new Promise(r => setTimeout(r, 5));
    const updated = await ops.appendTurn(t.origin, t.pathname, makeUserTurn());
    expect(updated.turns).toHaveLength(1);
    expect(updated.lastTouchedAt).toBeGreaterThan(before);
  });

  it('appendTurn trims to MAX_TURNS_PER_THREAD when over cap', async () => {
    const t = makeThread();
    for (let i = 0; i < MAX_TURNS_PER_THREAD; i++) {
      t.turns.push(makeUserTurn({ id: `seed-${i}` }));
    }
    await store.save(t);
    const updated = await ops.appendTurn(t.origin, t.pathname, makeUserTurn({ id: 'fresh' }));
    expect(updated.turns).toHaveLength(MAX_TURNS_PER_THREAD);
    expect(updated.turns[updated.turns.length - 1].id).toBe('fresh');
    expect(updated.turns[0].id).toBe('seed-1');     // first seed evicted
  });

  it('rerunTurn replaces the matching Magic turn in place', async () => {
    const t = makeThread();
    t.turns.push(makeUserTurn());
    t.turns.push(makeMagicTurn({ id: 't-magic-old', answer: 'OLD' }));
    await store.save(t);

    const replacement = makeMagicTurn({ id: 't-magic-new', answer: 'NEW' });
    const updated = await ops.rerunTurn(t.origin, t.pathname, 't-magic-old', replacement);
    expect(updated.turns).toHaveLength(2);
    const last = updated.turns[updated.turns.length - 1] as MagicTurn;
    expect(last.id).toBe('t-magic-new');
    expect(last.answer).toBe('NEW');
  });

  it('promoteToMemory appends a MemoryEntry mapped from the turn', async () => {
    const t = makeThread();
    const user = makeUserTurn({ kind: 'ask', actionId: 'ask', text: 'why?' });
    const magic = makeMagicTurn({ inReplyTo: user.id, answer: 'because.' });
    t.turns.push(user, magic);
    await store.save(t);

    await ops.promoteToMemory(t, magic);

    const mem = (await kv.get<MemoryEntry[]>('wm:memory')) ?? [];
    expect(mem).toHaveLength(1);
    expect(mem[0].question).toBe('why?');
    expect(mem[0].answer).toBe('because.');
    expect(mem[0].action).toBe('ask');
    expect(mem[0].selections?.length).toBeGreaterThan(0);
  });

  it('promoteToMemory maps actionId to legacy MemoryAction', async () => {
    const t = makeThread();
    const user = makeUserTurn({ actionId: 'summarize', kind: 'hero', text: undefined });
    const magic = makeMagicTurn({ inReplyTo: user.id });
    t.turns.push(user, magic);
    await store.save(t);

    await ops.promoteToMemory(t, magic);
    const mem = (await kv.get<MemoryEntry[]>('wm:memory')) ?? [];
    expect(mem[0].action).toBe('summary');           // legacy mapping: summarize → summary
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test src/lib/thread/operations.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `operations.ts`**

```ts
// src/lib/thread/operations.ts
import type { Thread, Turn, MagicTurn, UserTurn } from '../types/thread';
import type { ThreadStore } from './store';
import type { KVStore } from '../storage';
import type { MemoryEntry, MemoryAction, SavedSelection } from '../types';

export const MAX_TURNS_PER_THREAD = 20;

const MEMORY_KEY = 'wm:memory';

export interface ThreadOperations {
  appendTurn(origin: string, pathname: string, turn: Turn): Promise<Thread>;
  rerunTurn(origin: string, pathname: string, oldMagicId: string, replacement: MagicTurn): Promise<Thread>;
  promoteToMemory(thread: Thread, magic: MagicTurn): Promise<void>;
}

/**
 * Maps a new action id to the legacy MemoryAction enum so the popup keeps
 * rendering correctly. New code should read MemoryEntry.action *only* for
 * back-compat display; the real action id will land in a future
 * `actionId` field added in Plan 2.
 */
function mapToLegacyAction(actionId: string, modifiers: string[]): MemoryAction {
  if (modifiers.includes('bullets')) return 'bullets';
  if (actionId === 'summarize') return 'summary';
  if (actionId === 'compare') return 'compare';
  return 'ask';
}

function pickRefToSavedSelection(p: import('../types/thread').PickRef): SavedSelection {
  const sel: SavedSelection = { tag: p.payload.tag };
  if (p.payload.text) sel.text = p.payload.text;
  if (p.payload.link) sel.link = { href: p.payload.link.href, text: p.payload.link.text };
  if (p.payload.image) sel.image = { src: p.payload.image.src, alt: p.payload.image.alt };
  if (p.selector) sel.selector = p.selector;
  return sel;
}

export function createThreadOperations(store: ThreadStore, kv: KVStore): ThreadOperations {
  async function loadOrThrow(origin: string, pathname: string): Promise<Thread> {
    const t = await store.load(origin, pathname);
    if (!t) throw new Error(`thread not found: ${origin}${pathname}`);
    return t;
  }

  return {
    async appendTurn(origin, pathname, turn) {
      const t = await loadOrThrow(origin, pathname);
      t.turns.push(turn);
      while (t.turns.length > MAX_TURNS_PER_THREAD) t.turns.shift();
      t.lastTouchedAt = Date.now();
      await store.save(t);
      return t;
    },

    async rerunTurn(origin, pathname, oldMagicId, replacement) {
      const t = await loadOrThrow(origin, pathname);
      const idx = t.turns.findIndex(x => x.role === 'magic' && x.id === oldMagicId);
      if (idx < 0) throw new Error(`magic turn not found: ${oldMagicId}`);
      t.turns[idx] = replacement;
      t.lastTouchedAt = Date.now();
      await store.save(t);
      return t;
    },

    async promoteToMemory(thread, magic) {
      const user = thread.turns.find(x => x.role === 'user' && x.id === magic.inReplyTo) as UserTurn | undefined;
      const url = `${thread.origin}${thread.pathname}`;
      const entry: MemoryEntry = {
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        url,
        title: thread.title,
        hostname: thread.origin.replace(/^https?:\/\//, ''),
        question: user?.text ?? (user ? user.actionId : magic.inReplyTo),
        answer: magic.answer,
        selections: magic.sources.map(pickRefToSavedSelection),
        action: mapToLegacyAction(user?.actionId ?? 'ask', user?.modifiers ?? []),
      };
      const existing = (await kv.get<MemoryEntry[]>(MEMORY_KEY)) ?? [];
      existing.push(entry);
      await kv.set(MEMORY_KEY, existing);
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test src/lib/thread/operations.test.ts
```

Expected: All five tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/thread/operations.ts src/lib/thread/operations.test.ts
git commit -m "feat(thread): add appendTurn, rerunTurn, promoteToMemory"
```

---

## Task 23: Full test suite + type-check verification

A final gate that confirms everything still hangs together. No new files.

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test
```

Expected: All test files pass. No skipped or failed tests.

- [ ] **Step 2: Run the type-checker**

```bash
pnpm compile
```

Expected: No errors. (TypeScript checks the whole project including existing `entrypoints/*` — Plan 1 did not touch them so they should still compile.)

- [ ] **Step 3: Run the production build**

```bash
pnpm build
```

Expected: WXT builds `.output/chrome-mv3/` successfully. (This confirms Vitest infra didn't break WXT's build pipeline.)

- [ ] **Step 4: Tag the foundation**

```bash
git tag plan1-foundation -m "Plan 1: actions + thread foundation complete"
git log --oneline -25
```

Expected: All Plan 1 commits visible in order; tag created.

---

## Plan 1 — exit criteria

A reviewer should be able to confirm:

- [ ] `pnpm test` passes with **all** tests green (Tasks 1, 6, 8, 9, 10, 15, 16, 17, 18, 19, 20, 21, 22).
- [ ] `pnpm compile` passes with no TypeScript errors.
- [ ] `pnpm build` succeeds and the unpacked extension still loads in Chrome (Plan 1 changed no entrypoint code; this is a smoke check that we didn't break the build).
- [ ] The unpacked extension behaves identically to before Plan 1 (no user-visible change — Plan 1 is purely additive lib code).
- [ ] `src/lib/actions/`, `src/lib/thread/`, `src/lib/storage.ts`, `src/lib/types/{payload,thread,action}.ts` all exist and are import-clean.
- [ ] No edits to `entrypoints/content/index.ts` or `entrypoints/content/content.css`.

When all six are checked, the foundation is ready. Plan 2 (Sidebar UI + Migration) consumes these modules and removes the v2.1 sheet.

---

## Self-review notes

I checked the plan against each section of the spec:

- **Spec §3.1 (state machine), §3.2 (geometry), §3.3 (pill), §3.4 (thread restoration)** — Plan 2 territory (UI). Plan 1 builds the thread store that §3.4's restoration uses (Task 21).
- **Spec §4 (conversation model)** — Tasks 4, 5 (types) + 21, 22 (store + operations).
- **Spec §5.1, 5.2 (action types and registry API)** — Task 5 (types) + Task 19 (registry).
- **Spec §5.3 (built-in core)** — Tasks 12, 13, 14, 15.
- **Spec §5.4 (library)** — Task 16, all 9 entries.
- **Spec §5.5 (smart contextual surfacing — ranker)** — Task 18. Tag classification on picks happens in the picker (Plan 2).
- **Spec §5.6 (user-authored actions and editor)** — Validation lives in Task 10; storage in Task 17; registry CRUD in Task 19. The *editor UI* itself is Plan 2.
- **Spec §5.7 (caps + edge cases)** — Action caps (25/50) enforced at the editor UI level (Plan 2); registry currently has no cap because validation and the editor surface it. Worth confirming with the reviewer.
- **Spec §6 (composer & turns rendering)** — Plan 2 territory (UI).
- **Spec §7 (code architecture)** — Plan 1 builds the `lib/*` files exactly as specified. Plan 2 builds `entrypoints/content/state.ts`, `pill.ts`, `overlay.ts`, `sidebar/*`.
- **Spec §8-10 (keyboard, errors, a11y)** — Plan 2 territory.
- **Spec §11 (migration)** — Plan 2 territory.
- **Spec §12 (testing notes)** — Plan 1 adds Vitest and unit-tests the lib layer per the spec's recommendation.
- **Spec §13 (open questions)** — Defaults used: action soft-cap of 25 / hard-cap of 50 are *not* enforced in the registry (left for the editor UI); restoration window of 7 days is hard-coded (`RESTORATION_WINDOW_MS` in store.ts).
- **Spec §14 (non-goals)** — Honored: no remote anything, no learned ranker, no agentic actions.

**Type consistency check:** `MemoryAction` is the existing enum (`'summary' | 'bullets' | 'ask' | 'compare'`). New `actionId: string` from `UserTurn` does not collide. Mapping in `promoteToMemory` (Task 22) folds `actionId` into legacy `MemoryAction` for the popup; a future `actionId` field on `MemoryEntry` is Plan 2's job. **PickRef** is referenced consistently across all tasks. **Backend** type used identically in `MagicTurn`, `ActionContext`. **ApiPref** identically in `ActionDef` and `api-route`.

**Placeholder scan:** No "TBD", "TODO", or "similar to Task N" entries. Every test and implementation block contains runnable code. Where Plan 1 stops short of a feature (e.g., the api-route's `run` method, the editor UI), the boundary is called out explicitly as Plan 2 territory rather than left ambiguous.

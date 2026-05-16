# Sidebar UI + Migration (Plan 2 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user-visible half of the rebuild: a right-docked conversational sidebar that consumes Plan 1's foundation, plus the Options→Actions Library UI, plus complete deletion of the v2.1 sheet code.

**Architecture:** Plan 2 has three concurrent shifts: (a) extract picker/AI internals out of the 1335-line content script into testable `lib/` modules, (b) build a new `entrypoints/content/sidebar/` UI layer that talks to Plan 1's registry/thread store via a typed event bus, (c) delete the v2.1 sheet entirely. Each phase ships in a state where the extension still builds and the previous user flows still work — until Phase F (the deletion), which flips the user-visible UI to the new sidebar in a single coherent change.

**Tech Stack:** TypeScript 5.6 (strict), Vitest + jsdom (for DOM-using tests), WXT 0.20, Chrome MV3, `chrome.storage.local`, Chrome AI APIs (Summarizer / Prompt / Translator) with BYOK fallback.

**Source Spec:** `docs/superpowers/specs/2026-05-16-sidebar-and-actions-design.md`
**Foundation:** Plan 1 (`docs/superpowers/plans/2026-05-16-actions-and-thread-foundation.md`), tagged `plan1-foundation`, merged in commit `65df184`.

**What's deferred to a follow-up (not Plan 2):** Custom user-authored action editor (UI for writing your own prompts beyond the library), JSON export/import for actions, drag-and-drop hero reordering (Plan 2 ships arrow-button reordering), sidebar resize handle (fixed 420px in v1), learned contextual ranker, agentic actions.

---

## File structure

```
src/lib/
  picker/                              (new — extracted from entrypoints/content/index.ts)
    detect-wiggle.ts
    detect-wiggle.test.ts
    resolve-target.ts
    resolve-target.test.ts
    extract-payload.ts
    extract-payload.test.ts
    classify-pick.ts                   (new — code/table/price/video/long/short tagging)
    classify-pick.test.ts
  ai/                                  (new — extracted + extended)
    backend.ts                          (capability detection)
    backend.test.ts
    stream.ts                           (stream abstraction)
    adapters/
      prompt.ts                         (Chrome AI Prompt API + BYOK)
      summarizer.ts                     (Chrome AI Summarizer API)
      translator.ts                     (Chrome AI Translator API)
      index.ts                          (build the AdapterMap)

entrypoints/content/                   (heavy rewrite)
  index.ts                             (shrinks from 1335 lines to ~120 lines: lifecycle + wiring only)
  state.ts                             (new — typed event bus + Mode state machine)
  state.test.ts
  pill.ts                              (new — selection-state pill; replaces #wm-sheet collapsed form)
  pill.css                             (new)
  overlay.ts                           (new — cursor + highlight + chipbar + ripples)
  overlay.css                          (new)
  content.css                          (modified — wm-sheet-* CSS deleted, ~660 lines)
  sidebar/                             (new — the rebuild)
    mount.ts
    shell.ts
    chip.ts
    composer.ts
    slash-menu.ts
    turn-list.ts
    turn-user.ts
    turn-magic.ts
    banners.ts                         (restoration banner, stale banner, error banner)
    sidebar.css

entrypoints/options/                   (extended)
  index.html                           (modified — add Actions tab markup)
  main.ts                              (modified — tab routing)
  actions-library.ts                   (new — browse library, enable/disable, pin/unpin)
  actions.css                          (new)

entrypoints/popup/
  main.ts                              (modified — migrate raw chrome.storage.local → chromeKV)
```

**Files explicitly deleted in Phase F:**
- `entrypoints/content/index.ts` lines for the sheet module (`sheet.show`, `sheet.askAI`, `sheet.save`, `sheet.copy`, `sheet.rerun`, `sheet.onChipRemove`, `sheet.showError`, etc. — ~600 lines)
- `entrypoints/content/content.css` lines for `#wm-sheet*` rules (~660 lines)
- The DOM markup for `#wm-sheet` and its children (in the `root.innerHTML` template)

---

## Tech context for a fresh engineer

This plan picks up after Plan 1 merged. Plan 1 added `src/lib/{storage, types, actions, thread, test-fixtures}` as pure additions — nothing user-visible changed yet. The existing extension still runs the v2.1 sheet UI. Plan 2 wires the foundation in and deletes the sheet.

**Project commands:**
- `pnpm install` — first time on this branch
- `pnpm test` — Vitest (foundation tests must keep passing; new tests added per task)
- `pnpm compile` — type-check
- `pnpm dev` — WXT watch build → `.output/chrome-mv3-dev/`
- `pnpm build` — production build → `.output/chrome-mv3/`

**Test environment note:** Plan 1's tests all ran in `node` environment (DOM-free modules). Several Plan 2 tasks need DOM testing (picker classifiers, sidebar components). Task 1 of this plan adds jsdom and switches Vitest config to allow per-file environment via the `// @vitest-environment jsdom` pragma. DOM-free modules continue to run in node.

**Cross-module communication:** Plan 1's `lib/` modules expose factories (`createRegistry(kv)`, `createThreadStore(kv)`, `createThreadOperations(store, kv)`). The content script is the single wiring point — it instantiates the KV adapter, registry, and thread store at startup, then routes events between the picker (event source) and the sidebar (event sink) via the event bus in `entrypoints/content/state.ts` (Task 9).

**The Mode state machine** (formalized in Task 9):
```
Mode = 'idle' | 'selecting' | 'sidebar' | 'sidebar+selecting'
```
- `idle` → `selecting` via wiggle gesture or `Alt+Shift+M`
- `selecting` → `sidebar` via `Enter` (commit)
- `sidebar` → `sidebar+selecting` via wiggle / `Alt+Shift+M` (= `+Add`)
- `sidebar+selecting` → `sidebar` via `Enter` (commit staged picks into composer)
- Any → `idle` via `Esc` / `×`

**Where the existing v2.1 sheet UI lives** (read before extracting):
- DOM template: `entrypoints/content/index.ts` lines 39-127 (`root.innerHTML = `…`` block)
- Module-style `sheet` namespace logic: search `index.ts` for `function sheet` and related
- All `#wm-sheet*` CSS: `entrypoints/content/content.css` (most of file 121 onwards)

**Don't break the wiggle gesture.** It's the project's signature. The wiggle detector + smart-escalate resolution stays behavior-identical through Plan 2; only its *location* changes (inline → `lib/picker/`).

---

## Phase A: Picker + AI extractions

Extractions from `entrypoints/content/index.ts` into testable `lib/` modules. Each extraction does: (1) copy code into new module, (2) write tests against the new module, (3) replace inline call site with an import, (4) verify behavior unchanged via `pnpm compile` + manual smoke test in Chrome.

---

## Task 1: Add jsdom to Vitest for DOM tests

**Files:**
- Modify: `package.json`, `vitest.config.ts`

- [ ] **Step 1: Install jsdom**

```bash
pnpm add -D jsdom@^25 @types/jsdom@^21
```

- [ ] **Step 2: Update `vitest.config.ts`**

Replace the existing config with:
```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',     // default; per-file pragma `// @vitest-environment jsdom` opts in
    globals: false,
    include: ['src/**/*.test.ts', 'entrypoints/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
```

Two changes vs Plan 1: glob now also catches `entrypoints/**/*.test.ts` (for state.ts and other entrypoint tests Plan 2 will add), and the comment documents the per-file environment pragma.

- [ ] **Step 3: Verify**

```bash
pnpm test
```

Expected: 110 tests still pass (Plan 1 tests run in node — no change).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "build(test): add jsdom for DOM-using tests; include entrypoints/**"
```

---

## Task 2: Extract wiggle detector → `src/lib/picker/detect-wiggle.ts`

The wiggle detector is currently inline in `entrypoints/content/index.ts` (`onPointerMove`, the `opts` block, and the reversal-counting math). Pure function — easy to test without DOM.

**Files:**
- Create: `src/lib/picker/detect-wiggle.ts`, `src/lib/picker/detect-wiggle.test.ts`
- Modify: `entrypoints/content/index.ts` (swap inline math for the import)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/picker/detect-wiggle.test.ts
import { describe, it, expect } from 'vitest';
import { createWiggleDetector, DEFAULT_WIGGLE_OPTS } from './detect-wiggle';

function feed(d: ReturnType<typeof createWiggleDetector>, samples: { x: number; y: number; t: number }[]) {
  let triggered = false;
  for (const s of samples) {
    if (d.observe(s.x, s.y, s.t)) triggered = true;
  }
  return triggered;
}

describe('createWiggleDetector', () => {
  it('does not fire under minSamples', () => {
    const d = createWiggleDetector();
    expect(feed(d, [{ x: 0, y: 0, t: 0 }, { x: 10, y: 0, t: 10 }])).toBe(false);
  });

  it('fires on a tight zig-zag with enough reversals', () => {
    const d = createWiggleDetector();
    // 6 samples: 0, +20, 0, +20, 0, +20 over 60ms = 4 reversals, ~0.66 px/ms speed
    const samples = [
      { x: 0,  y: 0, t: 0 },
      { x: 20, y: 0, t: 10 },
      { x: 0,  y: 0, t: 20 },
      { x: 20, y: 0, t: 30 },
      { x: 0,  y: 0, t: 40 },
      { x: 20, y: 0, t: 50 },
    ];
    expect(feed(d, samples)).toBe(true);
  });

  it('respects cooldown — does not fire twice in close succession', () => {
    const d = createWiggleDetector();
    const burst = [
      { x: 0,  y: 0, t: 0 },
      { x: 20, y: 0, t: 10 },
      { x: 0,  y: 0, t: 20 },
      { x: 20, y: 0, t: 30 },
      { x: 0,  y: 0, t: 40 },
      { x: 20, y: 0, t: 50 },
    ];
    expect(feed(d, burst)).toBe(true);
    // Second burst within cooldown — should NOT fire
    const repeat = burst.map(s => ({ ...s, t: s.t + 100 }));     // 100ms later
    expect(feed(d, repeat)).toBe(false);
  });

  it('does not fire when motion exceeds maxRadius (drift, not wiggle)', () => {
    const d = createWiggleDetector();
    const drift = [
      { x: 0,   y: 0, t: 0 },
      { x: 200, y: 0, t: 10 },
      { x: 0,   y: 0, t: 20 },
      { x: 300, y: 0, t: 30 },
      { x: 0,   y: 0, t: 40 },
      { x: 400, y: 0, t: 50 },    // radius now 400 > default 220
    ];
    expect(feed(d, drift)).toBe(false);
  });

  it('exposes default opts', () => {
    expect(DEFAULT_WIGGLE_OPTS.windowMs).toBe(600);
    expect(DEFAULT_WIGGLE_OPTS.minReversals).toBe(4);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test src/lib/picker/detect-wiggle.test.ts
```
Expected: module not found.

- [ ] **Step 3: Write `detect-wiggle.ts`**

```ts
// src/lib/picker/detect-wiggle.ts

export interface WiggleOpts {
  windowMs: number;
  minReversals: number;
  maxRadius: number;
  minSpeedPxMs: number;
  minDx: number;
  minSamples: number;
  cooldownMs: number;
}

export const DEFAULT_WIGGLE_OPTS: WiggleOpts = {
  windowMs: 600,
  minReversals: 4,
  maxRadius: 220,
  minSpeedPxMs: 0.25,
  minDx: 3,
  minSamples: 5,
  cooldownMs: 1200,
};

interface Sample { x: number; y: number; t: number; }

export interface WiggleDetector {
  /** Feed a pointer sample. Returns true on the frame the gesture fires. */
  observe(x: number, y: number, t: number): boolean;
  reset(): void;
}

export function createWiggleDetector(opts: WiggleOpts = DEFAULT_WIGGLE_OPTS): WiggleDetector {
  const samples: Sample[] = [];
  let lastTrigger = 0;

  return {
    observe(x, y, t) {
      if (t - lastTrigger < opts.cooldownMs) return false;
      samples.push({ x, y, t });
      while (samples.length && t - samples[0].t > opts.windowMs) samples.shift();
      if (samples.length < opts.minSamples) return false;

      let reversals = 0;
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let dist = 0;
      let dirPrev = 0;
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1], b = samples[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        dist += Math.hypot(dx, dy);
        if (Math.abs(dx) >= opts.minDx) {
          const dir = dx > 0 ? 1 : -1;
          if (dirPrev && dir !== dirPrev) reversals++;
          dirPrev = dir;
        }
        if (b.x < minX) minX = b.x; if (b.x > maxX) maxX = b.x;
        if (b.y < minY) minY = b.y; if (b.y > maxY) maxY = b.y;
      }
      const dt = samples[samples.length - 1].t - samples[0].t;
      const speed = dist / Math.max(dt, 1);
      const radius = Math.max(maxX - minX, maxY - minY);

      if (reversals >= opts.minReversals && radius <= opts.maxRadius && speed >= opts.minSpeedPxMs) {
        lastTrigger = t;
        samples.length = 0;
        return true;
      }
      return false;
    },
    reset() {
      samples.length = 0;
      lastTrigger = 0;
    },
  };
}
```

- [ ] **Step 4: Run to verify green**

```bash
pnpm test src/lib/picker/detect-wiggle.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 5: Replace inline detector in `entrypoints/content/index.ts`**

Find the `opts` block (currently ~lines 11-19) and the `onPointerMove` function (currently ~lines 188-229). Replace with:

```ts
import { createWiggleDetector, DEFAULT_WIGGLE_OPTS } from '@/src/lib/picker/detect-wiggle';

// ... inside the IIFE, near the top:
const wiggle = createWiggleDetector(DEFAULT_WIGGLE_OPTS);

function onPointerMove(e: MouseEvent): void {
  cursorX = e.clientX;
  cursorY = e.clientY;
  if (picker.mode === 'activating' || picker.mode === 'sheet') return;
  if (picker.mode === 'selecting') schedulePaint();

  if (wiggle.observe(cursorX, cursorY, performance.now())) {
    if (picker.mode === 'idle') activate(cursorX, cursorY);
    else if (picker.mode === 'selecting') deactivate();
  }
}
```

Delete the now-unused `samples` and `lastTrigger` module-level variables.

- [ ] **Step 6: Verify**

```bash
pnpm compile && pnpm build && pnpm test
```
All clean. Tests still 115 passing (110 + 5 new).

**Manual smoke (Chrome):** load `.output/chrome-mv3-dev/`, wiggle on any page, confirm selection mode still activates and the cursor still morphs to the gradient pointer.

- [ ] **Step 7: Commit**

```bash
git add src/lib/picker/detect-wiggle.ts src/lib/picker/detect-wiggle.test.ts entrypoints/content/index.ts
git commit -m "refactor(picker): extract wiggle detector to lib/picker/detect-wiggle"
```

---

## Task 3: Extract `resolve-target` + add pick tag classification

`resolveTarget()` and the `SEMANTIC_TAGS` set currently live inline in `entrypoints/content/index.ts`. Plus we add a new `classifyPick()` that attaches the contextual tags (code, table, price, video, long, short) the ranker uses.

**Files:**
- Create: `src/lib/picker/resolve-target.ts`, `src/lib/picker/resolve-target.test.ts`
- Create: `src/lib/picker/classify-pick.ts`, `src/lib/picker/classify-pick.test.ts`
- Modify: `entrypoints/content/index.ts`

- [ ] **Step 1: Write the failing tests (with jsdom)**

```ts
// src/lib/picker/resolve-target.test.ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { resolveTarget } from './resolve-target';

function dom(html: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  return wrap;
}

describe('resolveTarget', () => {
  it('escalates from span to enclosing <p>', () => {
    const wrap = dom('<p>Hello <span id="x">world</span></p>');
    const span = wrap.querySelector('#x')!;
    expect(resolveTarget(span).tagName.toLowerCase()).toBe('p');
  });

  it('escalates from inner <img> to <figure>', () => {
    const wrap = dom('<figure><img id="i" src=""></figure>');
    const img = wrap.querySelector('#i')!;
    expect(resolveTarget(img).tagName.toLowerCase()).toBe('figure');
  });

  it('does not escalate into a giant container (>30 children)', () => {
    const items = Array.from({ length: 40 }, (_, i) => `<p>p${i}</p>`).join('');
    const wrap = dom(`<article>${items}</article>`);
    const p = wrap.querySelectorAll('p')[5];
    // Article has 40 children — escalation should stop at <p>, not climb to <article>.
    expect(resolveTarget(p).tagName.toLowerCase()).toBe('p');
  });

  it('falls back to the original element when no semantic ancestor', () => {
    const wrap = dom('<div><div id="d"><span id="s">x</span></div></div>');
    const span = wrap.querySelector('#s')!;
    // No semantic ancestor → resolves to first non-tiny ancestor it tried; in this case the span itself.
    const r = resolveTarget(span);
    expect(['span', 'div']).toContain(r.tagName.toLowerCase());
  });
});
```

```ts
// src/lib/picker/classify-pick.test.ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { classifyPick } from './classify-pick';

function el(html: string): HTMLElement {
  const w = document.createElement('div');
  w.innerHTML = html;
  document.body.appendChild(w);
  return w.firstElementChild as HTMLElement;
}

describe('classifyPick', () => {
  it('tags a <pre> as code', () => {
    expect(classifyPick(el('<pre>const x = 1;</pre>'))).toContain('code');
  });

  it('tags an element with hljs class as code', () => {
    expect(classifyPick(el('<div class="hljs">code</div>'))).toContain('code');
  });

  it('tags a <table> as table', () => {
    expect(classifyPick(el('<table><tr><td>x</td></tr></table>'))).toContain('table');
  });

  it('tags currency-bearing text as price', () => {
    expect(classifyPick(el('<p>The price is $19.99</p>'))).toContain('price');
  });

  it('tags long text as long', () => {
    const long = 'word '.repeat(400);    // 2000 chars
    expect(classifyPick(el(`<p>${long}</p>`))).toContain('long');
  });

  it('tags short text as short', () => {
    expect(classifyPick(el('<p>hi</p>'))).toContain('short');
  });

  it('returns empty array for an unremarkable paragraph', () => {
    const mid = 'word '.repeat(80);     // 400 chars — between short and long
    expect(classifyPick(el(`<p>${mid}</p>`))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```bash
pnpm test src/lib/picker/
```
Expected: both files fail (modules not found).

- [ ] **Step 3: Write `resolve-target.ts`**

```ts
// src/lib/picker/resolve-target.ts

const SEMANTIC_TAGS = new Set([
  'p', 'li', 'blockquote',
  'article', 'section', 'figure', 'picture',
  'img', 'video', 'audio',
  'table', 'tr', 'th', 'td',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'button',
]);

export function resolveTarget(el: Element): Element {
  let cur: Element | null = el;
  while (cur && cur !== document.body) {
    if (SEMANTIC_TAGS.has(cur.tagName.toLowerCase())) return cur;
    if (cur.parentElement && cur.parentElement.children.length > 30) return cur;
    cur = cur.parentElement;
  }
  return el;
}
```

- [ ] **Step 4: Write `classify-pick.ts`**

```ts
// src/lib/picker/classify-pick.ts
import type { PickTag } from '../types/payload';

const CURRENCY_REGEX = /[$€£¥₹]\s?\d/;
const CODE_CLASS_REGEX = /\b(hljs|prism|highlight|language-|code-block)\b/;

export function classifyPick(el: Element): PickTag[] {
  const tags: PickTag[] = [];
  const tag = el.tagName.toLowerCase();
  const text = (el as HTMLElement).innerText ?? el.textContent ?? '';

  // Code
  if (tag === 'pre' || tag === 'code') tags.push('code');
  else if (el.className && CODE_CLASS_REGEX.test((el as HTMLElement).className)) tags.push('code');
  else if (el.querySelector('pre, code')) tags.push('code');

  // Table
  if (tag === 'table' || el.getAttribute('role') === 'grid') tags.push('table');

  // Price
  if (CURRENCY_REGEX.test(text)) tags.push('price');

  // Video
  if (tag === 'video' || el.querySelector('video')) tags.push('video');

  // Length
  const len = text.length;
  if (len > 1500) tags.push('long');
  else if (len < 200 && len > 0) tags.push('short');

  return tags;
}
```

- [ ] **Step 5: Run to verify green**

```bash
pnpm test src/lib/picker/
```
Expected: 11 tests pass across both files.

- [ ] **Step 6: Replace inline `resolveTarget` in `entrypoints/content/index.ts`**

Find the inline `SEMANTIC_TAGS` declaration and the `picker.resolveTarget` function. Replace with:

```ts
import { resolveTarget } from '@/src/lib/picker/resolve-target';

// ... in the picker module-object:
const picker = {
  // ... other fields ...
  resolveTarget,
};
```

Delete the inline function and its `SEMANTIC_TAGS` constant.

- [ ] **Step 7: Verify**

```bash
pnpm compile && pnpm build && pnpm test
```
Expected: all green, 121 tests (115 + 6 new from classify).

Manual smoke: wiggle, hover over a span inside a paragraph, confirm dashed outline highlights the paragraph (not just the span). Hover over an image in a figure, confirm the figure highlights.

- [ ] **Step 8: Commit**

```bash
git add src/lib/picker/resolve-target.ts src/lib/picker/resolve-target.test.ts \
       src/lib/picker/classify-pick.ts src/lib/picker/classify-pick.test.ts \
       entrypoints/content/index.ts
git commit -m "refactor(picker): extract resolveTarget; add classifyPick for ranker tags"
```

---

## Task 4: Extract `extract-payload` → `src/lib/picker/extract-payload.ts`

The payload-building logic (`buildPayload` or equivalent — search `index.ts` for where a `Payload` object gets assembled from an element) moves to `lib/`.

**Files:**
- Create: `src/lib/picker/extract-payload.ts`, `src/lib/picker/extract-payload.test.ts`
- Modify: `entrypoints/content/index.ts`

- [ ] **Step 1: Locate the existing payload builder**

Find where `Payload` is constructed from an `Element` in `entrypoints/content/index.ts`. Typically this is a function that reads `el.innerText`, `el.outerHTML` (or similar), iterates `el.attributes` for `aria-*` / `data-*`, peeks at `<img>` / `<a>` descendants, etc. Copy its body for the next step.

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/picker/extract-payload.test.ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractPayload } from './extract-payload';

function dom(html: string) {
  const w = document.createElement('div');
  w.innerHTML = html;
  document.body.appendChild(w);
  return w.firstElementChild as HTMLElement;
}

describe('extractPayload', () => {
  it('captures innerText of a paragraph', () => {
    const p = dom('<p>Hello world</p>');
    const out = extractPayload(p, 'div > p');
    expect(out.text).toBe('Hello world');
    expect(out.tag).toBe('p');
  });

  it('collects aria-* attributes', () => {
    const el = dom('<button aria-label="Close" aria-pressed="false">X</button>');
    const out = extractPayload(el, 'button');
    expect(out.aria['aria-label']).toBe('Close');
    expect(out.aria['aria-pressed']).toBe('false');
  });

  it('extracts image src + alt', () => {
    const el = dom('<img src="/cat.jpg" alt="A cat">');
    const out = extractPayload(el, 'img');
    expect(out.image).toEqual({ src: '/cat.jpg', alt: 'A cat', naturalWidth: undefined, naturalHeight: undefined });
  });

  it('extracts link href + text', () => {
    const el = dom('<a href="https://example.com">Click me</a>');
    const out = extractPayload(el, 'a');
    expect(out.link).toEqual({ href: 'https://example.com', text: 'Click me' });
  });

  it('returns null link/image for plain elements', () => {
    const el = dom('<p>nothing special</p>');
    const out = extractPayload(el, 'p');
    expect(out.image).toBeNull();
    expect(out.link).toBeNull();
  });

  it('records the bounding rect', () => {
    const el = dom('<div style="width: 100px; height: 50px"></div>');
    const out = extractPayload(el, 'div');
    expect(out.rect).toHaveProperty('x');
    expect(out.rect).toHaveProperty('width');
  });
});
```

- [ ] **Step 3: Run RED**

```bash
pnpm test src/lib/picker/extract-payload.test.ts
```

- [ ] **Step 4: Write `extract-payload.ts`**

Port the existing inline builder. The shape must match `Payload` from `src/lib/types/payload.ts`:

```ts
// src/lib/picker/extract-payload.ts
import type { Payload } from '../types/payload';

export function extractPayload(el: Element, selector: string): Payload {
  const html = el as HTMLElement;
  const text = (html.innerText ?? el.textContent ?? '').slice(0, 16000);

  const aria: Record<string, string> = {};
  const data: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith('aria-')) aria[attr.name] = attr.value;
    if (attr.name.startsWith('data-')) data[attr.name] = attr.value;
  }
  if (el.getAttribute('role')) aria['role'] = el.getAttribute('role')!;
  if (el.id) aria['id'] = el.id;
  const title = el.getAttribute('title');
  if (title) aria['title'] = title;

  let image: Payload['image'] = null;
  const imgEl = (el.tagName.toLowerCase() === 'img' ? el : el.querySelector('img')) as HTMLImageElement | null;
  if (imgEl) {
    image = {
      src: imgEl.src,
      alt: imgEl.alt ?? '',
      naturalWidth: imgEl.naturalWidth || undefined,
      naturalHeight: imgEl.naturalHeight || undefined,
    };
  }

  let link: Payload['link'] = null;
  const aEl = (el.tagName.toLowerCase() === 'a' ? el : el.closest('a')) as HTMLAnchorElement | null;
  if (aEl) {
    link = { href: aEl.href, text: (aEl.innerText ?? '').slice(0, 200) };
  }

  let value: string | null = null;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    value = el.value;
  }

  const rect = el.getBoundingClientRect();

  return {
    selector,
    tag: el.tagName.toLowerCase(),
    text,
    aria,
    data,
    image,
    link,
    value,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  };
}
```

- [ ] **Step 5: Run GREEN**

```bash
pnpm test src/lib/picker/extract-payload.test.ts
```
Expected: 6 tests pass.

- [ ] **Step 6: Replace inline payload-builder call sites in `entrypoints/content/index.ts`**

Find every place that builds a `Payload` (or `interface Payload`) inline, replace with:

```ts
import { extractPayload } from '@/src/lib/picker/extract-payload';

// ... at use site:
const payload = extractPayload(el, buildSelector(el));
```

Delete the now-unused inline `Payload` interface and builder function. (Plan 1 already exports `Payload` from `src/lib/types/payload.ts`; import from there if needed.)

- [ ] **Step 7: Verify**

```bash
pnpm compile && pnpm build && pnpm test
```
Expected: green, 127 tests.

Manual smoke: wiggle, pick a paragraph + an image, confirm both highlight, press Enter, confirm sheet still shows them.

- [ ] **Step 8: Commit**

```bash
git add src/lib/picker/extract-payload.ts src/lib/picker/extract-payload.test.ts entrypoints/content/index.ts
git commit -m "refactor(picker): extract Payload builder to lib/picker/extract-payload"
```

---

## Task 5: Extract AI backend + stream + adapters

The existing extension's AI calls (Chrome Summarizer/Prompt APIs + BYOK fallbacks to OpenAI/Anthropic/Gemini) live inline in `index.ts`. Move them to `lib/ai/` as adapters that conform to the `ApiAdapter` interface Plan 1 declared.

**Files:**
- Create: `src/lib/ai/backend.ts`
- Create: `src/lib/ai/stream.ts`
- Create: `src/lib/ai/adapters/{prompt,summarizer,translator,index}.ts`
- Test: `src/lib/ai/backend.test.ts`

This task is bigger than the others — it's the actual AI plumbing. Doing it in one task because the pieces only make sense together.

- [ ] **Step 1: Sketch the interfaces**

Create `src/lib/ai/backend.ts`:
```ts
// src/lib/ai/backend.ts
import type { ApiPref } from '../types/action';
import type { Backend } from '../types/thread';

export interface BackendStatus {
  pref: ApiPref;
  available: boolean;
  reason?: string;            // 'unavailable', 'downloading', 'no-key', etc.
}

/**
 * Sniff each Chrome AI API's availability without instantiating it.
 * Synchronous-safe: only checks for the globals, no `await`.
 */
export function probeAvailability(pref: ApiPref): BackendStatus {
  switch (pref) {
    case 'summarizer':
      return {
        pref,
        available: typeof Summarizer !== 'undefined' && typeof Summarizer.availability === 'function',
      };
    case 'prompt':
      return {
        pref,
        available: typeof LanguageModel !== 'undefined' && typeof LanguageModel.availability === 'function',
      };
    case 'translator':
      return {
        pref,
        available: typeof Translator !== 'undefined' && typeof Translator.availability === 'function',
      };
  }
}

/**
 * Which backend is the active model right now — for the UI's status pill.
 * If no Chrome AI APIs are present, returns the user's BYOK provider from settings.
 */
export function activeBackend(settings: { provider: string; backend: string }): Backend {
  if (settings.backend === 'nano') return 'nano';
  if (settings.provider === 'openai') return 'openai';
  if (settings.provider === 'anthropic') return 'anthropic';
  if (settings.provider === 'gemini') return 'gemini';
  return 'nano';
}
```

- [ ] **Step 2: Write `stream.ts`**

```ts
// src/lib/ai/stream.ts

/**
 * Iterator-style stream interface. Adapters return one of these from `run()`;
 * the sidebar consumes it to render incremental answer text and to abort.
 */
export interface AnswerStream {
  /** Async iterator over text chunks. Throws on stream failure. */
  chunks(): AsyncIterable<string>;
  /** Abort the underlying request. */
  abort(): void;
}

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
```

- [ ] **Step 3: Write adapter implementations**

`src/lib/ai/adapters/prompt.ts`:
```ts
import type { ApiAdapter } from '../../actions/api-route';
import type { AnswerStream } from '../stream';
import type { BuiltPrompt } from '../../actions/prompt-builder';

/**
 * Chrome AI Prompt API adapter (LanguageModel).
 */
export function createPromptAdapter(): ApiAdapter & {
  run(prompt: BuiltPrompt, signal: AbortSignal): Promise<AnswerStream>;
} {
  return {
    name: 'prompt',
    available: () => typeof LanguageModel !== 'undefined',
    async run(prompt, signal) {
      const session = await LanguageModel.create({
        // Chrome AI accepts a system prompt via `initialPrompts`.
        initialPrompts: prompt.system ? [{ role: 'system', content: prompt.system }] : [],
      });
      const stream = session.promptStreaming(prompt.user, { signal });
      return {
        chunks: () => stream,
        abort: () => { session.destroy?.(); },
      };
    },
  };
}
```

`src/lib/ai/adapters/summarizer.ts`:
```ts
import type { ApiAdapter } from '../../actions/api-route';
import type { AnswerStream } from '../stream';
import type { BuiltPrompt } from '../../actions/prompt-builder';

export function createSummarizerAdapter(): ApiAdapter & {
  run(prompt: BuiltPrompt, signal: AbortSignal): Promise<AnswerStream>;
} {
  return {
    name: 'summarizer',
    available: () => typeof Summarizer !== 'undefined',
    async run(prompt, signal) {
      const session = await Summarizer.create({ type: 'tldr', format: 'markdown' });
      const stream = session.summarizeStreaming(prompt.user, { signal });
      return {
        chunks: () => stream,
        abort: () => { session.destroy?.(); },
      };
    },
  };
}
```

`src/lib/ai/adapters/translator.ts`:
```ts
import type { ApiAdapter } from '../../actions/api-route';
import type { AnswerStream } from '../stream';
import type { BuiltPrompt } from '../../actions/prompt-builder';

export function createTranslatorAdapter(): ApiAdapter & {
  run(prompt: BuiltPrompt, signal: AbortSignal): Promise<AnswerStream>;
} {
  return {
    name: 'translator',
    available: () => typeof Translator !== 'undefined',
    async run(prompt, _signal) {
      // No translation actions ship in Plan 2's library; this adapter exists as a placeholder
      // so the registry's ApiPref enum is fully populated. Calling it returns an error stream.
      return {
        async *chunks() {
          throw new Error('translator adapter not yet wired — use prompt fallback');
        },
        abort: () => {},
      };
    },
  };
}
```

`src/lib/ai/adapters/index.ts`:
```ts
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
```

- [ ] **Step 4: Write a smoke test for backend probe**

```ts
// src/lib/ai/backend.test.ts
import { describe, it, expect } from 'vitest';
import { probeAvailability, activeBackend } from './backend';

describe('probeAvailability', () => {
  it('returns available=false when globals are missing (node env)', () => {
    expect(probeAvailability('summarizer').available).toBe(false);
    expect(probeAvailability('prompt').available).toBe(false);
    expect(probeAvailability('translator').available).toBe(false);
  });
});

describe('activeBackend', () => {
  it('returns nano when backend=nano', () => {
    expect(activeBackend({ backend: 'nano', provider: '' })).toBe('nano');
  });

  it('returns the BYOK provider when not nano', () => {
    expect(activeBackend({ backend: 'cloud', provider: 'openai' })).toBe('openai');
    expect(activeBackend({ backend: 'cloud', provider: 'anthropic' })).toBe('anthropic');
    expect(activeBackend({ backend: 'cloud', provider: 'gemini' })).toBe('gemini');
  });
});
```

- [ ] **Step 5: Verify**

```bash
pnpm test src/lib/ai/ && pnpm compile
```
Expected: 4 backend tests pass; compile clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/ entrypoints/content/index.ts
git commit -m "feat(ai): add backend probe, stream, and Prompt/Summarizer/Translator adapters"
```

(`index.ts` is included in the add because of any leftover imports — verify with `git diff --cached` that you intended the changes there.)

---

## Phase B: New plumbing

---

## Task 6: State machine + event bus → `entrypoints/content/state.ts`

The lifecycle state machine and the typed event bus, used by every other Plan 2 module.

**Files:**
- Create: `entrypoints/content/state.ts`, `entrypoints/content/state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// entrypoints/content/state.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createState, type Mode } from './state';

describe('state machine + event bus', () => {
  let s: ReturnType<typeof createState>;
  beforeEach(() => { s = createState(); });

  it('starts in idle', () => {
    expect(s.getMode()).toBe('idle');
  });

  it('setMode emits mode:change with from/to', () => {
    const seen: Array<{ from: Mode; to: Mode }> = [];
    s.on('mode:change', (e) => seen.push(e));
    s.setMode('selecting');
    expect(seen).toEqual([{ from: 'idle', to: 'selecting' }]);
    expect(s.getMode()).toBe('selecting');
  });

  it('setMode does not emit when the mode does not change', () => {
    let count = 0;
    s.on('mode:change', () => count++);
    s.setMode('idle');
    expect(count).toBe(0);
  });

  it('off() removes a listener', () => {
    let count = 0;
    const fn = () => count++;
    s.on('mode:change', fn);
    s.off('mode:change', fn);
    s.setMode('selecting');
    expect(count).toBe(0);
  });

  it('emits typed events to typed listeners', () => {
    const seen: any[] = [];
    s.on('commit', (e) => seen.push(e));
    s.emit('commit', { picks: [] });
    expect(seen).toEqual([{ picks: [] }]);
  });
});
```

- [ ] **Step 2: Run RED**

```bash
pnpm test entrypoints/content/state.test.ts
```

- [ ] **Step 3: Write `state.ts`**

```ts
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
```

- [ ] **Step 4: Run GREEN**

```bash
pnpm test entrypoints/content/state.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/content/state.ts entrypoints/content/state.test.ts
git commit -m "feat(content): state machine + typed event bus for sidebar wiring"
```

---

## Task 7: Pill (selection-state) → `entrypoints/content/pill.ts` + `pill.css`

The bottom-center "X picked · press ⏎" pill. Currently lives as `#wm-sheet` in its collapsed form inside `index.ts`'s big innerHTML template. Extract to a dedicated component.

**Files:**
- Create: `entrypoints/content/pill.ts`, `entrypoints/content/pill.css`

This is a UI task. The contract is mandated; the visual polish (exact box-shadow values, gradient stops) is the implementer's call within the spirit of the v2.1 design.

- [ ] **Step 1: Write `pill.ts`**

```ts
// entrypoints/content/pill.ts
import type { PickRef } from '@/src/lib/types/thread';
import './pill.css';

export interface Pill {
  mount(): void;
  unmount(): void;
  setPicks(picks: PickRef[]): void;
  onCommit(fn: () => void): void;
  onChipRemove(fn: (id: string) => void): void;
  el: HTMLElement;
}

export function createPill(parent: HTMLElement): Pill {
  const el = document.createElement('div');
  el.id = 'wm-pill';
  el.setAttribute('role', 'toolbar');
  el.setAttribute('aria-label', 'Selected items');
  el.innerHTML = `
    <div class="pill-left">
      <svg class="sparkle" viewBox="-3 -3 6 6" aria-hidden="true">
        <polygon points="0,-2.6 0.7,-0.7 2.6,0 0.7,0.7 0,2.6 -0.7,0.7 -2.6,0 -0.7,-0.7" />
      </svg>
      <span class="count">0 picked</span>
    </div>
    <div class="pill-chips"></div>
    <div class="pill-right">
      <span class="hint">Press <kbd>⏎</kbd> for Magic</span>
    </div>
  `;

  const countEl = el.querySelector<HTMLElement>('.count')!;
  const chipsEl = el.querySelector<HTMLElement>('.pill-chips')!;
  let commitFn: (() => void) | null = null;
  let removeFn: ((id: string) => void) | null = null;

  return {
    el,
    mount() {
      parent.appendChild(el);
      requestAnimationFrame(() => el.classList.add('visible'));
    },
    unmount() {
      el.classList.remove('visible');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    },
    setPicks(picks) {
      countEl.textContent = `${picks.length} picked`;
      chipsEl.innerHTML = '';
      for (const p of picks) {
        const chip = document.createElement('button');
        chip.className = 'pill-chip';
        chip.dataset.id = p.id;
        chip.innerHTML = `<span class="chip-icon">${iconFor(p)}</span><span class="chip-label">${escape(p.label)}</span><span class="chip-x" aria-label="Remove">×</span>`;
        chip.querySelector('.chip-x')!.addEventListener('click', (e) => {
          e.stopPropagation();
          removeFn?.(p.id);
        });
        chipsEl.appendChild(chip);
      }
    },
    onCommit(fn) { commitFn = fn; },
    onChipRemove(fn) { removeFn = fn; },
  };

  function iconFor(p: PickRef): string {
    if (p.payload.image) return '🖼';
    if (p.payload.link) return '🔗';
    if (p.tags.includes('code')) return '⌨';
    if (p.payload.tag === 'button') return '→';
    return '¶';
  }
  function escape(s: string): string {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}
```

- [ ] **Step 2: Write `pill.css`**

```css
/* entrypoints/content/pill.css */
#wm-pill {
  position: fixed;
  left: 50%;
  bottom: 36px;
  transform: translate(-50%, calc(100vh + 80px));
  z-index: 2147483646;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  height: 40px;
  background: rgba(20, 24, 35, 0.94);
  border-radius: 999px;
  color: #e7ecf3;
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  backdrop-filter: blur(12px) saturate(1.05);
  box-shadow: 0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(125,249,255,0.18);
  opacity: 0;
  transition: transform 540ms cubic-bezier(0.18, 1.25, 0.4, 1), opacity 280ms ease;
}
#wm-pill.visible { transform: translate(-50%, 0); opacity: 1; }

#wm-pill .pill-left { display: flex; align-items: center; gap: 8px; }
#wm-pill .sparkle { width: 14px; height: 14px; fill: #7df9ff; }
#wm-pill .count { font-weight: 600; }

#wm-pill .pill-chips {
  display: flex;
  gap: 6px;
  max-width: 60vw;
  overflow-x: auto;
  scrollbar-width: thin;
}

#wm-pill .pill-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: rgba(125, 249, 255, 0.10);
  border: 1px solid rgba(125, 249, 255, 0.20);
  border-radius: 999px;
  color: #e7ecf3;
  font: inherit;
  cursor: default;
  white-space: nowrap;
  max-width: 200px;
}
#wm-pill .pill-chip .chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}
#wm-pill .pill-chip .chip-x {
  cursor: pointer;
  opacity: 0.6;
  padding: 0 2px;
}
#wm-pill .pill-chip .chip-x:hover { opacity: 1; }

#wm-pill .hint { opacity: 0.7; font-size: 12px; }
#wm-pill .hint kbd {
  display: inline-block;
  padding: 1px 5px;
  background: rgba(255,255,255,0.08);
  border-radius: 4px;
  font-family: inherit;
  font-size: 11px;
}
```

- [ ] **Step 3: Smoke (deferred)**

The pill isn't wired to anything yet — Task 21 mounts it. Skip the smoke now; the file just needs to compile.

```bash
pnpm compile
```

- [ ] **Step 4: Commit**

```bash
git add entrypoints/content/pill.ts entrypoints/content/pill.css
git commit -m "feat(content): selection-state pill component"
```

---

## Task 8: Overlay → `entrypoints/content/overlay.ts` + `overlay.css`

The non-pill selection-mode chrome: custom cursor, edge aurora glow, highlight box, ripples on commit, tag badge. Extracted from `index.ts`'s big innerHTML.

**Files:**
- Create: `entrypoints/content/overlay.ts`, `entrypoints/content/overlay.css`

- [ ] **Step 1: Write `overlay.ts`**

```ts
// entrypoints/content/overlay.ts
import './overlay.css';

export interface Overlay {
  mount(): void;
  setCursor(x: number, y: number, visible: boolean): void;
  setHighlight(rect: DOMRect | null, picked: boolean): void;
  setTag(rect: DOMRect | null, tag: string): void;
  spawnBurst(x: number, y: number): void;
  el: HTMLElement;
}

export function createOverlay(parent: HTMLElement, cursorUrl: string): Overlay {
  const el = document.createElement('div');
  el.id = 'wm-overlay';
  el.innerHTML = `
    <div id="wm-edge"></div>
    <div id="wm-ripples"></div>
    <div id="wm-highlight"></div>
    <div id="wm-tag" aria-hidden="true"></div>
    <div id="wm-cursor"><div class="shape"><div class="grad"></div></div></div>
  `;

  const cursor = el.querySelector<HTMLElement>('#wm-cursor')!;
  const shape = el.querySelector<HTMLElement>('#wm-cursor .shape')!;
  const highlight = el.querySelector<HTMLElement>('#wm-highlight')!;
  const tagBadge = el.querySelector<HTMLElement>('#wm-tag')!;
  const ripples = el.querySelector<HTMLElement>('#wm-ripples')!;

  shape.style.webkitMaskImage = `url("${cursorUrl}")`;
  shape.style.maskImage = `url("${cursorUrl}")`;

  return {
    el,
    mount() { parent.appendChild(el); },

    setCursor(x, y, visible) {
      cursor.style.transform = `translate(${x}px, ${y}px) scale(${visible ? 1 : 0.4})`;
      cursor.classList.toggle('visible', visible);
    },

    setHighlight(rect, picked) {
      if (!rect) { highlight.style.opacity = '0'; return; }
      highlight.style.opacity = '1';
      highlight.classList.toggle('picked', picked);
      highlight.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
      highlight.style.width = rect.width + 'px';
      highlight.style.height = rect.height + 'px';
    },

    setTag(rect, tag) {
      if (!rect) { tagBadge.style.opacity = '0'; return; }
      tagBadge.style.opacity = '1';
      tagBadge.textContent = tag;
      tagBadge.style.transform = `translate(${rect.left}px, ${rect.top - 18}px)`;
    },

    spawnBurst(x, y) {
      for (const cls of ['', 'b', 'c']) {
        const ring = document.createElement('div');
        ring.className = 'wm-ring' + (cls ? ' ' + cls : '');
        ring.style.left = x + 'px';
        ring.style.top  = y + 'px';
        ripples.appendChild(ring);
        ring.addEventListener('animationend', () => ring.remove(), { once: true });
      }
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
        const r = 80 + Math.random() * 60;
        const s = document.createElement('div');
        s.className = 'wm-spark';
        s.style.left = x + 'px';
        s.style.top  = y + 'px';
        s.style.setProperty('--dx', (Math.cos(a) * r) + 'px');
        s.style.setProperty('--dy', (Math.sin(a) * r) + 'px');
        ripples.appendChild(s);
        s.addEventListener('animationend', () => s.remove(), { once: true });
      }
    },
  };
}
```

- [ ] **Step 2: Port `overlay.css`**

Copy all rules for `#wm-cursor`, `#wm-edge`, `#wm-highlight`, `#wm-tag`, `#wm-ripples`, `.wm-ring*`, `.wm-spark*` from the existing `entrypoints/content/content.css` into a new `overlay.css`. The visual behavior must remain identical. Don't delete from `content.css` yet — Task 31 does that cleanup.

(Implementer: copy as-is. No design changes in this task.)

- [ ] **Step 3: Verify**

```bash
pnpm compile
```

- [ ] **Step 4: Commit**

```bash
git add entrypoints/content/overlay.ts entrypoints/content/overlay.css
git commit -m "feat(content): overlay component (cursor + highlight + ripples + tag)"
```

---

## Phase C: Sidebar shell

---

## Task 9: Sidebar mount + page-push behavior → `entrypoints/content/sidebar/mount.ts`

Creates the sidebar root, injects the page-push CSS variable, handles open/close animation.

**Files:**
- Create: `entrypoints/content/sidebar/mount.ts`, `entrypoints/content/sidebar/sidebar.css`

- [ ] **Step 1: Write `sidebar.css` (base styles)**

```css
/* entrypoints/content/sidebar/sidebar.css */
html.wm-sidebar-open {
  margin-right: var(--wm-sidebar-w, 420px);
  transition: margin-right 240ms cubic-bezier(0.4, 0, 0.2, 1);
}

#wm-sidebar {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--wm-sidebar-w, 420px);
  z-index: 2147483645;
  display: flex;
  flex-direction: column;
  background: rgba(20, 24, 35, 0.96);
  backdrop-filter: blur(12px) saturate(1.05);
  color: #e7ecf3;
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  border-left: 1px solid rgba(125, 249, 255, 0.18);
  box-shadow: -24px 0 60px rgba(0,0,0,0.4);
  transform: translateX(100%);
  transition: transform 300ms cubic-bezier(0.18, 1.05, 0.4, 1);
}
#wm-sidebar.visible { transform: translateX(0); }

#wm-sidebar .sidebar-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
#wm-sidebar .sidebar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
}
#wm-sidebar .backend-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  background: rgba(255,255,255,0.04);
  border-radius: 999px;
  font-size: 11px;
  color: #8a93a6;
}
#wm-sidebar .backend-pill .dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #4ade80;
}
#wm-sidebar .backend-pill.cloud .dot { background: #fbbf24; }

#wm-sidebar .sidebar-close {
  background: transparent;
  border: 0;
  color: #8a93a6;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}
#wm-sidebar .sidebar-close:hover {
  background: rgba(255,255,255,0.06);
  color: #e7ecf3;
}

#wm-sidebar .sidebar-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-width: thin;
}

#wm-sidebar .sidebar-composer {
  flex: 0 0 auto;
  padding: 12px 16px 14px;
  border-top: 1px solid rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

- [ ] **Step 2: Write `mount.ts`**

```ts
// entrypoints/content/sidebar/mount.ts
import './sidebar.css';

const WIDTH_DEFAULT = 420;

export interface SidebarMount {
  root: HTMLElement;
  header: HTMLElement;
  body: HTMLElement;
  composer: HTMLElement;
  open(): void;
  close(): void;
}

export function createSidebarMount(parent: HTMLElement): SidebarMount {
  document.documentElement.style.setProperty('--wm-sidebar-w', `${WIDTH_DEFAULT}px`);

  const root = document.createElement('aside');
  root.id = 'wm-sidebar';
  root.setAttribute('role', 'complementary');
  root.setAttribute('aria-label', 'Magic conversation');
  root.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-title">
        <svg viewBox="-3 -3 6 6" width="14" height="14" aria-hidden="true">
          <polygon points="0,-2.6 0.7,-0.7 2.6,0 0.7,0.7 0,2.6 -0.7,0.7 -2.6,0 -0.7,-0.7" fill="#7df9ff"/>
        </svg>
        Magic
        <span class="backend-pill" id="wm-backend-pill" hidden>
          <span class="dot"></span>
          <span class="label">Nano · on-device</span>
        </span>
      </div>
      <button class="sidebar-close" type="button" aria-label="Close">×</button>
    </div>
    <div class="sidebar-body" role="log" aria-live="polite"></div>
    <div class="sidebar-composer"></div>
  `;
  parent.appendChild(root);

  const header = root.querySelector<HTMLElement>('.sidebar-header')!;
  const body = root.querySelector<HTMLElement>('.sidebar-body')!;
  const composer = root.querySelector<HTMLElement>('.sidebar-composer')!;

  return {
    root, header, body, composer,
    open() {
      document.documentElement.classList.add('wm-sidebar-open');
      requestAnimationFrame(() => root.classList.add('visible'));
    },
    close() {
      root.classList.remove('visible');
      document.documentElement.classList.remove('wm-sidebar-open');
    },
  };
}
```

- [ ] **Step 3: Verify**

```bash
pnpm compile
```

- [ ] **Step 4: Commit**

```bash
git add entrypoints/content/sidebar/mount.ts entrypoints/content/sidebar/sidebar.css
git commit -m "feat(sidebar): mount + page-push CSS + base styles"
```

---

## Task 10: Sidebar shell — header + backend pill → `entrypoints/content/sidebar/shell.ts`

Higher-level shell that knows about state events. Renders the backend pill, wires the close button to emit `sidebar:close`.

**Files:**
- Create: `entrypoints/content/sidebar/shell.ts`

- [ ] **Step 1: Write `shell.ts`**

```ts
// entrypoints/content/sidebar/shell.ts
import type { State } from '../state';
import type { Backend } from '@/src/lib/types/thread';
import type { SidebarMount } from './mount';

export interface Shell {
  setBackend(b: Backend, available: boolean): void;
}

const BACKEND_LABEL: Record<Backend, string> = {
  nano: 'Nano · on-device',
  openai: 'OpenAI · cloud',
  anthropic: 'Anthropic · cloud',
  gemini: 'Gemini · cloud',
};

export function createShell(mount: SidebarMount, state: State): Shell {
  const closeBtn = mount.root.querySelector<HTMLButtonElement>('.sidebar-close')!;
  closeBtn.addEventListener('click', () => state.emit('sidebar:close', {}));

  const pill = mount.root.querySelector<HTMLElement>('#wm-backend-pill')!;
  const pillLabel = pill.querySelector<HTMLElement>('.label')!;

  return {
    setBackend(b, available) {
      pill.hidden = false;
      pillLabel.textContent = BACKEND_LABEL[b];
      pill.classList.toggle('cloud', b !== 'nano');
      pill.setAttribute('aria-label', b === 'nano' ? 'On-device AI' : `Cloud AI via ${b}`);
      pill.style.opacity = available ? '1' : '0.5';
    },
  };
}
```

- [ ] **Step 2: Verify**

```bash
pnpm compile
```

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content/sidebar/shell.ts
git commit -m "feat(sidebar): shell with backend pill + close wiring"
```

---

## Task 11: Chip rendering → `entrypoints/content/sidebar/chip.ts`

Shared chip rendering for: composer staged-pick chips, in-card source chips, "Based on:" back-reference chips. One file, three render functions sharing a base.

**Files:**
- Create: `entrypoints/content/sidebar/chip.ts`

- [ ] **Step 1: Write `chip.ts`**

```ts
// entrypoints/content/sidebar/chip.ts
import type { PickRef } from '@/src/lib/types/thread';

export interface ChipOpts {
  removable?: boolean;
  onRemove?: () => void;
  clickable?: boolean;
  onClick?: () => void;
  missing?: boolean;            // back-ref chips when element no longer on page
}

export function renderChip(p: PickRef, opts: ChipOpts = {}): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'wm-chip';
  if (opts.missing) chip.classList.add('missing');
  if (opts.clickable) chip.classList.add('clickable');

  const icon = document.createElement('span');
  icon.className = 'chip-icon';
  icon.textContent = iconFor(p);
  chip.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'chip-label';
  label.textContent = p.label;
  chip.appendChild(label);

  if (opts.removable) {
    const x = document.createElement('button');
    x.className = 'chip-x';
    x.type = 'button';
    x.setAttribute('aria-label', `Remove pick: ${p.label}`);
    x.textContent = '×';
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onRemove?.();
    });
    chip.appendChild(x);
  }

  if (opts.clickable && opts.onClick) {
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-label', `Scroll to: ${p.label}`);
    chip.tabIndex = 0;
    chip.addEventListener('click', opts.onClick);
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') opts.onClick?.();
    });
  }

  return chip;
}

function iconFor(p: PickRef): string {
  if (p.payload.image) return '🖼';
  if (p.payload.link) return '🔗';
  if (p.tags.includes('code')) return '⌨';
  if (p.payload.tag === 'button') return '→';
  return '¶';
}
```

- [ ] **Step 2: Append chip CSS to `sidebar.css`**

Add to `entrypoints/content/sidebar/sidebar.css`:

```css
.wm-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(125, 249, 255, 0.08);
  border: 1px solid rgba(125, 249, 255, 0.18);
  border-radius: 999px;
  font-size: 12px;
  color: #e7ecf3;
  max-width: 240px;
}
.wm-chip .chip-icon { opacity: 0.7; }
.wm-chip .chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}
.wm-chip .chip-x {
  background: transparent;
  border: 0;
  color: #8a93a6;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}
.wm-chip .chip-x:hover { color: #e7ecf3; }
.wm-chip.clickable { cursor: pointer; }
.wm-chip.clickable:hover { background: rgba(125, 249, 255, 0.14); }
.wm-chip.missing { text-decoration: line-through; opacity: 0.5; }
```

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content/sidebar/chip.ts entrypoints/content/sidebar/sidebar.css
git commit -m "feat(sidebar): shared chip rendering"
```

---

## Task 12: Composer → `entrypoints/content/sidebar/composer.ts`

Input + hero row + staged-pick chips + `+ Add` button. Emits `turn:submit` on hero click or Enter.

**Files:**
- Create: `entrypoints/content/sidebar/composer.ts`

- [ ] **Step 1: Write `composer.ts`**

```ts
// entrypoints/content/sidebar/composer.ts
import type { State } from '../state';
import type { ActionRegistry } from '@/src/lib/actions/registry';
import type { ActionDef, ActionContext } from '@/src/lib/types/action';
import type { PickRef } from '@/src/lib/types/thread';
import { renderChip } from './chip';

export interface Composer {
  setPicks(picks: PickRef[]): void;
  getStagedPicks(): PickRef[];
  setContext(ctx: ActionContext): void;
  focusInput(): void;
  el: HTMLElement;
}

export function createComposer(
  parent: HTMLElement,
  state: State,
  registry: ActionRegistry,
): Composer {
  let stagedPicks: PickRef[] = [];
  let activeCtx: ActionContext | null = null;

  const root = document.createElement('div');
  root.className = 'composer-root';
  root.innerHTML = `
    <div class="staged-chips"></div>
    <button class="add-btn" type="button" aria-label="Add more picks">+ Add</button>
    <div class="hero-row"></div>
    <div class="composer-input-row">
      <input class="composer-input" type="text" placeholder="Ask anything about your selection…" autocomplete="off" />
      <button class="composer-send" type="button" aria-label="Send">
        <svg viewBox="-3 -3 6 6" width="12" height="12" aria-hidden="true">
          <polygon points="0,-2.6 0.7,-0.7 2.6,0 0.7,0.7 0,2.6 -0.7,0.7 -2.6,0 -0.7,-0.7" fill="#0b0d12"/>
        </svg>
      </button>
    </div>
  `;
  parent.appendChild(root);

  const stagedEl = root.querySelector<HTMLElement>('.staged-chips')!;
  const heroRow = root.querySelector<HTMLElement>('.hero-row')!;
  const addBtn = root.querySelector<HTMLButtonElement>('.add-btn')!;
  const input = root.querySelector<HTMLInputElement>('.composer-input')!;
  const sendBtn = root.querySelector<HTMLButtonElement>('.composer-send')!;

  function renderStaged() {
    stagedEl.innerHTML = '';
    for (const p of stagedPicks) {
      stagedEl.appendChild(renderChip(p, {
        removable: true,
        onRemove() {
          stagedPicks = stagedPicks.filter(x => x.id !== p.id);
          renderStaged();
          renderHeroes();
          state.emit('picks:change', { picks: stagedPicks, source: 'staging' });
        },
      }));
    }
  }

  function renderHeroes() {
    heroRow.innerHTML = '';
    if (!activeCtx) return;
    const heroes = registry.getVisibleHeroes(activeCtx);
    for (const a of heroes) {
      heroRow.appendChild(renderHeroButton(a));
    }
  }

  function renderHeroButton(a: ActionDef): HTMLElement {
    const b = document.createElement('button');
    b.className = 'hero-btn';
    b.type = 'button';
    b.dataset.actionId = a.id;
    b.innerHTML = `${a.icon ?? '✦'} ${escapeHtml(a.label)}`;
    b.addEventListener('click', () => submit(a, undefined));
    return b;
  }

  function submit(action: ActionDef, freeText: string | undefined) {
    state.emit('turn:submit', {
      actionId: action.id,
      modifiers: [],
      text: freeText,
      picks: stagedPicks,
    });
    input.value = '';
  }

  addBtn.addEventListener('click', () => state.emit('add-clicked', {}));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim().length > 0) {
      e.preventDefault();
      const ask = registry.getById('ask');
      if (ask) submit(ask, input.value);
    }
  });

  sendBtn.addEventListener('click', () => {
    if (input.value.trim().length === 0) return;
    const ask = registry.getById('ask');
    if (ask) submit(ask, input.value);
  });

  return {
    el: root,
    setPicks(picks) {
      stagedPicks = [...picks];
      renderStaged();
      renderHeroes();
    },
    getStagedPicks() { return [...stagedPicks]; },
    setContext(ctx) {
      activeCtx = ctx;
      renderHeroes();
    },
    focusInput() { input.focus(); },
  };
}

function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
```

- [ ] **Step 2: Add composer CSS to `sidebar.css`**

Append:
```css
#wm-sidebar .composer-root { display: contents; }
#wm-sidebar .staged-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
#wm-sidebar .staged-chips:empty { display: none; }

#wm-sidebar .add-btn {
  align-self: flex-start;
  padding: 4px 10px;
  background: transparent;
  border: 1px dashed rgba(125, 249, 255, 0.3);
  border-radius: 999px;
  color: #7df9ff;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
#wm-sidebar .add-btn:hover { background: rgba(125, 249, 255, 0.06); }

#wm-sidebar .hero-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
#wm-sidebar .hero-btn {
  padding: 6px 12px;
  background: linear-gradient(135deg, #7df9ff, #b07cff);
  border: 0;
  border-radius: 999px;
  color: #0b0d12;
  font: inherit;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
}
#wm-sidebar .hero-btn:hover { filter: brightness(1.08); }
#wm-sidebar .hero-btn:disabled { opacity: 0.5; cursor: not-allowed; }

#wm-sidebar .composer-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
#wm-sidebar .composer-input {
  flex: 1;
  padding: 8px 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  color: #e7ecf3;
  font: inherit;
}
#wm-sidebar .composer-input:focus {
  outline: none;
  border-color: rgba(125, 249, 255, 0.4);
}
#wm-sidebar .composer-input::placeholder { color: #8a93a6; }
#wm-sidebar .composer-send {
  padding: 8px 12px;
  background: linear-gradient(135deg, #7df9ff, #b07cff);
  border: 0;
  border-radius: 8px;
  color: #0b0d12;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content/sidebar/composer.ts entrypoints/content/sidebar/sidebar.css
git commit -m "feat(sidebar): composer with hero buttons, staged picks, +Add, free-text input"
```

---

## Task 13: Slash menu → `entrypoints/content/sidebar/slash-menu.ts`

Autocomplete listbox that opens when the composer input starts with `/`. Shows up to 8 matching actions from `registry.getSlashOptions(ctx)`, filtered by the typed prefix.

**Files:**
- Create: `entrypoints/content/sidebar/slash-menu.ts`

- [ ] **Step 1: Write `slash-menu.ts`**

```ts
// entrypoints/content/sidebar/slash-menu.ts
import type { ActionRegistry } from '@/src/lib/actions/registry';
import type { ActionDef, ActionContext } from '@/src/lib/types/action';

export interface SlashMenu {
  setContext(ctx: ActionContext): void;
  update(text: string): void;
  acceptHighlighted(): { action: ActionDef; trailingText: string } | null;
  next(): void;
  prev(): void;
  isOpen(): boolean;
  hide(): void;
  el: HTMLElement;
}

export function createSlashMenu(
  parent: HTMLElement,
  registry: ActionRegistry,
): SlashMenu {
  let ctx: ActionContext | null = null;
  let open = false;
  let highlighted = 0;
  let matches: ActionDef[] = [];
  let currentText = '';

  const root = document.createElement('div');
  root.className = 'slash-menu';
  root.setAttribute('role', 'listbox');
  root.hidden = true;
  parent.appendChild(root);

  function render() {
    root.innerHTML = '';
    matches.forEach((a, i) => {
      const item = document.createElement('div');
      item.className = 'slash-item';
      item.setAttribute('role', 'option');
      item.dataset.actionId = a.id;
      if (i === highlighted) item.setAttribute('aria-selected', 'true');
      item.innerHTML = `
        <span class="slash-icon">${a.icon ?? '✦'}</span>
        <span class="slash-label">/${a.id}</span>
        <span class="slash-desc">${escape(a.description ?? a.label)}</span>
      `;
      item.addEventListener('mouseenter', () => { highlighted = i; render(); });
      root.appendChild(item);
    });
  }

  function show() {
    if (matches.length === 0) { hide(); return; }
    if (!open) { open = true; root.hidden = false; }
    render();
  }

  function hide() {
    open = false;
    root.hidden = true;
  }

  return {
    el: root,
    setContext(c) { ctx = c; },
    update(text) {
      currentText = text;
      if (!text.startsWith('/')) { hide(); return; }
      if (!ctx) return;
      const prefix = text.slice(1).split(/\s+/)[0].toLowerCase();
      const all = registry.getSlashOptions(ctx);
      matches = all.filter(a => a.id.toLowerCase().startsWith(prefix)).slice(0, 8);
      highlighted = 0;
      show();
    },
    acceptHighlighted() {
      if (!open || matches.length === 0) return null;
      const action = matches[highlighted];
      const firstSpace = currentText.indexOf(' ');
      const trailing = firstSpace >= 0 ? currentText.slice(firstSpace + 1) : '';
      hide();
      return { action, trailingText: trailing };
    },
    next() { if (matches.length) { highlighted = (highlighted + 1) % matches.length; render(); } },
    prev() { if (matches.length) { highlighted = (highlighted - 1 + matches.length) % matches.length; render(); } },
    isOpen: () => open,
    hide,
  };
}

function escape(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
```

- [ ] **Step 2: CSS append to `sidebar.css`**

```css
#wm-sidebar .slash-menu {
  position: absolute;
  bottom: 70px;
  left: 16px;
  right: 16px;
  max-height: 280px;
  overflow-y: auto;
  background: rgba(20, 24, 35, 0.99);
  border: 1px solid rgba(125, 249, 255, 0.18);
  border-radius: 10px;
  box-shadow: 0 -8px 32px rgba(0,0,0,0.4);
  z-index: 1;
}
#wm-sidebar .slash-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
}
#wm-sidebar .slash-item[aria-selected="true"] {
  background: rgba(125, 249, 255, 0.12);
}
#wm-sidebar .slash-item .slash-icon { font-size: 14px; }
#wm-sidebar .slash-item .slash-label {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #7df9ff;
}
#wm-sidebar .slash-item .slash-desc {
  font-size: 11px;
  color: #8a93a6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content/sidebar/slash-menu.ts entrypoints/content/sidebar/sidebar.css
git commit -m "feat(sidebar): slash autocomplete menu"
```

---

## Task 14: User turn renderer → `entrypoints/content/sidebar/turn-user.ts`

**Files:**
- Create: `entrypoints/content/sidebar/turn-user.ts`

- [ ] **Step 1: Write**

```ts
// entrypoints/content/sidebar/turn-user.ts
import type { UserTurn } from '@/src/lib/types/thread';
import type { ActionRegistry } from '@/src/lib/actions/registry';
import { renderChip } from './chip';

export function renderUserTurn(turn: UserTurn, registry: ActionRegistry): HTMLElement {
  const card = document.createElement('article');
  card.className = 'turn-card turn-user';
  card.dataset.turnId = turn.id;
  card.setAttribute('role', 'article');

  const action = registry.getById(turn.actionId);
  const actionLabel = action?.label ?? turn.actionId;

  const header = document.createElement('div');
  header.className = 'turn-header';
  header.innerHTML = `
    <span class="visually-hidden">From you</span>
    <span class="role-label">You</span>
    <span class="action-label">${escape(actionLabel)}</span>
  `;
  card.appendChild(header);

  if (turn.text) {
    const text = document.createElement('div');
    text.className = 'user-text';
    text.textContent = turn.text;
    card.appendChild(text);
  }

  if (turn.picks.length > 0) {
    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'turn-chips';
    for (const p of turn.picks) chipsWrap.appendChild(renderChip(p));
    card.appendChild(chipsWrap);
  }

  if (turn.modifiers.length > 0) {
    const mods = document.createElement('div');
    mods.className = 'turn-modifiers';
    mods.textContent = '· ' + turn.modifiers.join(' · ');
    card.appendChild(mods);
  }

  return card;
}

function escape(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
```

- [ ] **Step 2: Append CSS to `sidebar.css`**

```css
.visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

#wm-sidebar .turn-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.06);
}
#wm-sidebar .turn-user {
  background: rgba(125, 249, 255, 0.04);
  border-color: rgba(125, 249, 255, 0.10);
}
#wm-sidebar .turn-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #8a93a6;
}
#wm-sidebar .turn-header .role-label {
  font-weight: 600;
  color: #7df9ff;
}
#wm-sidebar .turn-header .action-label {
  color: #e7ecf3;
}
#wm-sidebar .user-text { font-size: 13px; }
#wm-sidebar .turn-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
#wm-sidebar .turn-modifiers {
  font-size: 11px;
  color: #8a93a6;
}
```

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content/sidebar/turn-user.ts entrypoints/content/sidebar/sidebar.css
git commit -m "feat(sidebar): user turn card renderer"
```

---

## Task 15: Magic turn renderer → `entrypoints/content/sidebar/turn-magic.ts`

The biggest UI component: streaming markdown answer + "Based on:" back-ref chips with scroll/pulse + Save/Copy/Rerun footer + stale badge.

**Files:**
- Create: `entrypoints/content/sidebar/turn-magic.ts`

- [ ] **Step 1: Write**

```ts
// entrypoints/content/sidebar/turn-magic.ts
import type { MagicTurn } from '@/src/lib/types/thread';
import type { ActionRegistry } from '@/src/lib/actions/registry';
import { renderChip } from './chip';
import { renderMarkdownInto } from '@/src/lib/markdown';

export interface MagicTurnHandle {
  el: HTMLElement;
  /** Append a streamed chunk to the answer body. */
  appendChunk(chunk: string): void;
  /** Mark stream complete; re-render markdown and show the footer. */
  finalize(answer: string): void;
  /** Render an error state inline. */
  showError(code: string, body: string, primaryAction?: { label: string; onClick: () => void }): void;
  /** Set or clear the "may be stale" badge. */
  setStale(stale: boolean): void;
}

export interface MagicTurnCallbacks {
  onSave(): void;
  onCopy(): void;
  onRerun(): void;
  onBackRefClick(selector: string): void;
}

export function renderMagicTurn(
  turn: MagicTurn,
  registry: ActionRegistry,
  callbacks: MagicTurnCallbacks,
): MagicTurnHandle {
  const card = document.createElement('article');
  card.className = 'turn-card turn-magic';
  card.dataset.turnId = turn.id;
  card.setAttribute('role', 'article');

  const header = document.createElement('div');
  header.className = 'turn-header';
  header.innerHTML = `
    <span class="visually-hidden">From Magic</span>
    <span class="role-label">✦ Magic</span>
  `;
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'turn-body';
  if (turn.status === 'streaming') body.classList.add('streaming');
  card.appendChild(body);

  // Initial markdown render — for restored turns
  if (turn.status === 'done' && turn.answer) {
    renderMarkdownInto(body, turn.answer);
  }

  // Sources
  const sourcesWrap = document.createElement('div');
  sourcesWrap.className = 'turn-sources';
  if (turn.sources.length > 0) {
    const label = document.createElement('span');
    label.className = 'sources-label';
    label.textContent = 'Based on:';
    sourcesWrap.appendChild(label);
    for (const p of turn.sources) {
      const missing = !document.querySelector(p.selector);
      sourcesWrap.appendChild(renderChip(p, {
        clickable: true,
        missing,
        onClick() { callbacks.onBackRefClick(p.selector); },
      }));
    }
    card.appendChild(sourcesWrap);
  }

  // Stale badge
  const stale = document.createElement('div');
  stale.className = 'stale-badge';
  stale.hidden = true;
  stale.innerHTML = `<span>↻ may be stale</span>`;
  card.appendChild(stale);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'turn-footer';
  footer.hidden = turn.status !== 'done';
  footer.innerHTML = `
    <button class="footer-btn save-btn" type="button">Save</button>
    <button class="footer-btn copy-btn" type="button">Copy</button>
    <button class="footer-btn rerun-btn" type="button">↻ Rerun</button>
    <span class="saved-msg" hidden>saved ✓</span>
  `;
  const saveBtn = footer.querySelector<HTMLButtonElement>('.save-btn')!;
  const copyBtn = footer.querySelector<HTMLButtonElement>('.copy-btn')!;
  const rerunBtn = footer.querySelector<HTMLButtonElement>('.rerun-btn')!;
  const savedMsg = footer.querySelector<HTMLElement>('.saved-msg')!;
  saveBtn.addEventListener('click', () => {
    callbacks.onSave();
    savedMsg.hidden = false;
    setTimeout(() => { savedMsg.hidden = true; }, 1800);
  });
  copyBtn.addEventListener('click', callbacks.onCopy);
  rerunBtn.addEventListener('click', callbacks.onRerun);
  card.appendChild(footer);

  let buffer = '';

  return {
    el: card,
    appendChunk(chunk) {
      buffer += chunk;
      // Plain text while streaming; final markdown render at finalize()
      body.textContent = buffer;
    },
    finalize(answer) {
      body.classList.remove('streaming');
      renderMarkdownInto(body, answer);
      footer.hidden = false;
    },
    showError(code, msg, primary) {
      body.classList.remove('streaming');
      body.innerHTML = '';
      const errEl = document.createElement('div');
      errEl.className = 'turn-error';
      errEl.setAttribute('role', 'alert');
      errEl.dataset.code = code;
      errEl.innerHTML = `<p>${escape(msg)}</p>`;
      if (primary) {
        const b = document.createElement('button');
        b.className = 'turn-error-action';
        b.type = 'button';
        b.textContent = primary.label;
        b.addEventListener('click', primary.onClick);
        errEl.appendChild(b);
      }
      body.appendChild(errEl);
    },
    setStale(s) { stale.hidden = !s; },
  };
}

function escape(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
```

- [ ] **Step 2: Append CSS to `sidebar.css`**

```css
#wm-sidebar .turn-magic .turn-header .role-label { color: #ff7ad9; }
#wm-sidebar .turn-body {
  font-size: 13px;
  line-height: 1.55;
  color: #e7ecf3;
}
#wm-sidebar .turn-body.streaming::after {
  content: '▌';
  animation: wm-blink 1s steps(2) infinite;
}
@keyframes wm-blink { to { opacity: 0; } }
#wm-sidebar .turn-body p { margin: 0 0 8px; }
#wm-sidebar .turn-body > *:first-child { margin-top: 0; }
#wm-sidebar .turn-body > *:last-child { margin-bottom: 0; }
#wm-sidebar .turn-body strong { color: #fff; }
#wm-sidebar .turn-body code {
  background: rgba(255,255,255,0.08);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
#wm-sidebar .turn-body pre {
  background: rgba(0,0,0,0.3);
  padding: 8px;
  border-radius: 6px;
  overflow-x: auto;
}
#wm-sidebar .turn-body ul, #wm-sidebar .turn-body ol {
  margin: 4px 0 8px;
  padding-left: 20px;
}

#wm-sidebar .turn-sources {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255,255,255,0.06);
}
#wm-sidebar .sources-label {
  font-size: 11px;
  color: #8a93a6;
  margin-right: 4px;
}

#wm-sidebar .stale-badge {
  display: inline-flex;
  align-self: flex-start;
  padding: 3px 8px;
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.30);
  border-radius: 999px;
  font-size: 11px;
  color: #fbbf24;
}

#wm-sidebar .turn-footer {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}
#wm-sidebar .footer-btn {
  padding: 4px 10px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  color: #8a93a6;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
#wm-sidebar .footer-btn:hover {
  background: rgba(125, 249, 255, 0.06);
  color: #e7ecf3;
  border-color: rgba(125, 249, 255, 0.2);
}
#wm-sidebar .saved-msg {
  font-size: 11px;
  color: #4ade80;
  margin-left: 6px;
}

#wm-sidebar .turn-error {
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.20);
  border-radius: 8px;
}
#wm-sidebar .turn-error p { margin: 0 0 6px; color: #fca5a5; font-size: 12px; }
#wm-sidebar .turn-error-action {
  padding: 3px 8px;
  background: rgba(239, 68, 68, 0.15);
  border: 0;
  border-radius: 6px;
  color: #fca5a5;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
```

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content/sidebar/turn-magic.ts entrypoints/content/sidebar/sidebar.css
git commit -m "feat(sidebar): magic turn card with streaming, sources, Save/Copy/Rerun"
```

---

## Task 16: Turn-list orchestrator → `entrypoints/content/sidebar/turn-list.ts`

Renders a `Turn[]` array into the body. Handles appending new turns, streaming into the latest Magic turn, replacing turns on rerun.

**Files:**
- Create: `entrypoints/content/sidebar/turn-list.ts`

- [ ] **Step 1: Write**

```ts
// entrypoints/content/sidebar/turn-list.ts
import type { Turn, MagicTurn, UserTurn, PickRef } from '@/src/lib/types/thread';
import type { ActionRegistry } from '@/src/lib/actions/registry';
import { renderUserTurn } from './turn-user';
import { renderMagicTurn, type MagicTurnHandle, type MagicTurnCallbacks } from './turn-magic';

export interface TurnListCallbacks {
  onSave(magic: MagicTurn): void;
  onCopy(magic: MagicTurn): void;
  onRerun(magic: MagicTurn): void;
  onBackRefClick(selector: string): void;
}

export interface TurnList {
  reset(turns: Turn[]): void;
  appendUser(turn: UserTurn): void;
  appendMagic(turn: MagicTurn): MagicTurnHandle;
  replaceMagic(oldId: string, replacement: MagicTurn): MagicTurnHandle;
  setLatestStale(stale: boolean): void;
}

export function createTurnList(
  body: HTMLElement,
  registry: ActionRegistry,
  cb: TurnListCallbacks,
): TurnList {
  const handlesByMagicId = new Map<string, MagicTurnHandle>();
  let lastMagicId: string | null = null;

  function scrollToBottom() {
    body.scrollTop = body.scrollHeight;
  }

  function makeCallbacks(turn: MagicTurn): MagicTurnCallbacks {
    return {
      onSave: () => cb.onSave(turn),
      onCopy: () => cb.onCopy(turn),
      onRerun: () => cb.onRerun(turn),
      onBackRefClick: cb.onBackRefClick,
    };
  }

  return {
    reset(turns) {
      body.innerHTML = '';
      handlesByMagicId.clear();
      lastMagicId = null;
      for (const t of turns) {
        if (t.role === 'user') body.appendChild(renderUserTurn(t, registry));
        else {
          const handle = renderMagicTurn(t, registry, makeCallbacks(t));
          handlesByMagicId.set(t.id, handle);
          lastMagicId = t.id;
          body.appendChild(handle.el);
        }
      }
      scrollToBottom();
    },

    appendUser(turn) {
      body.appendChild(renderUserTurn(turn, registry));
      scrollToBottom();
    },

    appendMagic(turn) {
      const handle = renderMagicTurn(turn, registry, makeCallbacks(turn));
      handlesByMagicId.set(turn.id, handle);
      lastMagicId = turn.id;
      body.appendChild(handle.el);
      scrollToBottom();
      return handle;
    },

    replaceMagic(oldId, replacement) {
      const oldHandle = handlesByMagicId.get(oldId);
      if (!oldHandle) throw new Error(`magic turn handle not found: ${oldId}`);
      const newHandle = renderMagicTurn(replacement, registry, makeCallbacks(replacement));
      handlesByMagicId.delete(oldId);
      handlesByMagicId.set(replacement.id, newHandle);
      if (lastMagicId === oldId) lastMagicId = replacement.id;
      oldHandle.el.replaceWith(newHandle.el);
      return newHandle;
    },

    setLatestStale(stale) {
      if (!lastMagicId) return;
      handlesByMagicId.get(lastMagicId)?.setStale(stale);
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add entrypoints/content/sidebar/turn-list.ts
git commit -m "feat(sidebar): turn list orchestrator"
```

---

## Task 17: Banners → `entrypoints/content/sidebar/banners.ts`

The "↻ Continuing your previous conversation · [Start fresh]" banner + helpers for other system banners.

**Files:**
- Create: `entrypoints/content/sidebar/banners.ts`

- [ ] **Step 1: Write**

```ts
// entrypoints/content/sidebar/banners.ts

export function renderRestorationBanner(onStartFresh: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sidebar-banner restoration';
  el.innerHTML = `
    <span>↻ Continuing your previous conversation about this page.</span>
    <button class="banner-action" type="button">Start fresh</button>
  `;
  el.querySelector<HTMLButtonElement>('.banner-action')!.addEventListener('click', () => {
    onStartFresh();
    el.remove();
  });
  return el;
}

export function renderTrimNotice(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sidebar-banner trim';
  el.textContent = 'Older turns trimmed';
  return el;
}
```

- [ ] **Step 2: CSS append**

```css
#wm-sidebar .sidebar-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(125, 249, 255, 0.06);
  border: 1px solid rgba(125, 249, 255, 0.12);
  border-radius: 8px;
  font-size: 12px;
  color: #b3d9ff;
}
#wm-sidebar .sidebar-banner.trim {
  background: rgba(255,255,255,0.04);
  color: #8a93a6;
  justify-content: center;
}
#wm-sidebar .banner-action {
  padding: 3px 10px;
  background: transparent;
  border: 1px solid rgba(125, 249, 255, 0.3);
  border-radius: 999px;
  color: #7df9ff;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
#wm-sidebar .banner-action:hover { background: rgba(125, 249, 255, 0.10); }
```

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content/sidebar/banners.ts entrypoints/content/sidebar/sidebar.css
git commit -m "feat(sidebar): restoration + trim banners"
```

---

## Phase D: Integration — wire everything into `entrypoints/content/index.ts`

This is the destructive phase. We rewrite `entrypoints/content/index.ts` from its 1335-line v2.1 form to a thin (~120-line) orchestrator that wires pill + overlay + sidebar + AI + thread to the foundation.

**Strategy:** rather than incrementally swap pieces (which would force a half-state where both UIs partially exist), Task 18 does a single coherent rewrite. Manual smoke testing in Chrome is the gate. Roll back via `git revert` if anything breaks.

---

## Task 18: Rewrite `entrypoints/content/index.ts`

**Files:**
- Modify: `entrypoints/content/index.ts` (full rewrite)
- Modify: `entrypoints/content/content.css` (the wm-sheet rules deletion happens here as well — see step 3)

**Before starting this task, ensure:**
- All Tasks 1-17 are committed.
- `pnpm test`, `pnpm compile`, `pnpm build` are clean.
- The unpacked extension still loads in Chrome and the v2.1 sheet still works (smoke confirmed at the end of Task 4).

- [ ] **Step 1: Write the new `entrypoints/content/index.ts`**

Replace the entire file with:

```ts
import './content.css';
import { defineContentScript } from 'wxt/sandbox';
import type { PickRef } from '@/src/lib/types/thread';
import type { Pick } from '@/src/lib/types/payload';
import { createWiggleDetector, DEFAULT_WIGGLE_OPTS } from '@/src/lib/picker/detect-wiggle';
import { resolveTarget } from '@/src/lib/picker/resolve-target';
import { classifyPick } from '@/src/lib/picker/classify-pick';
import { extractPayload } from '@/src/lib/picker/extract-payload';
import { chromeKV } from '@/src/lib/storage';
import { createRegistry } from '@/src/lib/actions/registry';
import { createThreadStore } from '@/src/lib/thread/store';
import { createThreadOperations } from '@/src/lib/thread/operations';
import { buildAdapterMap } from '@/src/lib/ai/adapters';
import { selectAdapter } from '@/src/lib/actions/api-route';
import { buildPrompt } from '@/src/lib/actions/prompt-builder';
import { activeBackend } from '@/src/lib/ai/backend';
import { BUILTIN_MODIFIERS } from '@/src/lib/actions/builtins/modifiers';

import { createState } from './state';
import { createOverlay } from './overlay';
import { createPill } from './pill';
import { createSidebarMount } from './sidebar/mount';
import { createShell } from './sidebar/shell';
import { createComposer } from './sidebar/composer';
import { createSlashMenu } from './sidebar/slash-menu';
import { createTurnList } from './sidebar/turn-list';
import { renderRestorationBanner } from './sidebar/banners';

import type { WmSettings, MemoryEntry } from '@/src/lib/types';
import type { UserTurn, MagicTurn, Thread } from '@/src/lib/types/thread';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',
  async main() {
    const root = document.createElement('div');
    root.id = 'wm-root';
    document.documentElement.appendChild(root);

    const kv = chromeKV();
    const registry = await createRegistry(kv);
    const threadStore = createThreadStore(kv);
    const threadOps = createThreadOperations(threadStore, kv);
    const adapters = buildAdapterMap();
    const state = createState();

    const cursorUrl = chrome.runtime.getURL('cursor.svg');
    const overlay = createOverlay(root, cursorUrl);
    overlay.mount();

    const pill = createPill(root);
    pill.onCommit(() => commit());
    pill.onChipRemove((id) => removePick(id));

    const sidebar = createSidebarMount(root);
    const shell = createShell(sidebar, state);
    const composer = createComposer(sidebar.composer, state, registry);
    const slashMenu = createSlashMenu(sidebar.composer, registry);

    const turnList = createTurnList(sidebar.body, registry, {
      onSave: async (m) => {
        const t = currentThread!;
        await threadOps.promoteToMemory(t, m);
      },
      onCopy: async (m) => {
        try { await navigator.clipboard.writeText(m.answer); } catch { /* ignored */ }
      },
      onRerun: async (m) => {
        await rerun(m);
      },
      onBackRefClick: (selector) => {
        const el = document.querySelector(selector);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      },
    });

    // ---------- picker state ----------
    let stagingPicks: PickRef[] = [];
    let pickIdCounter = 0;
    let currentThread: Thread | null = null;
    let lastUserTurn: UserTurn | null = null;

    const wiggle = createWiggleDetector();
    let cursorX = 0, cursorY = 0;
    let lastHover: { el: Element | null } = { el: null };

    function buildSelector(el: Element): string {
      // Best-effort stable selector. The detail doesn't matter for picker.commit;
      // it matters when re-resolving for back-references.
      const parts: string[] = [];
      let cur: Element | null = el;
      while (cur && cur !== document.body && parts.length < 6) {
        let s = cur.tagName.toLowerCase();
        if (cur.id) { parts.unshift(`${s}#${cur.id}`); break; }
        if (cur.parentElement) {
          const i = Array.from(cur.parentElement.children).indexOf(cur) + 1;
          s += `:nth-child(${i})`;
        }
        parts.unshift(s);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    }

    function makePickRef(el: Element): PickRef {
      const selector = buildSelector(el);
      const payload = extractPayload(el, selector);
      const tags = classifyPick(el);
      const labelText = (payload.text || (payload.image?.alt) || (payload.link?.text) || el.tagName).trim();
      const label = labelText.length > 60 ? labelText.slice(0, 57) + '…' : labelText;
      return {
        id: `pick-${++pickIdCounter}`,
        type: payload.image ? 'img'
            : payload.link ? 'link'
            : (payload.tag === 'button' || payload.tag === 'a') ? 'control'
            : (payload.tag === 'video' || payload.tag === 'audio') ? 'media'
            : 'text',
        tags,
        label,
        selector,
        payload,
      };
    }

    // ---------- mode transitions ----------
    function activate() {
      state.setMode('selecting');
      document.body.classList.add('wm-active');
      pill.mount();
      pill.setPicks(stagingPicks);
      overlay.setCursor(cursorX, cursorY, true);
    }

    function deactivate() {
      stagingPicks = [];
      pill.unmount();
      overlay.setCursor(cursorX, cursorY, false);
      overlay.setHighlight(null, false);
      overlay.setTag(null, '');
      document.body.classList.remove('wm-active');
      state.setMode('idle');
    }

    function removePick(id: string) {
      stagingPicks = stagingPicks.filter(p => p.id !== id);
      pill.setPicks(stagingPicks);
      if (stagingPicks.length === 0 && state.getMode() === 'selecting') deactivate();
    }

    async function commit() {
      if (stagingPicks.length === 0) return;
      const picks = [...stagingPicks];
      stagingPicks = [];
      pill.unmount();
      overlay.setCursor(cursorX, cursorY, false);
      overlay.setHighlight(null, false);
      document.body.classList.remove('wm-active');

      const origin = window.location.origin;
      const pathname = window.location.pathname;

      const settings = (await kv.get<WmSettings>('wm:settings')) ?? { backend: 'nano', provider: '', apiKey: '', model: '' };
      const backend = activeBackend(settings);

      // Thread restoration
      const fresh = await threadStore.loadIfFresh(origin, pathname);
      const isRestored = fresh !== null;
      currentThread = fresh ?? {
        id: `${origin}${pathname}`,
        origin, pathname,
        title: document.title || '(untitled)',
        turns: [],
        createdAt: Date.now(),
        lastTouchedAt: Date.now(),
      };
      await threadStore.save(currentThread);

      sidebar.open();
      shell.setBackend(backend, true);
      state.setMode('sidebar');

      if (isRestored && currentThread.turns.length > 0) {
        sidebar.body.appendChild(renderRestorationBanner(async () => {
          await threadStore.archive(origin, pathname);
          currentThread = {
            id: `${origin}${pathname}`,
            origin, pathname,
            title: document.title || '(untitled)',
            turns: [],
            createdAt: Date.now(),
            lastTouchedAt: Date.now(),
          };
          await threadStore.save(currentThread);
          turnList.reset([]);
        }));
      }
      turnList.reset(currentThread.turns);

      composer.setPicks(picks);
      composer.setContext({
        picks, thread: currentThread, backend,
        pageMeta: { host: location.host, title: document.title, primaryLang: document.documentElement.lang || 'en' },
      });
      slashMenu.setContext({
        picks, thread: currentThread, backend,
        pageMeta: { host: location.host, title: document.title, primaryLang: document.documentElement.lang || 'en' },
      });
    }

    // ---------- turn flow ----------
    state.on('turn:submit', async ({ actionId, modifiers, text, picks }) => {
      if (!currentThread) return;
      const action = registry.getById(actionId);
      if (!action) return;

      const userTurn: UserTurn = {
        id: crypto.randomUUID(),
        role: 'user',
        kind: text !== undefined ? 'ask' : 'hero',
        actionId, modifiers,
        text,
        picks,
        ts: Date.now(),
      };
      currentThread = await threadOps.appendTurn(currentThread.origin, currentThread.pathname, userTurn);
      turnList.appendUser(userTurn);
      lastUserTurn = userTurn;

      // Build the Magic turn shell (status: 'streaming')
      const magic: MagicTurn = {
        id: crypto.randomUUID(),
        role: 'magic',
        inReplyTo: userTurn.id,
        answer: '',
        sources: picks,
        status: 'streaming',
        backend: activeBackend((await kv.get<WmSettings>('wm:settings')) ?? { backend: 'nano', provider: '', apiKey: '', model: '' }),
        ts: Date.now(),
      };
      const handle = turnList.appendMagic(magic);

      try {
        const adapter = selectAdapter(action.apiPreference, action.fallback, adapters);
        if (!adapter) {
          handle.showError('nano-unavailable', 'On-device AI isn’t ready and no fallback is available.');
          return;
        }
        const prompt = buildPrompt(action.prompt, {
          picks, question: text,
          pageMeta: { host: location.host, title: document.title, primaryLang: document.documentElement.lang || 'en' },
          modifiers,
          url: location.href,
          modifierAddenda: Object.fromEntries(BUILTIN_MODIFIERS.map(m => [m.id, m.promptAddendum])),
        });
        const controller = new AbortController();
        const runAdapter = adapter as (typeof adapter) & { run: (p: typeof prompt, sig: AbortSignal) => Promise<{ chunks(): AsyncIterable<string>; abort(): void; }> };
        const stream = await runAdapter.run(prompt, controller.signal);
        let full = '';
        for await (const chunk of stream.chunks()) {
          full += chunk;
          handle.appendChunk(chunk);
        }
        magic.answer = full;
        magic.status = 'done';
        handle.finalize(full);

        // Persist completed Magic turn into the thread
        currentThread = await threadOps.appendTurn(currentThread.origin, currentThread.pathname, magic);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        handle.showError('stream-failed', `The model stopped mid-answer: ${msg}`);
        magic.status = 'error';
        magic.errorCode = 'stream-failed';
      }
    });

    async function rerun(magic: MagicTurn) {
      if (!currentThread) return;
      const userTurn = currentThread.turns.find(
        t => t.role === 'user' && t.id === magic.inReplyTo,
      ) as UserTurn | undefined;
      if (!userTurn) return;
      const action = registry.getById(userTurn.actionId);
      if (!action) return;

      const replacement: MagicTurn = {
        ...magic,
        id: crypto.randomUUID(),
        answer: '',
        status: 'streaming',
        ts: Date.now(),
      };
      const handle = turnList.replaceMagic(magic.id, replacement);

      try {
        const adapter = selectAdapter(action.apiPreference, action.fallback, adapters);
        if (!adapter) { handle.showError('nano-unavailable', 'On-device AI isn’t ready.'); return; }
        const prompt = buildPrompt(action.prompt, {
          picks: userTurn.picks,
          question: userTurn.text,
          pageMeta: { host: location.host, title: document.title, primaryLang: document.documentElement.lang || 'en' },
          modifiers: userTurn.modifiers,
          url: location.href,
          modifierAddenda: Object.fromEntries(BUILTIN_MODIFIERS.map(m => [m.id, m.promptAddendum])),
        });
        const controller = new AbortController();
        const runAdapter = adapter as (typeof adapter) & { run: (p: typeof prompt, sig: AbortSignal) => Promise<{ chunks(): AsyncIterable<string>; abort(): void; }> };
        const stream = await runAdapter.run(prompt, controller.signal);
        let full = '';
        for await (const chunk of stream.chunks()) {
          full += chunk;
          handle.appendChunk(chunk);
        }
        replacement.answer = full;
        replacement.status = 'done';
        handle.finalize(full);
        currentThread = await threadOps.rerunTurn(currentThread.origin, currentThread.pathname, magic.id, replacement);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        handle.showError('stream-failed', `The model stopped mid-answer: ${msg}`);
      }
    }

    // ---------- +Add re-entry ----------
    state.on('add-clicked', () => {
      if (state.getMode() !== 'sidebar') return;
      state.setMode('sidebar+selecting');
      document.body.classList.add('wm-active');
      pill.mount();
      pill.setPicks(stagingPicks);
      overlay.setCursor(cursorX, cursorY, true);
    });

    // When in sidebar+selecting and Enter is pressed, the staged picks attach to the composer.
    function commitStaging() {
      if (state.getMode() !== 'sidebar+selecting') return;
      composer.setPicks([...composer.getStagedPicks(), ...stagingPicks]);
      stagingPicks = [];
      pill.unmount();
      overlay.setCursor(cursorX, cursorY, false);
      overlay.setHighlight(null, false);
      document.body.classList.remove('wm-active');
      state.setMode('sidebar');
      composer.focusInput();
    }

    // ---------- sidebar close ----------
    state.on('sidebar:close', () => {
      sidebar.close();
      currentThread = null;
      lastUserTurn = null;
      state.setMode('idle');
    });

    // ---------- input handling ----------
    document.addEventListener('mousemove', (e) => {
      cursorX = e.clientX;
      cursorY = e.clientY;
      const mode = state.getMode();
      if (mode !== 'selecting' && mode !== 'sidebar+selecting') {
        if (wiggle.observe(cursorX, cursorY, performance.now())) {
          if (mode === 'idle') activate();
          else if (mode === 'sidebar') state.emit('add-clicked', {});
        }
        return;
      }
      // selecting: paint
      overlay.setCursor(cursorX, cursorY, true);
      const leaf = document.elementFromPoint(cursorX, cursorY);
      if (!leaf || leaf.closest('#wm-root')) {
        overlay.setHighlight(null, false);
        overlay.setTag(null, '');
        return;
      }
      const resolved = resolveTarget(leaf);
      if (resolved === lastHover.el) return;
      lastHover.el = resolved;
      const rect = resolved.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        overlay.setHighlight(null, false);
        return;
      }
      const picked = stagingPicks.some(p => p.payload.selector === buildSelector(resolved));
      overlay.setHighlight(rect, picked);
      overlay.setTag(rect, resolved.tagName.toLowerCase());
    }, { capture: true });

    document.addEventListener('click', (e) => {
      const mode = state.getMode();
      if (mode !== 'selecting' && mode !== 'sidebar+selecting') return;
      const leaf = document.elementFromPoint(e.clientX, e.clientY);
      if (!leaf || leaf.closest('#wm-root')) return;
      e.preventDefault();
      e.stopPropagation();
      const resolved = resolveTarget(leaf);
      const newPick = makePickRef(resolved);
      const dupIdx = stagingPicks.findIndex(p => p.selector === newPick.selector);
      if (dupIdx >= 0) stagingPicks.splice(dupIdx, 1);
      else stagingPicks.push(newPick);
      pill.setPicks(stagingPicks);
    }, { capture: true });

    document.addEventListener('keydown', (e) => {
      const mode = state.getMode();
      if (mode === 'selecting' && e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (mode === 'sidebar+selecting' && e.key === 'Enter') {
        e.preventDefault();
        commitStaging();
      } else if (e.key === 'Escape') {
        if (mode === 'selecting') { e.preventDefault(); deactivate(); }
        else if (mode === 'sidebar+selecting') { e.preventDefault(); state.setMode('sidebar'); pill.unmount(); stagingPicks = []; }
        else if (mode === 'sidebar') { e.preventDefault(); state.emit('sidebar:close', {}); }
      } else if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        if (mode === 'idle') activate();
        else if (mode === 'sidebar') state.emit('add-clicked', {});
      }
    }, { capture: true });
  },
});
```

Some additions the implementer may need to make to support this orchestrator:
1. Ensure the `Pill` and `Composer` types are correctly importable.

If TypeScript complains about `(typeof adapter) & { run: ... }` casts, refine the adapter interface in `src/lib/actions/api-route.ts` to make `run` part of the `ApiAdapter` shape:

```ts
// api-route.ts — adjust the interface
export interface ApiAdapter {
  name: ApiPref;
  available(): boolean;
  run?(prompt: BuiltPrompt, signal: AbortSignal): Promise<{ chunks(): AsyncIterable<string>; abort(): void; }>;
}
```

(Make `run` optional so the test-only adapters in Plan 1 still satisfy the interface.)

- [ ] **Step 2: Delete the v2.1 sheet CSS from `entrypoints/content/content.css`**

Remove every rule that targets `#wm-sheet*`. Keep rules for `body.wm-active` (page dim during selection), and any rules that overlay.css / pill.css / sidebar.css haven't already covered (`#wm-root`, etc.).

After deletion, `content.css` should be much shorter (~50-100 lines) — mostly the page-dim during `wm-active` and any cursor-mask fallbacks.

- [ ] **Step 3: Compile + build + smoke**

```bash
pnpm compile
pnpm build
```
Expected: clean. If any type errors surface in `index.ts`, fix them inline (most likely the adapter `run` type cast, addressed above).

**Manual smoke (Chrome):**
- Load `.output/chrome-mv3-dev/`. Open a Substack post or Wikipedia.
- Wiggle. Pill appears. Pick 2 paragraphs. Press Enter.
- Sidebar slides in from right. Page content reflows left. Summarize and Compare visible as heroes.
- Click Summarize. Streaming answer appears in a Magic turn card.
- After completion: Save, Copy, Rerun visible. Sources chips at bottom.
- Click a source chip — page scrolls to the picked element.
- Click `+ Add` — pill returns, sidebar stays. Pick a new paragraph. Press Enter. Composer staged chips show old + new pick.
- Click ×. Sidebar closes. Page returns to full width.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/content/index.ts entrypoints/content/content.css src/lib/actions/api-route.ts entrypoints/content/sidebar/composer.ts
git commit -m "feat(content): rewire content script to new sidebar + foundation; delete v2.1 sheet"
```

---

## Phase E: Options → Actions tab

---

## Task 19: Options Actions tab scaffold

Add the new tab structure and routing.

**Files:**
- Modify: `entrypoints/options/index.html`
- Modify: `entrypoints/options/main.ts`
- Create: `entrypoints/options/actions.css`

- [ ] **Step 1: Inspect current options page**

```bash
cat entrypoints/options/index.html | head -40
cat entrypoints/options/main.ts | head -40
```

Understand current structure. Likely a single-page form with backend/BYOK fields.

- [ ] **Step 2: Add tab nav + Actions tab markup to `index.html`**

At the top of the body (or wherever the existing form is), wrap the existing content in a `<section class="tab" data-tab="models">` and add:

```html
<nav class="options-tabs">
  <button class="options-tab active" data-tab="models" type="button">Models</button>
  <button class="options-tab" data-tab="actions" type="button">Actions</button>
</nav>

<section class="tab" data-tab="models">
  <!-- existing model/BYOK form goes here -->
</section>

<section class="tab" data-tab="actions" hidden>
  <h2>Magic Actions</h2>
  <div class="actions-sections">
    <section class="actions-builtin">
      <h3>Built-in core</h3>
      <ul id="builtin-core-list"></ul>
    </section>
    <section class="actions-library">
      <h3>Library</h3>
      <p class="hint">Curated prompts. One tap to enable.</p>
      <ul id="library-list"></ul>
    </section>
    <section class="actions-order">
      <h3>Hero order</h3>
      <p class="hint">Drag to reorder, or use the arrow buttons.</p>
      <ol id="hero-order-list"></ol>
    </section>
  </div>
</section>

<link rel="stylesheet" href="./actions.css">
```

- [ ] **Step 3: Add tab-routing to `main.ts`**

At the top of the existing main script, add:

```ts
const tabs = document.querySelectorAll<HTMLButtonElement>('.options-tab');
const sections = document.querySelectorAll<HTMLElement>('section.tab');
for (const t of tabs) {
  t.addEventListener('click', () => {
    for (const x of tabs) x.classList.toggle('active', x === t);
    const name = t.dataset.tab!;
    for (const s of sections) s.hidden = s.dataset.tab !== name;
  });
}
```

- [ ] **Step 4: Write `actions.css`**

```css
.options-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 16px;
}
.options-tab {
  padding: 8px 16px;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font: inherit;
  color: #6b7280;
}
.options-tab.active {
  color: #111;
  border-bottom-color: #7c3aed;
}

.actions-sections {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.actions-sections h3 {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
}
.actions-sections .hint {
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 8px;
}
.actions-sections ul, .actions-sections ol {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.actions-sections li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.actions-sections .action-label {
  flex: 1;
  font-weight: 500;
}
.actions-sections .action-desc {
  flex: 2;
  font-size: 12px;
  color: #6b7280;
}
.actions-sections .action-toggle {
  padding: 4px 12px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
}
.actions-sections .action-toggle.enabled {
  background: #ecfdf5;
  border-color: #6ee7b7;
  color: #047857;
}
.actions-sections .arrow-btn {
  width: 24px;
  height: 24px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
}
.actions-sections .arrow-btn:disabled { opacity: 0.3; cursor: not-allowed; }
```

- [ ] **Step 5: Verify**

```bash
pnpm compile && pnpm build
```

Load the unpacked extension, open options page, confirm the two tabs render and switching works.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/options/index.html entrypoints/options/main.ts entrypoints/options/actions.css
git commit -m "feat(options): add Actions tab scaffold"
```

---

## Task 20: Actions library UI → `entrypoints/options/actions-library.ts`

Populates the three sections (built-in core, library, hero order) and wires enable/disable + reorder.

**Files:**
- Create: `entrypoints/options/actions-library.ts`
- Modify: `entrypoints/options/main.ts` (import + initialize)

- [ ] **Step 1: Write `actions-library.ts`**

```ts
// entrypoints/options/actions-library.ts
import { chromeKV } from '@/src/lib/storage';
import { createRegistry } from '@/src/lib/actions/registry';
import type { ActionDef } from '@/src/lib/types/action';

export async function initActionsUI() {
  const kv = chromeKV();
  const registry = await createRegistry(kv);

  const coreList = document.getElementById('builtin-core-list')!;
  const libList = document.getElementById('library-list')!;
  const heroList = document.getElementById('hero-order-list')!;

  function renderCore() {
    coreList.innerHTML = '';
    for (const a of registry.getAll().filter(x => x.source === 'builtin-core')) {
      coreList.appendChild(renderActionRow(a, /* coreCanDisable */ false));
    }
  }

  function renderLibrary() {
    libList.innerHTML = '';
    for (const a of registry.getLibrary()) {
      const enabled = registry.isLibraryEnabled(a.id);
      libList.appendChild(renderLibraryRow(a, enabled));
    }
  }

  async function renderHeroOrder() {
    heroList.innerHTML = '';
    const all = registry.getAll();
    // The hero order is stored under wm:actions:hero
    const heroIds = (await kv.get<string[]>('wm:actions:hero')) ?? [];
    heroIds.forEach((id, i) => {
      const a = all.find(x => x.id === id);
      if (!a) return;
      heroList.appendChild(renderHeroRow(a, i, heroIds));
    });
  }

  function renderActionRow(a: ActionDef, _canDisable: boolean): HTMLElement {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="action-label">${escape(a.icon ?? '✦')} ${escape(a.label)}</span>
      <span class="action-desc">${escape(a.description ?? '')}</span>
      <span class="action-toggle enabled">enabled</span>
    `;
    return li;
  }

  function renderLibraryRow(a: ActionDef, enabled: boolean): HTMLElement {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="action-label">${escape(a.icon ?? '✦')} ${escape(a.label)}</span>
      <span class="action-desc">${escape(a.description ?? '')}</span>
      <button class="action-toggle ${enabled ? 'enabled' : ''}" type="button">${enabled ? 'enabled' : 'enable'}</button>
    `;
    const toggle = li.querySelector<HTMLButtonElement>('.action-toggle')!;
    toggle.addEventListener('click', async () => {
      if (enabled) {
        await registry.disableFromLibrary(a.id);
      } else {
        await registry.enableFromLibrary(a.id);
        const heroIds = (await kv.get<string[]>('wm:actions:hero')) ?? [];
        if (!heroIds.includes(a.id)) {
          heroIds.push(a.id);
          await registry.setHeroOrder(heroIds);
        }
      }
      renderLibrary();
      renderHeroOrder();
    });
    return li;
  }

  function renderHeroRow(a: ActionDef, idx: number, heroIds: string[]): HTMLElement {
    const li = document.createElement('li');
    li.innerHTML = `
      <button class="arrow-btn up" type="button" aria-label="Move up" ${idx === 0 ? 'disabled' : ''}>↑</button>
      <button class="arrow-btn down" type="button" aria-label="Move down" ${idx === heroIds.length - 1 ? 'disabled' : ''}>↓</button>
      <span class="action-label">${escape(a.icon ?? '✦')} ${escape(a.label)}</span>
    `;
    const up = li.querySelector<HTMLButtonElement>('.up')!;
    const down = li.querySelector<HTMLButtonElement>('.down')!;
    up.addEventListener('click', async () => { swap(heroIds, idx, idx - 1); await registry.setHeroOrder(heroIds); renderHeroOrder(); });
    down.addEventListener('click', async () => { swap(heroIds, idx, idx + 1); await registry.setHeroOrder(heroIds); renderHeroOrder(); });
    return li;
  }

  function swap<T>(arr: T[], i: number, j: number) { const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  function escape(s: string): string { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  renderCore();
  renderLibrary();
  await renderHeroOrder();
}
```

- [ ] **Step 2: Wire into `main.ts`**

At the bottom of `entrypoints/options/main.ts`:

```ts
import { initActionsUI } from './actions-library';
initActionsUI().catch(err => console.error('[wm options] actions UI init failed:', err));
```

- [ ] **Step 3: Verify**

```bash
pnpm compile && pnpm build
```

**Smoke:** Open the options page, click Actions tab. Confirm built-in core lists Summarize, Compare, Ask. Library lists the 9 entries. Click "enable" on ELI5; it switches to "enabled" and ELI5 appears in Hero order. Move ELI5 up/down with arrows; back to the content page, wiggle, pick, commit — ELI5 should appear in the hero row.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/actions-library.ts entrypoints/options/main.ts
git commit -m "feat(options): Actions library UI — enable, disable, reorder heroes"
```

---

## Phase F: Migration cleanup + verification

---

## Task 21: Migrate popup to chromeKV

The popup's `entrypoints/popup/main.ts` reads `wm_memory` directly via `chrome.storage.local.get/set`. Replace with `chromeKV()` for consistency. Functional behavior unchanged.

**Files:**
- Modify: `entrypoints/popup/main.ts`

- [ ] **Step 1: Edit the file**

Find the raw `chrome.storage.local.get('wm_memory')` and `chrome.storage.local.set({ wm_memory: ... })` calls (about 6 of them). Replace with:

```ts
import { chromeKV } from '@/src/lib/storage';
const kv = chromeKV();

// Examples of replacement:
const wm_memory = (await kv.get<MemoryEntry[]>('wm_memory')) ?? [];
// ...
await kv.set('wm_memory', next);
```

- [ ] **Step 2: Verify**

```bash
pnpm compile && pnpm build
```

**Smoke:** Open the popup, confirm saved memories still render. Save a new answer from the new sidebar, confirm it appears in the popup.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/popup/main.ts
git commit -m "refactor(popup): use chromeKV abstraction instead of raw chrome.storage.local"
```

---

## Task 22: Full suite verification + tag

- [ ] **Step 1: Run the full suite**

```bash
pnpm test && pnpm compile && pnpm build
```

Expected: all tests pass, type-check clean, build succeeds.

- [ ] **Step 2: Manual smoke checklist on three site classes**

A. **Article page** (a Substack post or Wikipedia article):
   - Wiggle → pill appears, page dim activates
   - Pick a paragraph → highlight tracks, tag badge shows "p"
   - Press Enter → sidebar opens, page reflows left
   - Click Summarize → streaming answer appears
   - Click Save → "saved ✓" badge
   - Open popup → saved entry visible
   - Reload page → wiggle + commit → sidebar opens with "Continuing your previous conversation" banner

B. **Code host** (a GitHub file view):
   - Wiggle → pill
   - Pick a code block (`<pre>` or similar)
   - Press Enter → sidebar
   - **"Explain this code" should appear as a hero** (because the pick has `code` tag and ELI5/explain-code library entry tag-matches)
   - If "Explain this code" is in the library but not enabled, it won't show; enable it in Options first, then retry

C. **Product page** (any product card or e-commerce result):
   - Wiggle → pill
   - Pick two product cards → highlights track
   - Press Enter → sidebar
   - **Compare** should appear as a hero (2+ picks; ranker boost from `pageType: product` if you've added that metadata)
   - Click Compare → streaming answer

D. **Wide functionality check**:
   - +Add re-enters selection without closing sidebar; new picks attach to composer
   - Rerun on a magic turn → replaces in place
   - Back-ref chip click → scrolls to that element
   - Slash menu → type `/`, see ELI5 / Counter-argument / etc.
   - Esc closes sidebar; reload page; wiggle + commit → thread restoration banner appears
   - Click Start fresh → thread cleared

- [ ] **Step 3: Tag the release-candidate state**

```bash
git tag plan2-rebuild -m "Plan 2: sidebar UI + migration complete; foundation wired"
```

- [ ] **Step 4: Final commit (if any smoke fixes needed)**

If smoke surfaced bugs, fix them inline as separate commits before tagging.

---

## Plan 2 exit criteria

A reviewer should be able to confirm:

- [ ] `pnpm test` passes (≥150 tests — Plan 1's 110 + Plan 2 additions from Tasks 2, 3, 4, 5, 6)
- [ ] `pnpm compile` passes
- [ ] `pnpm build` succeeds
- [ ] All v2.1 `#wm-sheet*` references are gone from `entrypoints/content/index.ts` and `entrypoints/content/content.css`
- [ ] `entrypoints/content/index.ts` is under 400 lines (down from 1335)
- [ ] The smoke checklist (Task 22) passes on three site classes
- [ ] `entrypoints/options/` shows an Actions tab with built-in / library / hero-order sections
- [ ] Library entries can be enabled and they appear in the sidebar hero row
- [ ] Threads persist per URL: leave and come back, conversation restores with the banner

When all are checked, Plan 2 is complete and the rebuild is feature-complete against the spec.

---

## Open questions / future work

Items deliberately deferred from Plan 2 (these don't block "rebuild complete"):
- **User-authored action editor**: writing custom actions with arbitrary prompt templates. Registry supports `registerUser` already; the UI is the missing piece.
- **JSON export / import** of actions and hero order.
- **Sidebar resize handle** — fixed 420px in v1.
- **Drag-and-drop hero reordering** — Plan 2 ships arrow buttons.
- **Learned contextual ranker** — Plan 2 ships the rule-based v1.
- **Compose modifiers as chips** (`bullets`, `shorter`) shown beneath the composer — Plan 2's composer doesn't surface modifiers in the UI; they're only available via slash command modifiers (e.g., `/eli5 bullets`) which the slash menu doesn't yet support either.
- **Translate modifier**: registry types it but no UI surface in Plan 2.
- **Stream Stop button** mid-generation.
- **Backend error codes** beyond `nano-unavailable` / `stream-failed` — the full table in spec §9 is partial.

A follow-up plan can address these incrementally without re-architecting.

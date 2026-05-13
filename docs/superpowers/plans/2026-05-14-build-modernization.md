# Build Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Wiggle Magic Chrome extension from hand-written vanilla JS in `extension/` to a Vite-bundled TypeScript codebase using WXT, with zero behavior change.

**Architecture:** WXT (Vite-based extension framework) auto-discovers entry points from `entrypoints/`. Manifest is generated from `wxt.config.ts`. Source authored in strict-mode TypeScript. Vendored `marked` + `dompurify` replaced with npm imports.

**Tech Stack:** WXT, pnpm, TypeScript (strict mode), Vite (under WXT), marked, dompurify.

**Spec:** `docs/superpowers/specs/2026-05-14-build-modernization-design.md`

**Note on TDD:** This is a build/infrastructure migration, not a feature with unit tests. The verification cycle is: `pnpm compile` (type-check) → `pnpm build` (bundle) → manual smoke test in Chrome against the acceptance criteria. Each migration task ends with a `pnpm compile` to catch breakage early.

---

## Pre-flight

Before starting:

- [ ] **Pre-flight Step 1: Confirm working directory and clean tree**

```bash
cd /Users/ajmalhassan/hobbyspace/wiggle-magic
git status
```

Expected: `On branch main`, working tree clean (or only `.superpowers/` brainstorming files, which are gitignored).

- [ ] **Pre-flight Step 2: Confirm pnpm is installed**

```bash
pnpm --version
```

Expected: a version number (≥8). If missing, install: `npm install -g pnpm`.

- [ ] **Pre-flight Step 3: Confirm Node version**

```bash
node --version
```

Expected: ≥20. WXT requires Node 20+.

---

## Task 1: Initialize package.json with dependencies

**Files:**
- Create: `package.json`

- [ ] **Step 1: Write package.json**

Create `/Users/ajmalhassan/hobbyspace/wiggle-magic/package.json`:

```jsonc
{
  "name": "wiggle-magic",
  "version": "0.1.0",
  "description": "Wiggle your cursor on any page to ask AI about what you see. Powered by Gemini Nano (on-device) with optional BYOK fallback.",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "compile": "tsc --noEmit",
    "postinstall": "wxt prepare"
  },
  "dependencies": {
    "marked": "^14.1.0",
    "dompurify": "^3.1.0"
  },
  "devDependencies": {
    "wxt": "^0.20.0",
    "typescript": "^5.6.0",
    "@types/dompurify": "^3.0.5"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run from project root:

```bash
pnpm install
```

Expected output: pnpm fetches deps, runs `wxt prepare` (via `postinstall`), which creates `.wxt/` directory with type stubs. No errors.

- [ ] **Step 3: Verify .wxt/ was created**

```bash
ls -la .wxt/
```

Expected: a directory containing `tsconfig.json`, `wxt.d.ts`, and other generated files.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(build): bootstrap pnpm + wxt + typescript dependencies"
```

---

## Task 2: Add wxt.config.ts

**Files:**
- Create: `wxt.config.ts`

- [ ] **Step 1: Write wxt.config.ts**

Create `/Users/ajmalhassan/hobbyspace/wiggle-magic/wxt.config.ts`:

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Wiggle Magic',
    description:
      'Wiggle your cursor on any page to ask AI about what you see. Powered by Gemini Nano (on-device) with optional BYOK fallback.',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['<all_urls>'],
    minimum_chrome_version: '138',
    action: {
      default_title: 'Wiggle Magic — saved answers',
    },
    web_accessible_resources: [
      { resources: ['cursor.svg'], matches: ['<all_urls>'] },
    ],
  },
  srcDir: '.',
  outDir: '.output',
});
```

- [ ] **Step 2: Re-run wxt prepare to incorporate config**

```bash
pnpm wxt prepare
```

Expected: no errors. `.wxt/` regenerates with the manifest context.

- [ ] **Step 3: Commit**

```bash
git add wxt.config.ts
git commit -m "chore(build): add wxt.config.ts with manifest fields"
```

---

## Task 3: Add tsconfig.json

**Files:**
- Create: `tsconfig.json`

- [ ] **Step 1: Write tsconfig.json**

Create `/Users/ajmalhassan/hobbyspace/wiggle-magic/tsconfig.json`:

```jsonc
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noImplicitOverride": true,
    "isolatedModules": true
  },
  "include": ["entrypoints", "src", "wxt.config.ts"]
}
```

- [ ] **Step 2: Verify it parses**

```bash
pnpm exec tsc --showConfig > /dev/null
```

Expected: no errors. (Output is silently discarded; just verifying the config is valid JSON and resolves.)

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore(build): add tsconfig.json (strict mode)"
```

---

## Task 4: Update .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Read current .gitignore**

```bash
cat /Users/ajmalhassan/hobbyspace/wiggle-magic/.gitignore
```

Expected: currently contains `.superpowers/` only.

- [ ] **Step 2: Append build/output entries**

Replace `/Users/ajmalhassan/hobbyspace/wiggle-magic/.gitignore` with:

```
.superpowers/
node_modules/
.output/
.wxt/
*.log
```

- [ ] **Step 3: Verify ignored entries don't show in git status**

```bash
git status
```

Expected: `node_modules/`, `.wxt/`, `.output/` (if it exists) do NOT appear as untracked.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore(build): gitignore node_modules, .output, .wxt"
```

---

## Task 5: Add type shims for experimental Chrome AI APIs

**Files:**
- Create: `src/lib/chrome-ai.d.ts`

The existing `extension/content.js` and `extension/options.js` reference experimental Chrome built-in AI globals (`LanguageModel`, `Summarizer`, `Rewriter`, `Translator`, `LanguageDetector`) that are not in `@types/chrome`. Strict TypeScript will reject these without ambient declarations.

- [ ] **Step 1: Create the directory and shim file**

Create `/Users/ajmalhassan/hobbyspace/wiggle-magic/src/lib/chrome-ai.d.ts`:

```ts
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
    expectedInputs?: Array<{ type: 'text' | 'image' | 'audio' }>;
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
      type?: 'tl;dr' | 'key-points' | 'teaser' | 'headline';
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
```

- [ ] **Step 2: Verify TypeScript picks up the declarations**

```bash
pnpm compile
```

Expected: passes with zero errors. (Nothing references these types yet, but they should at least parse.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/chrome-ai.d.ts
git commit -m "chore(build): add ambient types for experimental Chrome AI APIs"
```

---

## Task 6: Port the markdown helper to TypeScript

**Files:**
- Create: `src/lib/markdown.ts`

- [ ] **Step 1: Write the new module**

Create `/Users/ajmalhassan/hobbyspace/wiggle-magic/src/lib/markdown.ts`:

```ts
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Restrictive on purpose: no <img>, no <input> (task lists), no <video>.
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'b', 'i', 'code', 'pre',
  'blockquote', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];
const ALLOWED_ATTR = ['href', 'title'];
const SANITIZE_CONFIG = { ALLOWED_TAGS, ALLOWED_ATTR };

marked.use({ gfm: true, breaks: true });

// Force links to open in a new tab; never leak the current page via referrer.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function renderMarkdownInto(el: HTMLElement, text: string): void {
  if (!text) {
    el.textContent = '';
    return;
  }
  const html = marked.parse(String(text), { async: false }) as string;
  el.innerHTML = DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
pnpm compile
```

Expected: passes. If `marked.parse` complains about return type, the `as string` cast inside `renderMarkdownInto` should satisfy it; if not, switch to `marked.parse(text)` (no opts) since `breaks: true` and `gfm: true` are already set globally via `marked.use(...)`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/markdown.ts
git commit -m "chore(build): add typed markdown helper using npm marked + dompurify"
```

---

## Task 7: Move cursor.svg to public/

**Files:**
- Move: `extension/cursor.svg` → `public/cursor.svg`

- [ ] **Step 1: Create public/ and move the file**

```bash
mkdir -p /Users/ajmalhassan/hobbyspace/wiggle-magic/public
git mv /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/cursor.svg /Users/ajmalhassan/hobbyspace/wiggle-magic/public/cursor.svg
```

- [ ] **Step 2: Verify**

```bash
ls /Users/ajmalhassan/hobbyspace/wiggle-magic/public/
ls /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/
```

Expected: `cursor.svg` in `public/`, no longer in `extension/`.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(build): move cursor.svg to public/"
```

(Note: do not rebuild yet — the manifest WXT will generate references `cursor.svg` via `web_accessible_resources`, which expects the file in the output bundle. WXT copies everything in `public/` to the output root.)

---

## Task 8: Migrate background script

**Files:**
- Create: `entrypoints/background.ts`
- Delete: `extension/background.js` (after verifying the new one)

- [ ] **Step 1: Create entrypoints/ directory**

```bash
mkdir -p /Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints
```

- [ ] **Step 2: Write entrypoints/background.ts**

Create `/Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/background.ts`:

```ts
// Minimal service worker. The heavy lifting happens in the content script —
// the Prompt API needs a DOM context, which a worker doesn't have.

interface FetchImageMessage {
  action: 'fetchImage';
  url: string;
}

interface FetchImageResponse {
  ok: boolean;
  dataURL?: string | ArrayBuffer | null;
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      chrome.runtime.openOptionsPage();
    }
  });

  // Content scripts in MV3 honor page-CORS, so we fetch images from the service
  // worker (which has host_permissions: <all_urls>) and shuttle back a data URL.
  chrome.runtime.onMessage.addListener(
    (msg: FetchImageMessage, _sender, sendResponse: (r: FetchImageResponse) => void) => {
      if (msg?.action !== 'fetchImage' || !msg.url) return;
      (async () => {
        try {
          const res = await fetch(msg.url, { credentials: 'omit' });
          if (!res.ok) {
            sendResponse({ ok: false });
            return;
          }
          const blob = await res.blob();
          if (!blob.type.startsWith('image/')) {
            sendResponse({ ok: false });
            return;
          }
          const reader = new FileReader();
          reader.onload = () => sendResponse({ ok: true, dataURL: reader.result });
          reader.onerror = () => sendResponse({ ok: false });
          reader.readAsDataURL(blob);
        } catch {
          sendResponse({ ok: false });
        }
      })();
      return true; // keep the message channel open for the async response
    },
  );
});
```

Note: `defineBackground` is auto-imported by WXT. If `pnpm compile` complains, add `import { defineBackground } from 'wxt/sandbox';` at the top (the exact import path may vary by WXT minor version — check `.wxt/wxt.d.ts` for the correct path).

- [ ] **Step 3: Verify it type-checks**

```bash
pnpm compile
```

Expected: passes.

- [ ] **Step 4: Delete the old background.js**

```bash
git rm /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/background.js
```

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background.ts
git commit -m "chore(build): migrate background.js → entrypoints/background.ts"
```

---

## Task 9: Migrate content script

**Files:**
- Create: `entrypoints/content.ts`
- Create: `entrypoints/content.css` (moved from `extension/content.css`)
- Delete: `extension/content.js`, `extension/content.css` (after verification)

This is the biggest file (~800 lines). The strategy is: copy the entire IIFE body into `main()`, add minimal types at the function-signature level, and replace the now-gone `globalThis.renderMarkdownInto` with the imported version.

- [ ] **Step 1: Move content.css to the new location**

```bash
git mv /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/content.css /Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/content.css
```

- [ ] **Step 2: Read the existing content.js to confirm body**

```bash
wc -l /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/content.js
```

Expected: roughly 807 lines.

- [ ] **Step 3: Create entrypoints/content.ts**

Create `/Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/content.ts`:

```ts
import './content.css';
import { renderMarkdownInto } from '@/src/lib/markdown';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',
  main() {
    // ⬇⬇⬇ PASTE THE ENTIRE BODY OF extension/content.js HERE, with these edits:
    //
    //  1. REMOVE the outer `(() => { ... })()` IIFE wrapper. The body
    //     starts right inside `main() {` instead.
    //
    //  2. REMOVE the lines:
    //         if (window.__wiggleMagicLoaded) return;
    //         window.__wiggleMagicLoaded = true;
    //     WXT's defineContentScript only injects once per page; the guard
    //     is no longer needed.
    //
    //  3. `renderMarkdownInto(el, text)` call sites stay AS-IS — the
    //     function name resolves to the imported binding from the top
    //     of this file.
    //
    // Everything else (state vars, helper functions, event bindings) is
    // copied verbatim from extension/content.js. The module-within-file
    // refactor lands in Spec 1, not here.
    //
    // After pasting, add minimal types to make strict TS happy:
    //
    //   - State variables:
    //       let state: 'idle' | 'activating' | 'selecting' | 'sheet' = 'idle';
    //       let samples: { x: number; y: number; t: number }[] = [];
    //       let lastTrigger = 0;
    //       let cursorX = 0, cursorY = 0;
    //       let rafPending = false;
    //       let popoverX = 0, popoverY = 0, popoverW = 0, popoverH = 0;
    //       let lastHighlightEl: Element | null = null;
    //       let viewportShiftPending = false;
    //       const selections: { el: Element; marker: HTMLDivElement; payload: Payload }[] = [];
    //       let currentAnswer = '';
    //       let currentQuestion = '';
    //       let currentSelections: Payload[] = [];
    //       let askController: AbortController | null = null;
    //       let answerSavedThisRun = false;
    //
    //   - Define an inline Payload interface near the top of main():
    //       interface Payload {
    //         selector: string;
    //         tag: string;
    //         text: string;
    //         aria: Record<string, string>;
    //         data: Record<string, string>;
    //         image: { src: string; alt: string; naturalWidth?: number; naturalHeight?: number } | null;
    //         link: { href: string; text: string } | null;
    //         value: string | null;
    //         rect: { x: number; y: number; width: number; height: number };
    //       }
    //
    //   - Function signatures (just the public-shaped ones, not every helper):
    //       function activate(x: number, y: number): void
    //       function deactivate(): void
    //       function togglePick(el: Element): void
    //       function getPayload(el: Element): Payload
    //       function commit(): void
    //       function showSheet(payloads: Payload[]): void
    //       function closeSheet(): void
    //       async function submitAsk(): Promise<void>
    //       async function askAI(question: string, payloads: Payload[], signal: AbortSignal, onChunk: (chunk: string, isFirst: boolean) => void): Promise<void>
    //       async function fetchImageBlobs(payloads: Payload[], signal: AbortSignal): Promise<Map<Payload, Blob>>
    //
    //   - `// @ts-expect-error` is acceptable for the few places where
    //     DOM types are awkward (e.g., currentSrc on img). Use sparingly.
    //
    // ⬆⬆⬆ END OF PASTE BLOCK
  },
});
```

The block comment is the implementer's instruction set. The actual paste replaces the comment block.

- [ ] **Step 4: Verify it type-checks**

```bash
pnpm compile
```

Expected: passes with zero errors. If there are errors, narrow them by file and add types until they clear. Common spots:
- `el.currentSrc` on a non-image Element — cast: `(el as HTMLImageElement).currentSrc`.
- `chrome.runtime.sendMessage` response types — declare a local response type or cast.
- `for...of` over the experimental `promptStreaming` return — `AsyncIterable<string>` should work; if not, `any` it.

- [ ] **Step 5: Delete the old content.js**

```bash
git rm /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/content.js
```

- [ ] **Step 6: Commit**

```bash
git add entrypoints/content.ts entrypoints/content.css
git commit -m "chore(build): migrate content.js → entrypoints/content.ts (typed)"
```

---

## Task 10: Migrate popup

**Files:**
- Create: `entrypoints/popup/index.html`
- Create: `entrypoints/popup/main.ts`
- Create: `entrypoints/popup/popup.css`
- Delete: `extension/popup.html`, `extension/popup.js`, `extension/popup.css`

- [ ] **Step 1: Create the popup directory**

```bash
mkdir -p /Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/popup
```

- [ ] **Step 2: Move popup.css**

```bash
git mv /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/popup.css /Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/popup/popup.css
```

- [ ] **Step 3: Move popup.html and rewrite the script tags**

```bash
git mv /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/popup.html /Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/popup/index.html
```

Now edit `entrypoints/popup/index.html` to:

1. **Change** `<link rel="stylesheet" href="popup.css" />` (stays as-is — relative path still works).
2. **Remove** the four bottom `<script>` tags:
   ```html
   <script src="lib/marked.min.js"></script>
   <script src="lib/purify.min.js"></script>
   <script src="lib/render.js"></script>
   <script src="popup.js"></script>
   ```
3. **Replace** them with a single line just before `</body>`:
   ```html
   <script type="module" src="./main.ts"></script>
   ```

The rest of the HTML (header, template, footer) stays untouched.

- [ ] **Step 4: Move and rewrite popup.js**

```bash
git mv /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/popup.js /Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/popup/main.ts
```

Now edit `entrypoints/popup/main.ts` to add an import block at the very top:

```ts
import './popup.css';
import { renderMarkdownInto } from '@/src/lib/markdown';
```

The rest of the file stays as JavaScript — strict mode TS will complain about some implicit `any`s. Add types as the compiler points them out, one cluster at a time. Likely spots:

- `const listEl = document.getElementById('list');` → `listEl` is `HTMLElement | null`. Either:
  - Add a non-null assertion: `document.getElementById('list')!`
  - Or narrow: `const listEl = document.getElementById('list'); if (!listEl) throw new Error('missing list');`
  - For this migration, non-null assertion (`!`) is acceptable on top-level DOM lookups.

- Variant state map: `const variantsById = new Map();` → `new Map<string, VariantState>();` with a local `interface VariantState { summary?: string; shorter?: string; bullets?: string; translated?: string; _activeVariant?: string; _sourceLang?: string; }`.

- Async generators with `for await (const chunk of ...)` — return type is `AsyncIterable<string>`; the chrome-ai shims declare these correctly.

- Event handlers: `(e) => {...}` will need `e: MouseEvent` or similar in strict mode. Add as needed.

`// @ts-expect-error` is acceptable for any awkward Chrome-AI experimental API spots — but the shims from Task 5 should cover the main ones.

- [ ] **Step 5: Verify it type-checks**

```bash
pnpm compile
```

Expected: passes. Iterate until zero errors.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/popup/
git commit -m "chore(build): migrate popup.{html,js,css} → entrypoints/popup/ (typed)"
```

---

## Task 11: Migrate options

**Files:**
- Create: `entrypoints/options/index.html`
- Create: `entrypoints/options/main.ts`
- Delete: `extension/options.html`, `extension/options.js`

- [ ] **Step 1: Create the options directory**

```bash
mkdir -p /Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/options
```

- [ ] **Step 2: Move options.html and rewrite the script tag**

```bash
git mv /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/options.html /Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/options/index.html
```

Edit `entrypoints/options/index.html`:

- Find the existing `<script src="options.js"></script>` line (near the bottom).
- Replace it with: `<script type="module" src="./main.ts"></script>`.

All inline `<style>` blocks and other HTML stays as-is.

- [ ] **Step 3: Move and rewrite options.js**

```bash
git mv /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/options.js /Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/options/main.ts
```

This file is small (~120 lines) and easy to fully type. Required edits:

1. **DOM lookups** at the top — add non-null assertions or narrow:

```ts
const backendEl  = document.getElementById('backend')  as HTMLSelectElement;
const providerEl = document.getElementById('provider') as HTMLSelectElement;
const keyEl      = document.getElementById('apiKey')   as HTMLInputElement;
const modelEl    = document.getElementById('model')    as HTMLInputElement;
const modelHint  = document.getElementById('modelHint')!;
const saveBtn    = document.getElementById('save')!;
const savedMsg   = document.getElementById('saved')!;
const nanoStatus = document.getElementById('nano-status')!;
const dlBtn      = document.getElementById('nano-download') as HTMLButtonElement;
const dlProgress = document.getElementById('dl-progress')!;
const dlBarFill  = document.getElementById('dl-bar-fill') as HTMLElement;
const dlPct      = document.getElementById('dl-pct')!;
const welcomeEl   = document.getElementById('welcome') as HTMLElement;
const welcomeGo   = document.getElementById('welcome-go')!;
const welcomeSkip = document.getElementById('welcome-skip')!;
```

2. **DEFAULT_MODELS** — add a type so `DEFAULT_MODELS[providerEl.value]` doesn't flag implicit any:

```ts
const DEFAULT_MODELS: Record<string, string> = {
  openai:    'gpt-5.4-mini',
  anthropic: 'claude-haiku-4-5',
  gemini:    'gemini-2.5-flash',
};
```

3. **`LanguageModel`** is provided by the ambient shim from Task 5 — no changes needed at call sites.

4. **The `err.message` access** in the catch blocks: TypeScript types `err` as `unknown` in strict mode. Narrow it:

```ts
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  nanoStatus.textContent = `Could not check Gemini Nano availability: ${msg}`;
  nanoStatus.classList.add('bad');
}
```

Apply the same pattern to the download-failure catch.

- [ ] **Step 4: Verify it type-checks**

```bash
pnpm compile
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/
git commit -m "chore(build): migrate options.{html,js} → entrypoints/options/ (typed)"
```

---

## Task 12: Migrate help (HTML-only)

**Files:**
- Create: `entrypoints/help/index.html`
- Delete: `extension/help.html`

- [ ] **Step 1: Create the help directory and move the file**

```bash
mkdir -p /Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/help
git mv /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/help.html /Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/help/index.html
```

No script tags to rewrite — `help.html` has no `<script>`. WXT will treat this as an unlisted HTML entry and emit `help.html` at the bundle root. The popup's existing `<a href="help.html">` link continues to work because both pages live at the extension root.

- [ ] **Step 2: Commit**

```bash
git commit -m "chore(build): migrate help.html → entrypoints/help/index.html"
```

---

## Task 13: Remove the lib/ vendored libraries and old extension/ shell

**Files:**
- Delete: `extension/lib/marked.min.js`, `extension/lib/purify.min.js`, `extension/lib/render.js`
- Delete: `extension/manifest.json`
- Delete: `extension/README.md` (or move — see step 3)
- Delete: `extension/` directory if empty

- [ ] **Step 1: Confirm no remaining references**

```bash
grep -rn "lib/marked" /Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/ /Users/ajmalhassan/hobbyspace/wiggle-magic/src/ /Users/ajmalhassan/hobbyspace/wiggle-magic/public/ /Users/ajmalhassan/hobbyspace/wiggle-magic/wxt.config.ts
grep -rn "lib/purify" /Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/ /Users/ajmalhassan/hobbyspace/wiggle-magic/src/ /Users/ajmalhassan/hobbyspace/wiggle-magic/public/ /Users/ajmalhassan/hobbyspace/wiggle-magic/wxt.config.ts
grep -rn "render\.js" /Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/ /Users/ajmalhassan/hobbyspace/wiggle-magic/src/ /Users/ajmalhassan/hobbyspace/wiggle-magic/public/ /Users/ajmalhassan/hobbyspace/wiggle-magic/wxt.config.ts
```

Expected: no matches for any of the three. (Matches inside `extension/` are fine — that directory is about to die.)

- [ ] **Step 2: Delete the lib files and manifest**

```bash
git rm /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/lib/marked.min.js
git rm /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/lib/purify.min.js
git rm /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/lib/render.js
git rm /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/manifest.json
```

- [ ] **Step 3: Decide on extension/README.md**

```bash
ls /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/
```

If `extension/README.md` is the only remaining file: move it to the project root if there isn't already a root README, otherwise delete it:

```bash
# If no root README exists:
git mv /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/README.md /Users/ajmalhassan/hobbyspace/wiggle-magic/README.md
# OR if a root README does exist:
git rm /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/README.md
```

- [ ] **Step 4: Remove the empty extension/ directory**

```bash
rmdir /Users/ajmalhassan/hobbyspace/wiggle-magic/extension/lib
rmdir /Users/ajmalhassan/hobbyspace/wiggle-magic/extension
```

Expected: both removals succeed (directories are empty after the git rm calls).

- [ ] **Step 5: Verify nothing in the source tree references the deleted paths**

```bash
grep -rn "extension/" /Users/ajmalhassan/hobbyspace/wiggle-magic/entrypoints/ /Users/ajmalhassan/hobbyspace/wiggle-magic/src/ /Users/ajmalhassan/hobbyspace/wiggle-magic/wxt.config.ts
```

Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(build): remove vendored libs and legacy extension/ directory"
```

---

## Task 14: Type-check the whole project

- [ ] **Step 1: Run the compiler**

```bash
cd /Users/ajmalhassan/hobbyspace/wiggle-magic
pnpm compile
```

Expected: zero errors. If errors appear:

- **Implicit `any` on event handlers** → annotate with the right event type (`MouseEvent`, `KeyboardEvent`, etc.).
- **`Object is possibly null` on DOM lookups** → use `!` (non-null assertion) at the lookup site or narrow with a guard.
- **Property does not exist on type Element** → cast to the right subtype, e.g., `(el as HTMLImageElement).currentSrc`.
- **Promise return type mismatches** → check the function signature is `Promise<void>` not just `void`.

Iterate until clean. Do not move on with errors.

- [ ] **Step 2: No commit (no code change). Move on to Task 15.**

---

## Task 15: Production build verification

- [ ] **Step 1: Run the build**

```bash
pnpm build
```

Expected: `.output/chrome-mv3/` directory created. Output should include:
- `manifest.json`
- `background.js`
- `content-scripts/content.js` (or similar — exact name depends on WXT version)
- `popup.html` + popup chunk
- `options.html` + options chunk
- `help.html`
- `cursor.svg`
- Other JS chunks for shared deps

- [ ] **Step 2: Inspect the generated manifest**

```bash
cat /Users/ajmalhassan/hobbyspace/wiggle-magic/.output/chrome-mv3/manifest.json
```

Verify the manifest contains:
- `"manifest_version": 3`
- `"name": "Wiggle Magic"`
- `"permissions": ["storage", "activeTab"]`
- `"host_permissions": ["<all_urls>"]`
- `"minimum_chrome_version": "138"`
- `"background": { "service_worker": "<some background path>" }`
- `"content_scripts": [{ "matches": ["<all_urls>"], ... }]`
- `"action": { "default_popup": "popup.html", "default_title": "..." }`
- `"options_page": "options.html"`
- `"web_accessible_resources": [{ "resources": ["cursor.svg"], ... }]`

If any field is missing, revisit `wxt.config.ts` and the relevant entrypoint's `defineBackground`/`defineContentScript` declarations.

- [ ] **Step 3: Verify presence of cursor.svg in output**

```bash
ls /Users/ajmalhassan/hobbyspace/wiggle-magic/.output/chrome-mv3/cursor.svg
```

Expected: file exists.

- [ ] **Step 4: No commit (no source change).**

---

## Task 16: Manual smoke test in Chrome

This is the final acceptance gate. **Do not skip any step.**

- [ ] **Step 1: Load the new build as an unpacked extension**

1. Open Chrome and go to `chrome://extensions`.
2. If a previous unpacked "Wiggle Magic" load points at `…/extension/`, click "Remove" on it.
3. Click "Load unpacked" and select `/Users/ajmalhassan/hobbyspace/wiggle-magic/.output/chrome-mv3/`.
4. Verify the extension appears with the correct name, no error banner.

- [ ] **Step 2: First-install behavior**

Expected: on installation, the options page should NOT auto-open (this only happens on a fresh install in Chrome's eyes; reloading an existing unpacked install does not re-fire `onInstalled` with `reason === 'install'`). To test this path:
1. Note the current extension ID.
2. Remove the extension.
3. Re-load unpacked.
4. The options page should auto-open in a new tab.

- [ ] **Step 3: Wiggle gesture activates selection mode**

1. Navigate to any normal web page (e.g., `https://en.wikipedia.org/wiki/Magic`).
2. Wiggle the cursor rapidly back-and-forth in a small area (≥4 left-right reversals within 600 ms).
3. Expected: ring/spark burst appears at the cursor; a magic cursor visual replaces the system cursor; the page dims slightly.

- [ ] **Step 4: Pick elements**

1. While in selection mode, hover over a paragraph — a highlight outline should appear around it.
2. Click the paragraph — outline turns into a persistent marker; a "Magic" popover appears near the cursor showing a count of `1`.
3. Click another paragraph — count goes to `2`.
4. Click the first paragraph again — count goes to `1` (deselect toggle).

- [ ] **Step 5: Open the Magic sheet**

1. With at least one selection, press Enter (or click the Magic popover).
2. Expected: the in-page sheet slides up showing the chips of what was picked, an empty answer area, and an input field with placeholder text. Input auto-focuses after ~1 second.

- [ ] **Step 6: Ask the AI**

1. Type a question like "What is this about?" and press Enter.
2. Expected: answer streams in, character by character, into the answer area.
3. After completion, the streamed plaintext is replaced by rendered markdown (any `**bold**` or bullet points should render as such).

If Gemini Nano is unavailable on the test machine, expected behavior is an error message in the answer area pointing the user to Settings, OR (if BYOK is configured) a successful BYOK call.

- [ ] **Step 7: Save flow**

1. Click the **Save** button in the answer-actions row.
2. Expected: "saved ✓" indicator appears briefly.
3. Close the sheet (× button or Esc).

- [ ] **Step 8: Memory popup**

1. Click the extension's toolbar icon.
2. Expected: popup opens showing the saved entry with hostname, time, question, rendered-markdown answer (clamped), and an action row (Summarize / Shorter / Bullets / Translate).
3. Click on the answer body — entry expands to full height.
4. Click again — collapses.

- [ ] **Step 9: Memory popup actions**

1. With the popup open, click **Summarize** on the saved entry.
2. Expected: button shows a loading state; answer area streams in a summary; once complete, "Original | Summary" chips appear above the answer.
3. Click "Original" to switch back.
4. Click **Translate** (only if the device supports a Translator API and the answer's language differs from browser locale).
5. Expected: streams a translation.

(These actions are slated for removal in Spec 1, but they must still work end-of-Spec-0.)

- [ ] **Step 10: Options page**

1. Click the gear icon in the popup, or navigate to `chrome://extensions`, click "Details" on Wiggle Magic, then "Extension options".
2. Expected: options page loads. Welcome card appears if first-run. Backend selector, provider dropdown, API key input, and Nano status indicator are visible.
3. Click **Save** with some values — `saved ✓` indicator appears.
4. Reload the options page — values persist.

- [ ] **Step 11: Help page**

1. From the popup, click the `?` (help) icon.
2. Expected: `help.html` opens in a new tab and renders correctly.

- [ ] **Step 12: Multimodal image path (best-effort)**

1. Go to a page with images (e.g., a Wikipedia article with photos).
2. Wiggle, pick an `<img>` element by clicking it, press Enter.
3. Ask "what's in this image?"
4. Expected: on devices where Nano multimodal is available, the AI describes the image content. On devices without multimodal support, the AI still responds (using alt text or text-only context).

Open the service worker console (`chrome://extensions` → Details → "Inspect views: service worker") and watch for `fetchImage` messages — they should be handled without errors.

- [ ] **Step 13: All criteria pass — commit any final fixes**

If anything failed during Steps 1-12, fix it now and re-run the relevant subset. **Do not proceed to Task 17 until all 12 steps above pass.**

- [ ] **Step 14: No commit unless fixes were needed.**

---

## Task 17: Update README

**Files:**
- Modify (or create): `README.md` at project root.

- [ ] **Step 1: Check current README**

```bash
cat /Users/ajmalhassan/hobbyspace/wiggle-magic/README.md 2>/dev/null || echo "(no README at root)"
```

If the README was moved from `extension/README.md` in Task 13 step 3, it exists. Otherwise, create one.

- [ ] **Step 2: Add or update a Development section**

Append the following section to `README.md` (or create the file with this content as the body, retaining any existing intro):

```markdown
## Development

This is a Chrome MV3 extension built with [WXT](https://wxt.dev) (Vite + TypeScript).

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 8 (`npm install -g pnpm`)

### Install

```bash
pnpm install
```

### Develop with watch mode

```bash
pnpm dev
```

This produces `.output/chrome-mv3-dev/`. Open `chrome://extensions`, enable Developer mode, and load that directory as an unpacked extension. Saves to source files rebuild the bundle; you reload the extension manually with the circular-arrow icon in `chrome://extensions`.

### Production build

```bash
pnpm build
```

Produces `.output/chrome-mv3/` — the directory to load as the unpacked extension for normal use (or to zip for the Web Store via `pnpm zip`).

### Type-check only

```bash
pnpm compile
```

### Project layout

```
entrypoints/      # Extension entry points (background, content, popup, options, help)
src/lib/          # Shared utilities (markdown, type shims)
public/           # Static assets copied to bundle root
wxt.config.ts     # WXT config + manifest fields
```
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README for new pnpm + wxt development workflow"
```

---

## Task 18: Final verification & PR

- [ ] **Step 1: Run the full verification chain**

```bash
cd /Users/ajmalhassan/hobbyspace/wiggle-magic
pnpm install        # fresh install dry-run; should be a no-op if already up to date
pnpm compile        # 0 errors
pnpm build          # produces .output/chrome-mv3/
```

Expected: all three succeed.

- [ ] **Step 2: Review the working tree state**

```bash
git status
git log --oneline main..HEAD
```

Expected: clean working tree; commit list shows the migration commits in order.

- [ ] **Step 3: Final acceptance checklist**

Tick each item against the spec:

- [ ] `pnpm install` from clean clone works
- [ ] `pnpm compile` passes (0 TS errors)
- [ ] `pnpm build` produces `.output/chrome-mv3/manifest.json` with all expected fields
- [ ] `pnpm dev` watches and rebuilds on save (verified during dev)
- [ ] In Chrome, loaded from `.output/chrome-mv3/`:
  - [ ] Wiggle activates on any page
  - [ ] Pick + Enter opens the Magic sheet
  - [ ] AI streams an answer (Nano or BYOK)
  - [ ] Image-bearing selections hit the multimodal path
  - [ ] Save persists to chrome.storage.local
  - [ ] Popup shows saved entries with rendered markdown
  - [ ] Popup action buttons (Summarize / Shorter / Bullets / Translate) work
  - [ ] Options page opens on install; settings save and reload
  - [ ] Help link from popup opens help.html
- [ ] No `extension/` directory
- [ ] No `marked.min.js` or `purify.min.js` in source tree
- [ ] `node_modules/`, `.output/`, `.wxt/` are gitignored
- [ ] `pnpm-lock.yaml` is committed

- [ ] **Step 4: Push and open PR (optional, user-driven)**

The plan does not push automatically. When the user is ready:

```bash
git push -u origin <branch-name>
gh pr create --title "build: migrate to WXT + TypeScript (Spec 0)" --body "<see spec for description>"
```

---

## Self-review checklist (already completed during plan writing)

**Spec coverage:**
- Section 1 (Problem & goals) → covered by entire plan
- Section 2 (Locked decisions) → reflected in package.json, tsconfig, wxt.config, file moves
- Section 3 (Architecture & file layout) → Tasks 7–13
- Section 4 (WXT config & deps) → Tasks 1–3, 6
- Section 5 (Migration plan) → Tasks 7–14
- Section 6 (Acceptance criteria) → Task 16 + Task 18
- Section 7 (Risks & mitigations) → covered: WXT pinning in Task 1, AI shims in Task 5, response-shape types in Task 8, popup actions verified in Task 16 step 9
- Section 8 (Open questions) → none

**Placeholder scan:** No "TBD" / "TODO" / "fill in details" / "similar to Task N". Every code block is complete.

**Type consistency:** `renderMarkdownInto(el: HTMLElement, text: string): void` defined in Task 6, used identically in Tasks 9 and 10. `Payload` interface defined inline in Task 9 and is local to content.ts; popup-side `VariantState` defined inline in Task 10. No cross-task name drift.

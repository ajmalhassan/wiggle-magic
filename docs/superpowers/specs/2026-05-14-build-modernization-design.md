# Spec 0 — Build modernization (Vite + TypeScript via WXT)

**Date:** 2026-05-14
**Author:** Ajmal Hassan + Claude (brainstorming session)
**Status:** Draft — pending user review before plan
**Predecessor:** none
**Successor:** Spec 1 — Selection UX v2

---

## 1. Problem & goals

The current codebase is hand-written vanilla JavaScript in a flat `extension/` directory, loaded directly into Chrome as an unpacked MV3 extension. Vendored copies of `marked.min.js` and `purify.min.js` live in `extension/lib/`. There is no build step, no type-checking, and no module system — each file is an IIFE or a `<script>`-loaded global.

This shape blocks the next planned work (Spec 1 — Selection UX v2) for three reasons:

1. **Reasoning quality.** Adding hover-preview + smart-escalate + a persistent chip bar to a single 800-line IIFE will make the file unmaintainable. Spec 1 wants a "module-within-file refactor" — but applying that refactor on top of plain JS without types leaves cross-module call sites unchecked.
2. **Industry standards.** Personal extensions started fresh in 2026 are bundled with a build tool (Vite or similar) and authored in TypeScript. Continuing to ship hand-rolled JS is a long-term tax: every contributor (including future-self) will side-eye the structure.
3. **Library hygiene.** Vendored minified copies of `marked` and `dompurify` make versions invisible and updates manual. They should be npm dependencies.

**Goal of this spec:** modernize the build and language with **zero behavior change**. Every flow that works today must work identically after migration. Spec 1 is the next change set; it depends on Spec 0 landing first.

**Non-goals (deferred to follow-up specs):**

- Any user-facing behavior change.
- Internal refactor of `content.ts` (module-within-file split is Spec 1's first move).
- Stripping action buttons from the popup (Spec 1, the Selection UX overhaul).
- Adding tests, lint, or formatter tooling.
- Cross-browser support (Firefox/Safari) — WXT enables this for free, but we don't ship it in Spec 0.

---

## 2. Locked decisions

| Topic | Decision | Reasoning |
|---|---|---|
| Build tool & framework | **WXT** (wxt.dev) | Modern, Vite-based, convention-driven, actively developed in 2026; best long-term shape for a small extension built to last. Picked over `vite-plugin-web-extension` for batteries-included types and free cross-browser story. Plasmo skipped (Parcel-based, slowing development). |
| Package manager | **pnpm** | Fast, disk-efficient, strict about phantom deps. Standard for modern extension projects. |
| Language | **TypeScript** | Strict mode (`"strict": true` defaults), plus `noImplicitOverride` and `isolatedModules`. Extra-strict flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) skipped — overkill for a small extension. |
| Migration cadence | **All-at-once in one PR** | Codebase is small (six source files). Half-typed forever is a real risk on personal projects; one mental switch ships cleaner. |
| Markdown libraries | **`marked` + `dompurify` from npm**, ES-imported | Replaces vendored minified copies. Real types, real version tracking, automatic dedupe between popup and content-script bundles. |
| Behavior | **No change** in Spec 0 | The point of the spec is build modernization. Behavior changes belong to Spec 1+. |

---

## 3. Architecture & file layout

### 3.1 Final directory shape

```
wiggle-magic/
├── .gitignore                  # adds .output/ .wxt/ node_modules/
├── .wxt/                       # WXT internal cache (gitignored)
├── .output/                    # build artifacts — load THIS as unpacked (gitignored)
├── node_modules/               # (gitignored)
├── package.json
├── pnpm-lock.yaml              # committed
├── tsconfig.json               # extends WXT's preset
├── wxt.config.ts               # WXT config + manifest fields
│
├── entrypoints/
│   ├── background.ts           # was extension/background.js
│   ├── content.ts              # was extension/content.js (still big IIFE; Spec 1 breaks it up)
│   ├── content.css             # was extension/content.css
│   ├── popup/
│   │   ├── index.html          # was extension/popup.html
│   │   ├── main.ts             # was extension/popup.js
│   │   └── popup.css           # was extension/popup.css
│   ├── options/
│   │   ├── index.html          # was extension/options.html
│   │   └── main.ts             # was extension/options.js
│   └── help/
│       └── index.html          # was extension/help.html (no script)
│
├── src/
│   └── lib/
│       └── markdown.ts         # was lib/render.js — uses npm marked + dompurify
│
├── public/
│   └── cursor.svg              # was extension/cursor.svg — served at /cursor.svg
│
└── docs/superpowers/specs/
    └── 2026-05-14-build-modernization-design.md   # this spec
```

The `extension/` directory is deleted after migration. So are `extension/lib/marked.min.js`, `extension/lib/purify.min.js`, and `extension/manifest.json`.

### 3.2 What changes structurally

- **Manifest** is no longer hand-written. WXT generates `dist/manifest.json` from `wxt.config.ts` plus the contents of `entrypoints/`. Fields that were in `manifest.json` move into `wxt.config.ts`.
- **The thing you load as unpacked** changes from `extension/` to `.output/chrome-mv3/` (or `.output/chrome-mv3-dev/` in dev mode). README needs a note.
- **Markdown rendering** centralizes in `src/lib/markdown.ts`. Both popup and content-script entry points import from it; WXT bundles the dep into each entry independently.
- **Static assets** (`cursor.svg`) live in `public/`, accessible at runtime via `chrome.runtime.getURL('cursor.svg')` — unchanged behavior.

### 3.3 What deliberately doesn't change

- `content.ts` keeps the same single big IIFE body. Spec 1 will split it into named modules (`wiggle`, `overlay`, `picker`, `sheet`, `ai`, `settings`) within the same file.
- Every user-facing flow continues to work identically: wiggle activation, element pick, sheet Q&A, save, popup memory, options, help link, multimodal image input, BYOK fallback, all four popup action buttons (Summarize / Shorter / Bullets / Translate — these get stripped in Spec 1, but must still work at end-of-Spec-0).

---

## 4. WXT configuration & dependencies

### 4.1 `wxt.config.ts`

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Wiggle Magic',
    description: 'Wiggle your cursor on any page to ask AI about what you see. Powered by Gemini Nano (on-device) with optional BYOK fallback.',
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

Version is read from `package.json` — bump in one place.

WXT auto-derives the following manifest fields from `entrypoints/`:

- `background.service_worker` ← `entrypoints/background.ts`
- `content_scripts[]` ← `entrypoints/content.ts` + the `matches` / `runAt` / `cssInjectionMode` declared in its `defineContentScript({...})` call
- `action.default_popup` ← `entrypoints/popup/index.html`
- `options_page` ← `entrypoints/options/index.html`
- An "unlisted page" for help ← `entrypoints/help/index.html`. Reachable via `chrome.runtime.getURL('help.html')` and via the existing `<a href="help.html">` in popup.html — link continues to work because WXT serves it at the extension root.

### 4.2 `package.json`

```jsonc
{
  "name": "wiggle-magic",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "compile": "tsc --noEmit"
  },
  "dependencies": {
    "marked": "^14",
    "dompurify": "^3"
  },
  "devDependencies": {
    "wxt": "^0.20",
    "typescript": "^5.6",
    "@types/dompurify": "^3"
  }
}
```

WXT bundles `@types/chrome` typings under its own preset, so we don't add it directly.

### 4.3 `tsconfig.json`

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

### 4.4 `.gitignore` additions

```
node_modules/
.output/
.wxt/
*.log
```

(The existing `.superpowers/` line from the brainstorming companion stays.)

### 4.5 Markdown helper (`src/lib/markdown.ts`)

```ts
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function renderMarkdownInto(el: HTMLElement, text: string): void {
  const html = marked.parse(text, { async: false }) as string;
  el.innerHTML = DOMPurify.sanitize(html);
}
```

Both `entrypoints/content.ts` and `entrypoints/popup/main.ts` import this:

```ts
import { renderMarkdownInto } from '@/src/lib/markdown';
```

(`@/` is WXT's default path alias for the project root.)

---

## 5. Migration plan

A single PR performs all of the following, in order.

### 5.1 Bootstrap

```bash
cd /Users/ajmalhassan/hobbyspace/wiggle-magic
pnpm init
pnpm add -D wxt typescript
pnpm add marked dompurify
pnpm add -D @types/dompurify
pnpm wxt prepare           # generates .wxt/ types + tsconfig preset
```

Write `wxt.config.ts`, `tsconfig.json`, and update `package.json` scripts as in Section 4.

### 5.2 Move and rename files

| From | To | Notes |
|---|---|---|
| `extension/background.js` | `entrypoints/background.ts` | Wrap body in `defineBackground(() => { ... })` |
| `extension/content.js` | `entrypoints/content.ts` | Wrap IIFE body in `defineContentScript({ matches: ['<all_urls>'], runAt: 'document_idle', cssInjectionMode: 'manifest', main() { ... } })`. Internal structure unchanged. |
| `extension/content.css` | `entrypoints/content.css` | Imported once via `import './content.css'` from `content.ts` |
| `extension/popup.html` | `entrypoints/popup/index.html` | Remove `<script src="lib/marked.min.js">` / `purify.min.js` / `render.js` tags; replace with `<script type="module" src="./main.ts"></script>` |
| `extension/popup.js` | `entrypoints/popup/main.ts` | Add `import { renderMarkdownInto } from '@/src/lib/markdown'` at top |
| `extension/popup.css` | `entrypoints/popup/popup.css` | Imported from `main.ts` |
| `extension/options.html` | `entrypoints/options/index.html` | |
| `extension/options.js` | `entrypoints/options/main.ts` | |
| `extension/help.html` | `entrypoints/help/index.html` | Unlisted page; reachable via `chrome.runtime.getURL('help.html')`. Popup `<a href="help.html">` keeps working. |
| `extension/cursor.svg` | `public/cursor.svg` | Stays referenceable via `chrome.runtime.getURL('cursor.svg')` |
| `extension/lib/render.js` | `src/lib/markdown.ts` | Port to TS as a named export; uses npm `marked` + `dompurify` |
| `extension/lib/marked.min.js` | **deleted** | Replaced by `import { marked } from 'marked'` |
| `extension/lib/purify.min.js` | **deleted** | Replaced by `import DOMPurify from 'dompurify'` |
| `extension/manifest.json` | **deleted** | Generated by WXT from `wxt.config.ts` + entry points |

After this step, `extension/` is empty — delete the directory.

### 5.3 Add minimal types

For each renamed `.ts` file:

- Type function signatures (return types and parameter types where helpful).
- Type the small state objects (e.g., `state: 'idle' | 'selecting' | 'sheet'`).
- Use the ambient `chrome` global from `@types/chrome` (no import needed).
- For experimental Chrome AI APIs (`LanguageModel`, `Summarizer`, `Rewriter`, `Translator`, `LanguageDetector`) that aren't in `@types/chrome`, declare local interfaces or a `declare global` shim in `src/lib/chrome-ai.d.ts`.
- `any` and `// @ts-expect-error` are acceptable in tight spots for this PR. Tighten in follow-ups.

Goal: `pnpm compile` passes with zero errors. The bar is "no `any` flood, but no over-typing either."

### 5.4 Verify locally

```bash
pnpm compile     # type-check passes, zero errors
pnpm build       # produces .output/chrome-mv3/
```

In `chrome://extensions`, **remove the existing unpacked load of `extension/`** and load `.output/chrome-mv3/` instead.

### 5.5 Update README

Add a "Development" section noting the new commands (`pnpm dev`, `pnpm build`) and the new unpacked load path (`.output/chrome-mv3/`).

### 5.6 Commit

One commit per logical step is fine; the whole migration ships as one PR. Suggested commit shape:

1. `chore(build): bootstrap wxt + pnpm + typescript`
2. `chore(build): move sources into entrypoints/ structure`
3. `chore(build): replace vendored marked + dompurify with npm imports`
4. `chore(build): add minimal types, remove old extension/ dir`
5. `docs: update README for new dev/build workflow`

---

## 6. Acceptance criteria

The migration is done when **all** of the following hold:

- [ ] `pnpm install` from a clean clone works without manual steps.
- [ ] `pnpm compile` passes with zero TS errors.
- [ ] `pnpm build` produces `.output/chrome-mv3/manifest.json` matching the old manifest shape (entrypoints, permissions, web_accessible_resources, options_page, action).
- [ ] `pnpm dev` watches and rebuilds on save (manual extension reload is expected; no HMR required).
- [ ] In Chrome, loaded from `.output/chrome-mv3/`:
  - Wiggle gesture activates on any page (state goes idle → selecting).
  - Picking elements + Enter opens the Magic sheet.
  - AI streams an answer — Nano if available, BYOK if configured.
  - Image-bearing selections still hit the multimodal path (image blobs land in the prompt).
  - Save persists to `chrome.storage.local`.
  - Popup shows saved entries with rendered markdown; expand/collapse, copy, delete all work.
  - Popup action buttons (Summarize / Shorter / Bullets / Translate) still work end-to-end. (These get stripped in Spec 1, but must function at the end of Spec 0.)
  - Options page opens on install; settings save and reload.
  - Help link from popup opens `help.html`.
- [ ] No `extension/` directory remains.
- [ ] No `marked.min.js` or `purify.min.js` in source tree.
- [ ] `node_modules/`, `.output/`, `.wxt/` are gitignored.
- [ ] `pnpm-lock.yaml` is committed.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| WXT version drift (still under active development in 2026) | Pin `wxt`, `typescript`, `marked`, `dompurify` to specific majors in `package.json`. |
| Experimental Chrome AI APIs (`LanguageModel`, `Summarizer`, etc.) have no official types | Declare local shims in `src/lib/chrome-ai.d.ts`. Document as "ambient declarations matching the live API at time of writing." |
| Image-blob path in `content.ts` uses `FileReader` + `chrome.runtime.sendMessage` data-URL shuttle — fragile types across the boundary | Use a discriminated union for the SW response shape; type both ends. |
| Popup action buttons broken mid-migration due to library import path changes | Acceptance criteria explicitly include "popup action buttons still work end-to-end". Verify in manual test pass before merging. |
| Existing chrome.storage data must remain readable after migration | Storage keys and shapes are unchanged (`wm_memory`, `wm_settings`). No schema migration needed. |

---

## 8. Open questions

None. All foundational decisions are locked in Section 2.

---

## 9. Successor work

Immediately after Spec 0 lands, **Spec 1 — Selection UX v2** begins. Spec 1's first move is the module-within-file refactor of `content.ts` (Approach 2 from the Spec 1 brainstorm), followed by the new selection UX (hover preview, smart-escalate, top-pinned chip bar, refinement-in-sheet, mark-stale rerun). Spec 0 is a precondition; Spec 1's design assumes a typed, bundled foundation.

# Selection UX v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the in-page selection experience and the toolbar popup so the extension's value prop — *"pick exactly the parts that matter, get one cohesive answer"* — is front and center, while moving all transforms out of the popup.

**Architecture:** Reorganize `entrypoints/content/index.ts` internally into named module-style sections (`wiggle`, `overlay`, `picker`, `sheet`, plus existing `ai` + `settings` code) within the existing `defineContentScript({ main() { … } })` IIFE. **No new files.** Replace the cursor-following popover with a top-pinned chip bar; redesign the sheet (header pill, in-sheet chip bar with `×`, Summarize/Compare/Ask hero row, stale + Rerun banner); strip the popup of action buttons and variant switching.

**Tech Stack:** WXT, TypeScript (strict mode), Chrome AI Prompt API + Summarizer API (Nano on-device), BYOK fallback (already wired). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-14-selection-ux-v2-design.md`

**Note on TDD:** This codebase has no automated test harness — UI-heavy content scripts and a popup are hard to unit-test cheaply. The verification cycle for every task is: `pnpm compile` (type-check) → `pnpm build` (bundle) → manual reproduction against the per-task acceptance criteria listed in each task. Each task ends with a commit.

---

## Pre-flight

- [ ] **Pre-flight Step 1: Confirm clean working tree**

```bash
cd /Users/ajmalhassan/hobbyspace/wiggle-magic
git status
```

Expected: `On branch main`, working tree clean (or only `.superpowers/` brainstorming files, which are gitignored).

- [ ] **Pre-flight Step 2: Confirm dev build works**

```bash
pnpm install
pnpm compile
pnpm build
```

Expected: `pnpm compile` exits 0; `pnpm build` produces `.output/chrome-mv3/` with no errors.

- [ ] **Pre-flight Step 3: Load the extension in Chrome and smoke-test the current behavior**

In `chrome://extensions` (Developer mode on), click **Load unpacked** and select `.output/chrome-mv3/`. On any text-heavy page, wiggle the cursor → confirm:
- cursor goes glowing, aurora glow at edges
- clicking a paragraph adds a pink marker
- `Magic` popover appears near cursor with count
- pressing Enter opens the bottom sheet, typing a question + Enter streams an answer
- `Save` stores the entry; the toolbar popup lists it

This baseline is what the new UX replaces. Note any quirks you see so you don't blame them on Spec 1 later.

---

## Task 1: Add `action` field to `MemoryEntry`

**Files:**
- Modify: `src/lib/types.ts`

The save flow needs to record which hero action produced an answer (`'summary' | 'compare' | 'ask'`). Existing entries don't have this field; reading code must tolerate its absence.

- [ ] **Step 1: Update the `MemoryEntry` shape**

Edit `src/lib/types.ts`. Replace the `MemoryEntry` interface with:

```ts
export type MemoryAction = 'summary' | 'compare' | 'ask';

export interface MemoryEntry {
  id: string;
  ts: number;
  url: string;
  title?: string;
  hostname: string;
  question: string;
  answer: string;
  selections?: SavedSelection[];
  /** Which hero action produced this answer. Optional for back-compat with pre-Spec-1 entries. */
  action?: MemoryAction;
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm compile
```

Expected: exit 0. (No callers reference `action` yet; the field is optional.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add optional MemoryEntry.action for Spec 1 hero attribution"
```

---

## Task 2: Strip popup of action buttons + variant switcher (US-5)

The popup becomes browse-only. All transforms move to the in-page sheet (added in later tasks).

**Files:**
- Modify: `entrypoints/popup/index.html`
- Modify: `entrypoints/popup/main.ts`
- Modify: `entrypoints/popup/popup.css`

- [ ] **Step 1: Strip the `#row-tpl` template in `entrypoints/popup/index.html`**

Inside `<template id="row-tpl">`, remove the `<div class="variants" hidden></div>` line **and** the entire `<div class="actions-row">…</div>` block (the four `<button class="action">` plus the `<span class="action-status">`). The template should now read:

```html
<template id="row-tpl">
  <article class="row">
    <header class="row-head">
      <div class="meta">
        <span class="host"></span>
        <span class="when"></span>
      </div>
      <button class="icon del" title="Delete" aria-label="Delete entry">
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path fill="currentColor" d="M6 2h4l1 1h3v2H2V3h3l1-1zm-2 4h8l-1 9H5L4 6z"/>
        </svg>
      </button>
    </header>
    <div class="q"></div>
    <div class="a"></div>
    <details class="src">
      <summary><span class="src-count"></span> selected</summary>
      <ul class="src-list"></ul>
    </details>
  </article>
</template>
```

- [ ] **Step 2: Rewrite `entrypoints/popup/main.ts` to drop transforms**

Replace the entire file with:

```ts
import './popup.css';
import { renderMarkdownInto } from '@/src/lib/markdown';
import type { MemoryEntry } from '@/src/lib/types';

const listEl    = document.getElementById('list')!;
const emptyEl   = document.getElementById('empty')!;
const subEl     = document.getElementById('sub')!;
const clearBtn  = document.getElementById('clear') as HTMLButtonElement;
const exportBtn = document.getElementById('export') as HTMLButtonElement;
const settings  = document.getElementById('settings')!;
const rowTpl    = document.getElementById('row-tpl') as HTMLTemplateElement;

settings.addEventListener('click', () => chrome.runtime.openOptionsPage());

async function render(): Promise<void> {
  const got = await chrome.storage.local.get('wm_memory') as { wm_memory?: MemoryEntry[] };
  const wm_memory = got.wm_memory ?? [];
  listEl.innerHTML = '';
  for (const entry of wm_memory) listEl.appendChild(renderRow(entry));
  refreshChrome();
}

function refreshChrome(): void {
  const n = listEl.children.length;
  const empty = n === 0;
  emptyEl.hidden = !empty;
  clearBtn.hidden = empty;
  exportBtn.hidden = empty;
  subEl.textContent = empty ? 'memory' : `${n} saved`;
}

function renderRow(entry: MemoryEntry): DocumentFragment {
  const frag = rowTpl.content.cloneNode(true) as DocumentFragment;
  const row = frag.querySelector('.row') as HTMLElement;
  row.dataset.entryId = entry.id;
  (row.querySelector('.host') as HTMLElement).textContent = entry.hostname || '';
  (row.querySelector('.when') as HTMLElement).textContent = relTime(entry.ts);
  (row.querySelector('.q') as HTMLElement).textContent = entry.question || '(no question)';
  const ans = row.querySelector('.a') as HTMLElement;
  renderMarkdownInto(ans, entry.answer || '');
  ans.classList.add('clamp');

  const srcCountEl = row.querySelector('.src-count') as HTMLElement;
  const srcList    = row.querySelector('.src-list') as HTMLElement;
  const sels = entry.selections || [];
  srcCountEl.textContent = String(sels.length);
  for (const s of sels) {
    const li = document.createElement('li');
    const label = (s.text || s.link?.href || s.image?.alt || `<${s.tag}>`).slice(0, 80);
    li.textContent = label;
    li.title = label;
    srcList.appendChild(li);
  }

  ans.addEventListener('click', (e: MouseEvent) => {
    if ((e.target as Element).closest('a')) return;
    row.classList.toggle('expanded');
  });

  (row.querySelector('.del') as HTMLButtonElement).addEventListener('click', async (e: MouseEvent) => {
    e.stopPropagation();
    await deleteEntry(entry.id);
    row.remove();
    refreshChrome();
  });

  return frag;
}

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d}d`;
  return new Date(ts).toLocaleDateString();
}

async function deleteEntry(id: string): Promise<void> {
  const got = await chrome.storage.local.get('wm_memory') as { wm_memory?: MemoryEntry[] };
  const wm_memory = got.wm_memory ?? [];
  const next = wm_memory.filter(e => e.id !== id);
  await chrome.storage.local.set({ wm_memory: next });
}

clearBtn.addEventListener('click', async () => {
  if (!confirm('Clear all saved answers? This cannot be undone.')) return;
  await chrome.storage.local.set({ wm_memory: [] });
  render();
});

exportBtn.addEventListener('click', async () => {
  const got = await chrome.storage.local.get('wm_memory') as { wm_memory?: MemoryEntry[] };
  const wm_memory = got.wm_memory ?? [];
  const md = toMarkdown(wm_memory);
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wiggle-magic-export-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function toMarkdown(entries: MemoryEntry[]): string {
  const lines = ['# Wiggle Magic — saved answers', ''];
  for (const e of entries) {
    lines.push(`## ${e.question || '(no question)'}`);
    lines.push(`*${new Date(e.ts).toLocaleString()} · [${e.hostname}](${e.url})*`);
    lines.push('');
    lines.push(e.answer || '');
    lines.push('');
    if (e.selections?.length) {
      lines.push('**Sources:**');
      for (const s of e.selections) {
        const label = (s.text || s.link?.href || s.image?.alt || `<${s.tag}>`).slice(0, 200);
        lines.push(`- ${label}`);
      }
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

render();
```

This drops: `Variant`/`Action` types, `variantsById` cache, `runAction`, `showVariant`, `updateChips`, all four adapters (`adaptSummarizer`, `adaptRewriter`, `adaptTranslator`, `adaptPrompt`), `openTransform`, `withFinalize`, `detectLang`, `browserLang`, `LANG_NAMES`. The popup keeps only render + delete + clear + export.

- [ ] **Step 3: Remove now-dead CSS from `entrypoints/popup/popup.css`**

Delete the rules for `.row .variants`, `.row .variants .chip`, `.row .variants .chip:hover`, `.row .variants .chip.active`, `.row .actions-row`, `.row .actions-row .action`, `.row .actions-row .action:hover:not(:disabled)`, `.row .actions-row .action:disabled`, `.row .actions-row .action.loading`, `.row .actions-row .action-status`, `.row .actions-row .action-status.err`. Use `grep -n` to locate them first if line numbers shifted:

```bash
grep -n 'variants\|actions-row' entrypoints/popup/popup.css
```

- [ ] **Step 4: Type-check and build**

```bash
pnpm compile && pnpm build
```

Expected: both exit 0.

- [ ] **Step 5: Manual smoke test**

Reload the extension in `chrome://extensions`. Open the toolbar popup:
- If you have pre-Spec-1 saved entries, they render their `answer` as before (no four-button row, no variant chips, no console errors).
- Delete and export still work.
- Empty-state ("Nothing saved yet") still appears when memory is cleared.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/popup/index.html entrypoints/popup/main.ts entrypoints/popup/popup.css
git commit -m "feat(popup): strip transforms; popup is now browse-only

Variant switching and the Summarize/Shorter/Bullets/Translate
actions are moving into the in-page Magic sheet (Spec 1, US-5)."
```

---

## Task 3: Refactor content script into module-style sections (no behavior change)

This task is structure-only — the same overlay, the same wiggle, the same sheet behavior, just organized into named modules so subsequent tasks can extend each module independently.

**Files:**
- Modify: `entrypoints/content/index.ts`

**Target shape (inside `main()`):**

```ts
// shared scaffolding (refs, state primitives)
type Mode = 'idle' | 'activating' | 'selecting' | 'sheet';
interface Pick { id: string; el: Element; marker: HTMLDivElement; payload: Payload; label: string; }

// modules
const wiggle  = { onMove(e) { … } };                                  // pure detection
const overlay = { paintCursor, paintHighlight, spawnBurst,            // visual paint only
                  applyRectBox, isOverlayHit, repaintMarkers };
const picker  = { mode: 'idle' as Mode, picks: [] as Pick[],          // selection state
                  activate, deactivate, commit,
                  add, remove, clear, togglePick,
                  getPayload, resolveTarget /* added in Task 4 */ };
const sheet   = { show, close, askAI, save, copy,                     // Magic UI
                  /* stale, rerun, hero actions added in later tasks */ };

// existing AI helpers (askAI, createNanoSession, buildPrompt, …)
// existing BYOK helpers (callByokStreaming, byokSpec, consumeSSE)
// existing settings loader

// bindings at the bottom — keep the same listener wiring, just call into modules
```

This is a mechanical refactor: move the existing functions into object literals, change `state` → `picker.mode`, `selections` → `picker.picks`, and update call sites. **Do not change any behavior.**

- [ ] **Step 1: Replace the body of `entrypoints/content/index.ts` `main()` with the restructured version**

The full file is large; do this in-place rather than rewriting from scratch. Use these mechanical transformations:

1. Above the overlay scaffold, define:
   ```ts
   type Mode = 'idle' | 'activating' | 'selecting' | 'sheet';
   interface Pick { id: string; el: Element; marker: HTMLDivElement; payload: Payload; label: string; }
   ```
2. Remove the existing `let state: 'idle' | … = 'idle';` and `const selections: { el; marker; payload }[] = [];` declarations.
3. Introduce the four module objects immediately after the element refs block:
   ```ts
   const wiggle  = { onMove: onPointerMove };
   const overlay = { paintCursor, paintHighlight, spawnBurst, applyRectBox, isOverlayHit, repaintMarkers };
   const picker  = {
     mode: 'idle' as Mode,
     picks: [] as Pick[],
     activate,
     deactivate,
     commit,
     togglePick,
     getPayload,
   };
   const sheet   = { show: showSheet, close: closeSheet, askAI: submitAsk, save: saveCurrentAnswer, copy: copyCurrentAnswer };
   ```
4. Inside every function that read or wrote `state`, change `state` → `picker.mode`.
5. Inside every function that read or wrote `selections`, change `selections` → `picker.picks`.
6. Where `selections.push({ el, marker, payload })` happened (inside `togglePick`), generate an id + label:
   ```ts
   picker.picks.push({
     id: crypto.randomUUID(),
     el, marker, payload,
     label: labelFor(payload),
   });
   ```
7. Update the `commit()` body to map over `picker.picks`: `const payloads = picker.picks.map(p => p.payload);`.
8. Update `closeSheet()` and `deactivate()` cleanup loops to iterate `picker.picks` (still calling `.marker.remove()` on each).
9. At the very bottom, update bindings to dispatch through the modules:
   ```ts
   document.addEventListener('mousemove', wiggle.onMove, { passive: true });
   document.addEventListener('click', pick, true);
   document.addEventListener('keydown', (e: KeyboardEvent) => {
     if (e.key === 'Escape') {
       if (picker.mode === 'sheet') sheet.close();
       else if (picker.mode !== 'idle') picker.deactivate();
     }
     if (e.key === 'Enter' && picker.mode === 'selecting' && picker.picks.length > 0) picker.commit();
   });
   popoverBtn.addEventListener('click', (e: MouseEvent) => {
     e.preventDefault();
     e.stopPropagation();
     picker.commit();
   });
   sheetClose.addEventListener('click', sheet.close);
   sheetSend.addEventListener('click', sheet.askAI);
   sheetInput.addEventListener('keydown', (e: KeyboardEvent) => {
     if (e.key === 'Enter') { e.preventDefault(); sheet.askAI(); }
   });
   saveBtn.addEventListener('click', sheet.save);
   copyBtn.addEventListener('click', sheet.copy);
   ```

- [ ] **Step 2: Type-check**

```bash
pnpm compile
```

Expected: exit 0. Fix any TypeScript errors that surface (most likely: a function still references the old `state` or `selections` identifier).

- [ ] **Step 3: Build and manual smoke test**

```bash
pnpm build
```

Reload the extension. On a text-heavy page:
- Wiggle → cursor glows, aurora at edges, custom magic cursor visible.
- Click two paragraphs → both get pink markers; cursor-following `Magic ⏎ N` pill shows count 2.
- Press Enter → bottom sheet morphs open with chips.
- Type a question + Enter → answer streams.
- `Save` works; popup lists the entry.
- `Esc` from sheet closes it; everything resets.

Behavior should be **identical** to pre-task baseline.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/content/index.ts
git commit -m "refactor(content): organize into wiggle/overlay/picker/sheet modules

No behavior change. Sets up the structure Spec 1 tasks 4-14 extend."
```

---

## Task 4: Smart-escalate `resolveTarget` + tag-label badge in hover preview

**Files:**
- Modify: `entrypoints/content/index.ts`
- Modify: `entrypoints/content/content.css`

The current `paintHighlight()` highlights the literal `elementFromPoint` result. Replace it with the resolved semantic ancestor and render a tag-label badge.

- [ ] **Step 1: Add the `SEMANTIC_TAGS` set and `resolveTarget` function to `picker`**

Inside `main()`, near the picker module declaration:

```ts
const SEMANTIC_TAGS = new Set([
  'p', 'li', 'blockquote',
  'article', 'section', 'figure', 'picture',
  'img', 'video', 'audio',
  'table', 'tr', 'th', 'td',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'button',
]);

function resolveTarget(el: Element): Element {
  let cur: Element | null = el;
  while (cur && cur !== document.body) {
    if (SEMANTIC_TAGS.has(cur.tagName.toLowerCase())) return cur;
    if (cur.parentElement && cur.parentElement.children.length > 30) return cur;
    cur = cur.parentElement;
  }
  return el;
}
```

Add `resolveTarget` to the `picker` module's property list.

- [ ] **Step 2: Add a tag-label badge element to the overlay HTML**

Inside the overlay innerHTML literal, immediately after the `<div id="wm-highlight"></div>` line, add:

```html
<div id="wm-tag" aria-hidden="true"></div>
```

Add a ref next to the existing `highlight` ref:

```ts
const tagBadge = root.querySelector<HTMLElement>('#wm-tag')!;
```

- [ ] **Step 3: Rewrite `paintHighlight()` to use `resolveTarget` and update the badge**

Replace the existing body of `paintHighlight()` with:

```ts
function paintHighlight(): void {
  const leaf = document.elementFromPoint(cursorX, cursorY);
  if (!leaf || isOverlayHit(leaf) || leaf === document.documentElement || leaf === document.body) {
    if (lastHighlightEl !== null) {
      highlight.style.opacity = '0';
      tagBadge.style.opacity = '0';
      lastHighlightEl = null;
    }
    return;
  }
  const resolved = picker.resolveTarget(leaf);
  if (resolved === lastHighlightEl) return;
  lastHighlightEl = resolved;

  const r = resolved.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) {
    highlight.style.opacity = '0';
    tagBadge.style.opacity = '0';
    return;
  }

  highlight.style.opacity = '1';
  applyRectBox(highlight, r);

  // If this element is already picked, show the filled style; otherwise dashed.
  const isPicked = picker.picks.some(p => p.el === resolved);
  highlight.classList.toggle('picked', isPicked);

  // Tag-label badge at top-left of the bbox.
  const tag = resolved.tagName.toLowerCase();
  tagBadge.textContent = `<${tag}>`;
  tagBadge.style.transform = `translate(${r.left}px, ${r.top - 22}px)`;
  tagBadge.style.opacity = '1';
}
```

- [ ] **Step 4: Update `pick()` to operate on the resolved target**

Replace the body of `pick()`:

```ts
function pick(e: MouseEvent): void {
  if (picker.mode !== 'selecting') return;
  const target = e.target as Element;
  if (target.closest && target.closest('#wm-popover')) return;
  e.preventDefault();
  e.stopPropagation();
  const leaf = document.elementFromPoint(e.clientX, e.clientY);
  if (!leaf || isOverlayHit(leaf)) return;
  const resolved = picker.resolveTarget(leaf);
  picker.togglePick(resolved);
}
```

- [ ] **Step 5: Add `.picked` and `#wm-tag` styles to `entrypoints/content/content.css`**

Append at the end of the highlight section (after the existing `#wm-highlight { … }` rule):

```css
#wm-highlight.picked {
  border-style: solid;
  background: rgba(255, 122, 217, 0.08);
  border-color: rgba(255, 122, 217, 0.95);
}

#wm-tag {
  position: fixed; top: 0; left: 0;
  pointer-events: none;
  font: 600 11px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
  color: #0b0d12;
  background: rgba(125, 249, 255, 0.95);
  padding: 3px 6px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 120ms ease, transform 90ms ease-out;
  z-index: 2147483644;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
```

Also change the default highlight from solid to dashed for the unpicked state. Inside the existing `#wm-highlight { … }` block, change:

```css
border: 1.5px solid rgba(125,249,255,0.9);
```

to:

```css
border: 1.5px dashed rgba(125,249,255,0.9);
```

- [ ] **Step 6: Type-check, build, manual test**

```bash
pnpm compile && pnpm build
```

Reload. On a Wikipedia article (good semantic markup):
- Wiggle, hover over a `<span>` inside a paragraph → dashed outline snaps to the whole `<p>`; badge reads `<p>`.
- Hover over an `<img>` inside a `<figure>` → outline snaps to the `<figure>`; badge reads `<figure>`.
- Click to pick → outline becomes solid pink; the marker also stays.
- Hover the picked element again → outline shows filled style (not dashed).
- Hover inside a giant `<article>` with >30 children → outline stays on the paragraph, not the article.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/content/index.ts entrypoints/content/content.css
git commit -m "feat(picker): smart-escalate to nearest semantic ancestor + tag badge

Hover previews now show the element that will actually be picked
(e.g. the <p> when hovering a <span> inside it), with a small tag
label so the user can predict what 'click' will do."
```

---

## Task 5: Replace cursor-following popover with top-pinned chip bar

**Files:**
- Modify: `entrypoints/content/index.ts`
- Modify: `entrypoints/content/content.css`

Remove `#wm-popover` from the overlay, add `#wm-chipbar` at top. Each chip has an `×` to remove its pick. Mount on first pick, unmount when empty.

- [ ] **Step 1: Replace the popover markup in the overlay innerHTML**

In the overlay innerHTML literal in `entrypoints/content/index.ts`, **remove** the entire `<div id="wm-popover">…</div>` block.

Add this block immediately after `<div id="wm-highlight"></div>` (and after `<div id="wm-tag">…</div>` from Task 4):

```html
<div id="wm-chipbar" role="toolbar" aria-label="Selected items">
  <div class="left">
    <svg class="sparkle" viewBox="-3 -3 6 6" aria-hidden="true">
      <polygon points="0,-2.6 0.7,-0.7 2.6,0 0.7,0.7 0,2.6 -0.7,0.7 -2.6,0 -0.7,-0.7" fill="#0b0d12"/>
    </svg>
    <span class="count" id="wm-chipbar-count">0 picked</span>
  </div>
  <div class="chips" id="wm-chipbar-chips"></div>
  <div class="right">
    <span class="hint">Press <kbd>⏎</kbd> for Magic</span>
  </div>
</div>
```

- [ ] **Step 2: Update the ref block in `index.ts`**

Remove `popover`, `popoverBtn`, `popoverCount` refs. Remove `popoverX`, `popoverY`, `popoverW`, `popoverH` state vars. Add:

```ts
const chipbar       = root.querySelector<HTMLElement>('#wm-chipbar')!;
const chipbarCount  = root.querySelector<HTMLElement>('#wm-chipbar-count')!;
const chipbarChips  = root.querySelector<HTMLElement>('#wm-chipbar-chips')!;
```

- [ ] **Step 3: Add chip-bar rendering helpers to the `overlay` module**

Add inside `main()` (next to the existing paint helpers):

```ts
function mountChipBar(): void {
  chipbar.classList.add('visible');
  renderChipBar();
}

function unmountChipBar(): void {
  chipbar.classList.remove('visible');
}

function renderChipBar(): void {
  chipbarCount.textContent = `${picker.picks.length} picked`;
  chipbarChips.innerHTML = '';
  for (const p of picker.picks) {
    const chip = document.createElement('div');
    chip.className = 'wm-chip';
    chip.dataset.pickId = p.id;
    chip.title = p.label;

    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = chipIconFor(p);

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = truncate(p.label, 24);

    const close = document.createElement('button');
    close.className = 'close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Remove pick');
    close.textContent = '×';
    close.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      picker.remove(p.id);
    });

    chip.append(icon, label, close);
    chipbarChips.appendChild(chip);
  }
}

function chipIconFor(p: Pick): string {
  if (p.payload.image) return '🖼';
  if (p.payload.link)  return '🔗';
  if (p.payload.tag === 'button' || p.payload.tag === 'a') return '→';
  return '¶';
}
```

Add `mountChipBar`, `unmountChipBar`, `renderChipBar` to the `overlay` module.

- [ ] **Step 4: Add `picker.remove(id)` and refactor `togglePick`**

Inside the picker module's functions:

```ts
function pickerAdd(el: Element): void {
  const marker = document.createElement('div');
  marker.className = 'wm-mark';
  document.body.appendChild(marker);
  applyRectBox(marker, el.getBoundingClientRect());
  const payload = getPayload(el);
  picker.picks.push({
    id: crypto.randomUUID(),
    el, marker, payload,
    label: labelFor(payload),
  });
}

function pickerRemove(id: string): void {
  const idx = picker.picks.findIndex(p => p.id === id);
  if (idx < 0) return;
  const [removed] = picker.picks.splice(idx, 1);
  removed.marker.remove();
  afterPicksChanged();
}

function togglePick(el: Element): void {
  const existing = picker.picks.findIndex(p => p.el === el);
  if (existing >= 0) {
    pickerRemove(picker.picks[existing].id);
    return;
  }
  pickerAdd(el);
  afterPicksChanged();
}

function afterPicksChanged(): void {
  if (picker.picks.length > 0) overlay.mountChipBar();
  else overlay.unmountChipBar();
  // Repaint so the dashed/filled state of the currently-hovered element updates.
  lastHighlightEl = null;
}
```

Wire `add: pickerAdd`, `remove: pickerRemove` into the `picker` module. Replace the body of the old `togglePick` with the new one above.

- [ ] **Step 5: Drop `paintPopover()` and remove it from `schedulePaint()`**

Delete the `paintPopover()` function and the `paintPopover()` call inside the `requestAnimationFrame` callback in `schedulePaint()`.

- [ ] **Step 6: Update `deactivate()` and `closeSheet()` to call `unmountChipBar()`**

Inside `deactivate()`, replace `popover.classList.remove('visible');` with `overlay.unmountChipBar();`.
Inside `closeSheet()` (in the post-animation cleanup), the chip bar is already unmounted by `commit()` → ensure `overlay.unmountChipBar()` is called once on commit. In the existing `commit()`:

```ts
function commit(): void {
  if (picker.picks.length === 0) return;
  overlay.unmountChipBar();
  const payloads = picker.picks.map(p => p.payload);
  sheet.show(payloads);
}
```

- [ ] **Step 7: Update bindings — remove popover click handler**

In the bindings block at the bottom of `main()`, **delete** the line:

```ts
popoverBtn.addEventListener('click', …);
```

(The Enter key still triggers `picker.commit()`. A click-to-commit affordance returns in the chip bar's "Press ⏎" hint as a button in Task 13's polish; for now Enter is the only commit path.)

- [ ] **Step 8: Add chip bar CSS to `entrypoints/content/content.css`**

Delete the existing `#wm-popover` rules (everything from `#wm-popover { … }` through `#wm-popover .kbd { … }`). Append:

```css
#wm-chipbar {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 38px;
  display: flex; align-items: center;
  gap: 12px;
  padding: 0 14px;
  background: rgba(20, 24, 35, 0.92);
  backdrop-filter: blur(8px) saturate(1.05);
  -webkit-backdrop-filter: blur(8px) saturate(1.05);
  border-bottom: 1px solid rgba(125, 249, 255, 0.22);
  color: #e7ecf3;
  font: 13px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
  z-index: 2147483647;
  transform: translateY(-100%);
  opacity: 0;
  pointer-events: none;
  transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease;
}
#wm-chipbar.visible {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}
#wm-chipbar .left { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
#wm-chipbar .left .sparkle { width: 14px; height: 14px;
  background: linear-gradient(90deg, #7df9ff, #b07cff, #ff7ad9);
  -webkit-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='-3 -3 6 6'><polygon points='0,-2.6 0.7,-0.7 2.6,0 0.7,0.7 0,2.6 -0.7,0.7 -2.6,0 -0.7,-0.7' fill='black'/></svg>") center / contain no-repeat;
          mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='-3 -3 6 6'><polygon points='0,-2.6 0.7,-0.7 2.6,0 0.7,0.7 0,2.6 -0.7,0.7 -2.6,0 -0.7,-0.7' fill='black'/></svg>") center / contain no-repeat;
}
#wm-chipbar .count { font-weight: 600; font-variant-numeric: tabular-nums; }
#wm-chipbar .chips {
  display: flex; align-items: center; gap: 6px;
  overflow-x: auto;
  flex: 1;
  scrollbar-width: thin;
}
#wm-chipbar .chips::-webkit-scrollbar { height: 4px; }
#wm-chipbar .right { display: flex; align-items: center; flex-shrink: 0; }
#wm-chipbar .hint { font-size: 11.5px; color: #8a93a6; }
#wm-chipbar .hint kbd {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 16px; height: 18px;
  padding: 0 5px;
  background: rgba(125, 249, 255, 0.12);
  border: 1px solid rgba(125, 249, 255, 0.22);
  border-radius: 5px;
  font-family: inherit; font-size: 11px; color: #e7ecf3;
}

.wm-chip {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(125, 249, 255, 0.08);
  border: 1px solid rgba(125, 249, 255, 0.22);
  border-radius: 999px;
  padding: 3px 4px 3px 10px;
  font-size: 12px;
  color: #e7ecf3;
  flex-shrink: 0;
  max-width: 220px;
}
.wm-chip .icon { font-size: 11px; opacity: 0.8; }
.wm-chip .label {
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  max-width: 160px;
}
.wm-chip .close {
  appearance: none; border: 0; background: rgba(255, 255, 255, 0.04);
  color: #8a93a6; cursor: pointer;
  width: 18px; height: 18px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 13px; line-height: 1; padding: 0;
}
.wm-chip .close:hover { color: #e7ecf3; background: rgba(255,255,255,0.1); }
```

- [ ] **Step 9: Type-check, build, manual test**

```bash
pnpm compile && pnpm build
```

Reload. On a Wikipedia article:
- Wiggle to enter selection mode.
- Click a paragraph → chip bar slides down from the top of the viewport, shows `1 picked` and a chip with the truncated paragraph text + an `×`.
- Click two more elements → chip bar shows `3 picked` and three chips; bar scrolls horizontally if chips overflow.
- Click an `×` on a chip → that pick's marker disappears; chip bar updates count.
- Click `×` until empty → chip bar slides up.
- The old cursor-following pill should no longer appear anywhere.
- Press Enter → sheet opens; the chip bar above unmounts.

- [ ] **Step 10: Commit**

```bash
git add entrypoints/content/index.ts entrypoints/content/content.css
git commit -m "feat(picker): top-pinned chip bar replaces cursor-following popover

Each pick becomes a removable chip in a fixed strip at the top of
the viewport; '×' on a chip removes that pick. Commit affordance
moves to the Enter key + chip bar's 'Press ⏎' hint."
```

---

## Task 6: Sheet header redesign + chip bar remount inside sheet

**Files:**
- Modify: `entrypoints/content/index.ts`
- Modify: `entrypoints/content/content.css`

After commit, the chip bar re-mounts inside the sheet header so the user can refine the selection from inside the sheet. Each `×` in the sheet's chip bar removes a pick and (once Task 9 adds it) marks the answer stale.

- [ ] **Step 1: Replace the sheet header markup**

In `entrypoints/content/index.ts`, inside the overlay innerHTML, replace the current sheet's `.header` and `.chips` blocks. The whole `<div id="wm-sheet">` block should now read:

```html
<div id="wm-sheet" role="dialog" aria-label="Magic">
  <div class="pill-state">
    <span class="dot"></span>
    <span>Preparing your context…</span>
  </div>
  <div class="sheet-state">
    <button class="close" id="wm-sheet-close" type="button" aria-label="Close">×</button>
    <div class="header">
      <b>Magic</b>
      <span class="backend-pill" id="wm-backend-pill" hidden></span>
    </div>
    <div class="chips" id="wm-sheet-chips"></div>
    <div class="hero" id="wm-hero">
      <button class="hero-btn" id="wm-hero-summary" type="button">
        <svg class="sparkle" viewBox="-3 -3 6 6" aria-hidden="true">
          <polygon points="0,-2.6 0.7,-0.7 2.6,0 0.7,0.7 0,2.6 -0.7,0.7 -2.6,0 -0.7,-0.7" fill="#0b0d12"/>
        </svg>
        Summarize
      </button>
      <button class="hero-btn" id="wm-hero-compare" type="button" hidden>⇄ Compare these</button>
    </div>
    <div class="answer empty" id="wm-sheet-answer"></div>
    <div class="stale-banner" id="wm-stale" hidden>
      <span>⚠ Selection changed — answer may be stale</span>
      <button id="wm-rerun" type="button">↻ Rerun</button>
    </div>
    <div class="answer-actions" id="wm-sheet-actions">
      <button id="wm-save" type="button" aria-label="Save answer">
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M3 2h8l2 2v10H3V2zm2 0v4h6V2H5zM5 9h6v3H5V9z" fill="currentColor"/>
        </svg>
        Save
      </button>
      <button id="wm-copy" type="button" aria-label="Copy answer">
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 2h7v2H6v8H4V2zm2 4h7v9H6V6zm2 2v5h3V8H8z" fill="currentColor"/>
        </svg>
        Copy
      </button>
      <span class="saved" id="wm-saved-msg" style="display:none">saved ✓</span>
    </div>
    <div class="ask">
      <input id="wm-sheet-input" type="text" placeholder="Ask anything about your selection…" autocomplete="off" />
      <button id="wm-sheet-send" type="button">
        <svg class="sparkle" viewBox="-3 -3 6 6" aria-hidden="true">
          <polygon points="0,-2.6 0.7,-0.7 2.6,0 0.7,0.7 0,2.6 -0.7,0.7 -2.6,0 -0.7,-0.7" fill="#0b0d12"/>
        </svg>
        <span id="wm-sheet-send-label">Ask</span>
      </button>
    </div>
  </div>
</div>
```

The `sheetCount` element (`#wm-sheet-count`) is gone — the chip bar already conveys the count.

- [ ] **Step 2: Update refs**

In the refs block, **remove** `sheetCount`. **Add**:

```ts
const heroSummary  = root.querySelector<HTMLButtonElement>('#wm-hero-summary')!;
const heroCompare  = root.querySelector<HTMLButtonElement>('#wm-hero-compare')!;
const staleBanner  = root.querySelector<HTMLElement>('#wm-stale')!;
const rerunBtn     = root.querySelector<HTMLButtonElement>('#wm-rerun')!;
const backendPill  = root.querySelector<HTMLElement>('#wm-backend-pill')!;
```

Also keep the existing `sheetInput`, `sheetSend`, `sheetSendLabel`, `sheetClose`, `answerEl`, `actionsEl`, `saveBtn`, `copyBtn`, `savedMsg`, `sheetChips`.

- [ ] **Step 3: Rewrite the sheet's chip render to use removable chips and the `picker.picks` array**

Inside `showSheet()`, replace the existing chip-render loop with a call to a new helper. Add:

```ts
function renderSheetChips(): void {
  sheetChips.innerHTML = '';
  for (const p of picker.picks) {
    const chip = document.createElement('div');
    chip.className = 'wm-chip';
    chip.dataset.pickId = p.id;
    chip.title = p.label;

    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = chipIconFor(p);

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = truncate(p.label, 24);

    const close = document.createElement('button');
    close.className = 'close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Remove pick');
    close.textContent = '×';
    close.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sheet.onChipRemove(p.id);
    });

    chip.append(icon, label, close);
    sheetChips.appendChild(chip);
  }
}
```

Add `sheet.onChipRemove` (it will mark stale once Task 9 lands; for now it just removes):

```ts
function onChipRemoveInSheet(id: string): void {
  picker.remove(id);
  // If we removed the last pick, the answer is meaningless — close the sheet.
  if (picker.picks.length === 0) {
    sheet.close();
    return;
  }
  renderSheetChips();
  // Task 9 wires sheet.stale = true here when an answer exists.
}
```

Wire `onChipRemove: onChipRemoveInSheet` into the `sheet` module.

In `showSheet(payloads)`, replace the chip-render block with `renderSheetChips();`. Drop the `sheetCount.textContent = …;` line.

- [ ] **Step 4: Show/hide hero row based on sheet state**

Add state to the sheet module:

```ts
const sheetState = { activeAction: null as 'summary' | 'compare' | 'ask' | null, stale: false };
```

Update `showSheet()` initial setup to reset and show hero:

```ts
sheetState.activeAction = null;
sheetState.stale = false;
heroRow().hidden = false;
staleBanner.hidden = true;
heroCompare.hidden = picker.picks.length < 2;
```

Add a tiny helper:

```ts
function heroRow(): HTMLElement { return root.querySelector<HTMLElement>('#wm-hero')!; }
```

When an answer starts streaming (in `submitAsk`, in Task 7's `runSummarize`, in Task 8's `runCompare`), hide the hero row:

```ts
heroRow().hidden = true;
```

This task only needs to wire the show side. Wiring "hide on answer start" happens inside Task 7/8 where the new actions are added; meanwhile `submitAsk` (Ask flow) should also hide the hero row when it kicks off:

In `submitAsk()`, immediately after `currentQuestion = question;`, add:

```ts
heroRow().hidden = true;
sheetState.activeAction = 'ask';
```

- [ ] **Step 5: Update sheet CSS**

In `entrypoints/content/content.css`, replace the existing `#wm-sheet .chips`, `#wm-sheet .chip`, and `#wm-sheet .answer-actions` rules with chip styles that reuse the same `.wm-chip` class introduced in Task 5, and add hero / stale styles. Replace:

```css
#wm-sheet .chips { … }
#wm-sheet .chip { … }
```

with:

```css
#wm-sheet .chips {
  display: flex; gap: 6px;
  overflow-x: auto;
  scrollbar-width: thin;
  padding-bottom: 2px;
}
#wm-sheet .chips::-webkit-scrollbar { height: 4px; }
```

Append at the end of the file:

```css
#wm-sheet .hero {
  display: flex; gap: 8px;
  margin-top: 2px;
}
#wm-sheet .hero-btn {
  appearance: none;
  background: linear-gradient(90deg, #7df9ff, #b07cff, #ff7ad9, #ffd57a, #7df9ff);
  background-size: 300% 100%;
  animation: wm-flow 4.5s linear infinite;
  border: 0; border-radius: 12px;
  padding: 10px 14px;
  font: 600 13px inherit;
  color: #0b0d12;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
}
#wm-sheet .hero-btn:hover:not(:disabled) { filter: brightness(1.08); }
#wm-sheet .hero-btn:disabled { opacity: 0.55; cursor: not-allowed; filter: grayscale(0.4); }
#wm-sheet .hero-btn .sparkle { width: 12px; height: 12px; }
#wm-sheet .hero-btn#wm-hero-compare {
  background: rgba(125, 249, 255, 0.12);
  color: #e7ecf3;
  border: 1px solid rgba(125, 249, 255, 0.32);
  animation: none;
}
#wm-sheet .hero-btn#wm-hero-compare:hover { background: rgba(125, 249, 255, 0.18); }

#wm-sheet .stale-banner {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(255, 213, 122, 0.08);
  border: 1px solid rgba(255, 213, 122, 0.32);
  border-radius: 10px;
  color: #ffd57a;
  font-size: 12px;
}
#wm-sheet .stale-banner button {
  appearance: none;
  background: rgba(255, 213, 122, 0.18);
  border: 1px solid rgba(255, 213, 122, 0.4);
  color: #ffd57a;
  border-radius: 8px;
  padding: 5px 10px;
  font: 600 12px inherit;
  cursor: pointer;
}
#wm-sheet .stale-banner button:hover { background: rgba(255, 213, 122, 0.28); }

#wm-sheet .backend-pill {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(125, 249, 255, 0.08);
  border: 1px solid rgba(125, 249, 255, 0.22);
  color: #e7ecf3;
  cursor: pointer;
}
#wm-sheet .backend-pill::before {
  content: ""; width: 6px; height: 6px; border-radius: 50%;
  background: #7df9ff;
}
#wm-sheet .backend-pill.cloud::before { background: #ffd57a; }
```

- [ ] **Step 6: Type-check, build, manual test**

```bash
pnpm compile && pnpm build
```

Reload. Pick 1 element + commit:
- Sheet opens; chip bar visible inside sheet header (count + chip with `×`).
- Hero row shows just `Summarize` (Compare hidden because only 1 pick).
- Ask input + button present.
- Typing into Ask + Enter still streams an answer; the hero row hides during streaming.
- Click `×` on the chip → pick removed; sheet stays open with new chip count.
- Click `×` on the last chip → sheet closes (no picks to operate on).
- Pick 2 elements + commit → Compare button is now visible alongside Summarize.

(Summarize/Compare buttons don't do anything yet — that's Task 7/8.)

- [ ] **Step 7: Commit**

```bash
git add entrypoints/content/index.ts entrypoints/content/content.css
git commit -m "feat(sheet): redesign with in-sheet chip bar, hero row, backend pill

Chips re-mount inside the sheet header with × for in-place refinement.
Hero row holds Summarize (always) + Compare (contextual at 2+ picks).
Backend pill + stale banner placeholders added; wiring lands in
later tasks."
```

---

## Task 7: Summarize hero action

**Files:**
- Modify: `entrypoints/content/index.ts`

Implement the Summarize button. Prefer the Summarizer API; fall back to the existing `askAI` Prompt API path with a summarize prompt.

- [ ] **Step 1: Add `runSummarize` to the sheet module**

Inside `main()`, near `submitAsk`:

```ts
async function runSummarize(): Promise<void> {
  if (picker.picks.length === 0 || askController) return;
  heroRow().hidden = true;
  sheetState.activeAction = 'summary';
  sheetState.stale = false;
  staleBanner.hidden = true;

  currentQuestion = 'Summarize selection';
  currentAnswer = '';
  answerEl.classList.remove('empty');
  answerEl.innerHTML = '<span class="placeholder">Summarizing…</span>';
  actionsEl.classList.remove('show');
  savedMsg.style.display = 'none';
  answerSavedThisRun = false;

  askController = new AbortController();
  const textNode = document.createTextNode('');
  try {
    const payloads = picker.picks.map(p => p.payload);
    await summarizePicks(payloads, askController.signal, (chunk, isFirst) => {
      if (isFirst) {
        answerEl.replaceChildren(textNode);
        answerEl.classList.add('streaming');
      }
      textNode.appendData(chunk);
      currentAnswer += chunk;
      answerEl.scrollTop = answerEl.scrollHeight;
    });
    renderMarkdownInto(answerEl, currentAnswer);
    actionsEl.classList.add('show');
  } catch (err) {
    if (err && (err as Error).name === 'AbortError') return;
    console.error('[wiggle-magic] summarize failed:', err);
    const errSpan = document.createElement('span');
    errSpan.className = 'err';
    errSpan.textContent = (err as Error)?.message || String(err);
    answerEl.replaceChildren(errSpan);
  } finally {
    answerEl.classList.remove('streaming');
    askController = null;
  }
}
```

- [ ] **Step 2: Add `summarizePicks` — Summarizer API with Prompt fallback**

Add the streaming summarizer:

```ts
async function summarizePicks(
  payloads: Payload[],
  signal: AbortSignal,
  onChunk: (chunk: string, isFirst: boolean) => void,
): Promise<void> {
  const sourceText = payloads.map((p, i) => {
    const head = `[${i + 1}] <${p.tag}>`;
    const body = p.text || p.image?.alt || p.link?.text || '';
    return `${head}\n${body}`;
  }).join('\n\n');

  // Try the Summarizer API first (Nano-only, on-device).
  if ('Summarizer' in self) {
    const avail = await Summarizer.availability().catch(() => 'unavailable');
    if (avail === 'available' || avail === 'readily') {
      const s = await Summarizer.create({
        type: 'tl;dr',
        format: 'markdown',
        length: 'short',
        expectedInputLanguages: ['en'],
        outputLanguage: 'en',
      });
      let first = true;
      try {
        const stream = s.summarizeStreaming(sourceText);
        for await (const chunk of stream) {
          if (signal.aborted) throw new DOMException('aborted', 'AbortError');
          onChunk(chunk, first);
          first = false;
        }
        return;
      } finally {
        s.destroy?.();
      }
    }
  }

  // Fallback: route through existing askAI with a summarize prompt.
  await askAI(
    'Summarize these selections in 3-5 short bullets. Be concrete and skim-friendly.',
    payloads,
    signal,
    onChunk,
  );
}
```

- [ ] **Step 3: Wire the button**

In the bindings block, add:

```ts
heroSummary.addEventListener('click', runSummarize);
```

Also add `runSummarize` to the sheet module property list (so Task 9's Rerun can call back into it).

- [ ] **Step 4: Type-check, build, manual test**

```bash
pnpm compile && pnpm build
```

Reload. Wiggle, pick a paragraph + a sub-heading, press Enter to open the sheet, click `Summarize`:
- Hero row hides; "Summarizing…" placeholder appears; answer streams in as markdown.
- After completion, `Save` + `Copy` row appears below the answer.
- `Save` writes a `MemoryEntry`; open the popup to confirm it lists.

If the Summarizer API isn't ready on your machine, the BYOK Prompt API fallback runs. If neither is set up, you'll see a useful error (existing `askAI` behavior).

- [ ] **Step 5: Commit**

```bash
git add entrypoints/content/index.ts
git commit -m "feat(sheet): Summarize hero action with Summarizer API + Prompt fallback"
```

---

## Task 8: Compare hero action

**Files:**
- Modify: `entrypoints/content/index.ts`

The Compare button is contextual: visible only when `picker.picks.length >= 2`. It uses the Prompt API path with a compare-specific prompt.

- [ ] **Step 1: Add `runCompare`**

Near `runSummarize`:

```ts
async function runCompare(): Promise<void> {
  if (picker.picks.length < 2 || askController) return;
  heroRow().hidden = true;
  sheetState.activeAction = 'compare';
  sheetState.stale = false;
  staleBanner.hidden = true;

  currentQuestion = 'Compare selections';
  currentAnswer = '';
  answerEl.classList.remove('empty');
  answerEl.innerHTML = '<span class="placeholder">Comparing…</span>';
  actionsEl.classList.remove('show');
  savedMsg.style.display = 'none';
  answerSavedThisRun = false;

  askController = new AbortController();
  const textNode = document.createTextNode('');
  try {
    const payloads = picker.picks.map(p => p.payload);
    await askAI(
      `Compare these ${payloads.length} selections. Use a short Markdown table when the items are clearly comparable; otherwise contrast them in concise bullets. Lead with the biggest differences.`,
      payloads,
      askController.signal,
      (chunk, isFirst) => {
        if (isFirst) {
          answerEl.replaceChildren(textNode);
          answerEl.classList.add('streaming');
        }
        textNode.appendData(chunk);
        currentAnswer += chunk;
        answerEl.scrollTop = answerEl.scrollHeight;
      },
    );
    renderMarkdownInto(answerEl, currentAnswer);
    actionsEl.classList.add('show');
  } catch (err) {
    if (err && (err as Error).name === 'AbortError') return;
    console.error('[wiggle-magic] compare failed:', err);
    const errSpan = document.createElement('span');
    errSpan.className = 'err';
    errSpan.textContent = (err as Error)?.message || String(err);
    answerEl.replaceChildren(errSpan);
  } finally {
    answerEl.classList.remove('streaming');
    askController = null;
  }
}
```

- [ ] **Step 2: Wire the button + keep Compare visibility in sync**

Add in the bindings block:

```ts
heroCompare.addEventListener('click', runCompare);
```

Inside `onChipRemoveInSheet` (added in Task 6), after `renderSheetChips()` add:

```ts
heroCompare.hidden = picker.picks.length < 2;
```

So if the user drops below 2 picks while the hero row is visible, Compare disappears.

Also add `runCompare` to the `sheet` module property list (for Rerun in Task 9).

- [ ] **Step 3: Type-check, build, manual test**

```bash
pnpm compile && pnpm build
```

Reload. Pick **two** comparable items (e.g. two product cards, or two headings) → press Enter → `Compare these` button is visible. Click it → streaming answer compares them.

Pick only one item → `Compare these` is hidden.

Pick three items, commit, remove one via the sheet's chip × → `Compare these` is still visible (still ≥ 2). Remove another → it disappears.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/content/index.ts
git commit -m "feat(sheet): contextual Compare action for 2+ picks"
```

---

## Task 9: Stale + Rerun (US-9)

**Files:**
- Modify: `entrypoints/content/index.ts`

After an answer exists, removing a chip via the sheet's chip bar marks the answer stale and shows a Rerun button. The answer is **not** wiped.

- [ ] **Step 1: Wire stale-setting in `onChipRemoveInSheet`**

Replace the body of `onChipRemoveInSheet` (added in Task 6) with:

```ts
function onChipRemoveInSheet(id: string): void {
  picker.remove(id);
  if (picker.picks.length === 0) {
    sheet.close();
    return;
  }
  renderSheetChips();
  heroCompare.hidden = picker.picks.length < 2;

  // If we already have an answer, mark it stale.
  if (sheetState.activeAction !== null) {
    sheetState.stale = true;
    staleBanner.hidden = false;
  }
}
```

- [ ] **Step 2: Add `rerun()` to the sheet module**

```ts
function rerun(): void {
  if (!sheetState.stale || !sheetState.activeAction) return;
  staleBanner.hidden = true;
  sheetState.stale = false;
  if (sheetState.activeAction === 'summary') runSummarize();
  else if (sheetState.activeAction === 'compare') runCompare();
  else if (sheetState.activeAction === 'ask') {
    // Re-ask the same question.
    sheetInput.value = currentQuestion;
    submitAsk();
  }
}
```

Add `rerun` to the `sheet` module property list.

- [ ] **Step 3: Wire the button**

In the bindings block:

```ts
rerunBtn.addEventListener('click', rerun);
```

- [ ] **Step 4: Clear stale state when a fresh action starts**

`runSummarize`, `runCompare`, and `submitAsk` already set `sheetState.stale = false` and `staleBanner.hidden = true` at start. Verify each does, and add the lines if missing:

```ts
sheetState.stale = false;
staleBanner.hidden = true;
```

- [ ] **Step 5: Type-check, build, manual test**

```bash
pnpm compile && pnpm build
```

Reload. Pick 2 paragraphs, commit, click `Summarize`, wait for answer. Then click `×` on one of the chips inside the sheet:
- Chip disappears, marker on the page disappears.
- Stale banner appears between answer and footer: `⚠ Selection changed — answer may be stale  [↻ Rerun]`.
- The previous answer remains visible.
- Click `Rerun` → banner hides, "Summarizing…" placeholder appears, new answer streams in over the old one.

Repeat for Compare and Ask. Remove a chip down to zero → sheet closes (no stale banner).

- [ ] **Step 6: Commit**

```bash
git add entrypoints/content/index.ts
git commit -m "feat(sheet): mark answer stale + Rerun when chip removed in-sheet"
```

---

## Task 10: Save flow records `action`; no more variant-stacking

**Files:**
- Modify: `entrypoints/content/index.ts`

`Save` now writes the answer plus which hero action produced it. No variants are generated.

- [ ] **Step 1: Update `saveCurrentAnswer` to write `action`**

Replace the `entry` object in `saveCurrentAnswer` with:

```ts
const entry: MemoryEntry = {
  id: crypto.randomUUID(),
  ts: Date.now(),
  url: location.href,
  title: document.title,
  hostname: location.hostname,
  question: currentQuestion,
  answer: currentAnswer,
  action: sheetState.activeAction ?? 'ask',
  selections: picker.picks.map(p => ({
    tag: p.payload.tag,
    text: p.payload.text,
    link: p.payload.link ?? undefined,
    image: p.payload.image ? { src: p.payload.image.src, alt: p.payload.image.alt } : undefined,
    selector: p.payload.selector,
  })),
};
```

Add the `MemoryEntry` import at the top of the file if not already present:

```ts
import type { WmSettings, MemoryEntry } from '@/src/lib/types';
```

- [ ] **Step 2: Drop `currentSelections` if now unused**

`currentSelections` was used by the old `saveCurrentAnswer` to capture payloads at sheet-open time. Now `saveCurrentAnswer` reads `picker.picks` directly. If `currentSelections` is unreferenced after this change, remove it:

```bash
grep -n 'currentSelections' entrypoints/content/index.ts
```

If only the declaration and assignments remain (no reads), delete the declaration and all assignments. Otherwise leave it alone.

- [ ] **Step 3: Type-check, build, manual test**

```bash
pnpm compile && pnpm build
```

Reload. Run a Summarize → Save. Open the popup → entry is there. Inspect via DevTools console:

```js
chrome.storage.local.get('wm_memory').then(r => console.log(r.wm_memory[0]));
```

Expected: the entry includes `action: 'summary'`. Repeat for Compare (`action: 'compare'`) and Ask (`action: 'ask'`).

Confirm the popup still renders the entry correctly (the popup ignores the `action` field — that's fine).

- [ ] **Step 4: Commit**

```bash
git add entrypoints/content/index.ts
git commit -m "feat(sheet): save records action; drop variant-stacking on write"
```

---

## Task 11: Backend indicator pill (US-6)

**Files:**
- Modify: `entrypoints/content/index.ts`

Show whether the current run is on-device (Nano, green) or cloud (BYOK, amber). Click → opens the options page.

- [ ] **Step 1: Add `refreshBackendPill` to the sheet module**

```ts
async function refreshBackendPill(): Promise<void> {
  const settings = await loadSettings();
  let label = 'Nano · on-device';
  let cloud = false;

  if (settings.backend === 'byok') {
    label = backendLabelFromProvider(settings.provider);
    cloud = true;
  } else if (typeof LanguageModel !== 'undefined') {
    const avail = await LanguageModel.availability().catch(() => 'unavailable');
    if (avail !== 'available' && avail !== 'readily') {
      // Nano not ready; we'll fall back to cloud at run time.
      label = settings.apiKey ? backendLabelFromProvider(settings.provider) : 'Set up Nano';
      cloud = !!settings.apiKey;
    }
  } else {
    label = settings.apiKey ? backendLabelFromProvider(settings.provider) : 'Set up Nano';
    cloud = !!settings.apiKey;
  }

  backendPill.textContent = label;
  backendPill.classList.toggle('cloud', cloud);
  backendPill.hidden = false;
}

function backendLabelFromProvider(provider: string): string {
  if (provider === 'openai')    return 'OpenAI · cloud';
  if (provider === 'anthropic') return 'Anthropic · cloud';
  if (provider === 'gemini')    return 'Gemini · cloud';
  return `${provider} · cloud`;
}
```

- [ ] **Step 2: Call it when the sheet opens**

In `showSheet()`, after setting `sheet.classList.add('visible')` (the `requestAnimationFrame` call), invoke:

```ts
refreshBackendPill();
```

- [ ] **Step 3: Wire click → options**

In bindings:

```ts
backendPill.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openOptions' }).catch(() => {});
});
```

The background script needs to handle this. Open `entrypoints/background.ts` and add a handler if not already present. Check first:

```bash
grep -n 'openOptions\|openOptionsPage' entrypoints/background.ts
```

If `openOptions` is **not** already handled, add this `onMessage` listener (or extend the existing one):

```ts
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === 'openOptions') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }
  // … (existing handlers stay as-is)
});
```

- [ ] **Step 4: Type-check, build, manual test**

```bash
pnpm compile && pnpm build
```

Reload. Open the sheet:
- If you have Nano available, the pill reads `Nano · on-device` with a green dot.
- Open Options, switch backend to `byok` with an OpenAI key, save, reopen the sheet → pill reads `OpenAI · cloud` with an amber dot.
- Click the pill → options page opens.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/content/index.ts entrypoints/background.ts
git commit -m "feat(sheet): backend indicator pill (Nano on-device vs BYOK cloud)"
```

---

## Task 12: Error states (US-8)

**Files:**
- Modify: `entrypoints/content/index.ts`
- Modify: `entrypoints/content/content.css`

A single `showError` component replaces the answer area with structured error UI. Errors thrown inside `runSummarize` / `runCompare` / `submitAsk` are funneled through it.

- [ ] **Step 1: Add the error model + `showError`**

```ts
type ErrorCode =
  | 'nano-unavailable'
  | 'nano-downloading'
  | 'byok-no-key'
  | 'stream-failed'
  | 'selection-too-big'
  | 'page-blocked';

interface SheetError {
  code: ErrorCode;
  title: string;
  body: string;
  primary?: { label: string; onClick: () => void };
}

function showError(err: SheetError): void {
  const wrap = document.createElement('div');
  wrap.className = 'wm-err';
  const t = document.createElement('div'); t.className = 'wm-err-title'; t.textContent = err.title;
  const b = document.createElement('div'); b.className = 'wm-err-body';  b.textContent = err.body;
  wrap.append(t, b);
  if (err.primary) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = err.primary.label;
    btn.addEventListener('click', err.primary.onClick);
    wrap.appendChild(btn);
  }
  answerEl.classList.remove('empty');
  answerEl.replaceChildren(wrap);
}
```

Add `showError` to the `sheet` module property list.

- [ ] **Step 2: Classify errors from a thrown `Error`**

Add a translator from caught errors → `SheetError`:

```ts
function classifyError(err: unknown): SheetError {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Gemini Nano isn't ready.*downloading|downloadable|after-download/i.test(msg)) {
    return {
      code: 'nano-downloading',
      title: 'Model still downloading',
      body: 'Gemini Nano is still downloading. Try again in a moment, or set a BYOK key in Options to use cloud instead.',
      primary: { label: 'Open options', onClick: () => chrome.runtime.sendMessage({ action: 'openOptions' }).catch(() => {}) },
    };
  }
  if (/Gemini Nano isn't ready/i.test(msg)) {
    return {
      code: 'nano-unavailable',
      title: "On-device AI isn't ready",
      body: 'Gemini Nano needs Chrome 138+ and a one-time model download.',
      primary: { label: 'Set up Nano', onClick: () => chrome.runtime.sendMessage({ action: 'openOptions' }).catch(() => {}) },
    };
  }
  if (/No API key configured/i.test(msg)) {
    return {
      code: 'byok-no-key',
      title: 'Add an API key to use cloud',
      body: 'You picked a cloud provider but no key is saved.',
      primary: { label: 'Add key', onClick: () => chrome.runtime.sendMessage({ action: 'openOptions' }).catch(() => {}) },
    };
  }
  return {
    code: 'stream-failed',
    title: 'The model stopped mid-answer',
    body: msg,
    primary: { label: 'Try again', onClick: () => sheet.rerun() },
  };
}
```

- [ ] **Step 3: Replace the existing `catch` blocks in the three runners**

Inside `submitAsk()`, `runSummarize()`, and `runCompare()`, replace the existing `catch (err) { … }` body with:

```ts
catch (err) {
  if (err && (err as Error).name === 'AbortError') return;
  console.error('[wiggle-magic] action failed:', err);
  showError(classifyError(err));
}
```

(The `finally` block stays the same — it still resets `askController` and removes the `streaming` class.)

- [ ] **Step 4: Add CSS**

Append to `entrypoints/content/content.css`:

```css
#wm-sheet .wm-err {
  display: flex; flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  background: rgba(255, 158, 199, 0.05);
  border: 1px solid rgba(255, 158, 199, 0.32);
  border-radius: 10px;
  color: #d6dbe6;
}
#wm-sheet .wm-err-title { font-weight: 600; color: #ff9ec7; font-size: 13px; }
#wm-sheet .wm-err-body  { font-size: 12.5px; line-height: 1.5; }
#wm-sheet .wm-err button {
  align-self: flex-start;
  appearance: none;
  background: rgba(125, 249, 255, 0.12);
  border: 1px solid rgba(125, 249, 255, 0.28);
  color: #e7ecf3;
  border-radius: 8px;
  padding: 6px 10px;
  font: 600 12px inherit;
  cursor: pointer;
}
#wm-sheet .wm-err button:hover { background: rgba(125, 249, 255, 0.2); }
```

- [ ] **Step 5: Type-check, build, manual test**

```bash
pnpm compile && pnpm build
```

Reload. To trigger error states:
- **byok-no-key**: open Options → set backend to `byok` and clear the API key → save → open the sheet → click Summarize → expect the "Add an API key to use cloud" error with an "Add key" button.
- **stream-failed**: temporarily set an invalid API key in Options → Summarize → expect "The model stopped mid-answer" with the provider error in the body.
- **nano-unavailable** (only if Nano isn't available on your machine, with backend `auto` + no key): Summarize → expect "On-device AI isn't ready" with "Set up Nano" button.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/content/index.ts entrypoints/content/content.css
git commit -m "feat(sheet): structured error states with retry/options entry points"
```

---

## Task 13: Selection-too-big guard + `Alt+Shift+M` keyboard entry

**Files:**
- Modify: `entrypoints/content/index.ts`

`Alt+Shift+M` activates selection mode (co-equal to wiggle). A pre-commit guard rejects selections that would exceed Nano's window.

- [ ] **Step 1: Add `Alt+Shift+M` handler**

In the existing `document.addEventListener('keydown', …)` block, add an early branch:

```ts
if (e.altKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
  e.preventDefault();
  if (picker.mode === 'sheet') {
    sheet.close();
    setTimeout(() => picker.activate(cursorX, cursorY), 380);
  } else if (picker.mode === 'idle') {
    picker.activate(cursorX, cursorY);
  }
  return;
}
```

(Place it above the existing `if (e.key === 'Escape') { … }` branch.)

- [ ] **Step 2: Add the selection-size guard in `commit()`**

Replace the body of `commit()`:

```ts
function commit(): void {
  if (picker.picks.length === 0) return;
  const totalChars = picker.picks.reduce((acc, p) => acc + (p.payload.text?.length || 0), 0);
  const BUDGET = 16_000;
  if (totalChars > BUDGET) {
    overlay.unmountChipBar();
    sheet.show(picker.picks.map(p => p.payload));
    sheet.showError({
      code: 'selection-too-big',
      title: 'That selection is too long',
      body: `We capture up to ~${BUDGET.toLocaleString()} characters across picks (Nano's window); you've picked ~${totalChars.toLocaleString()}. Remove a chip and try again.`,
    });
    return;
  }
  overlay.unmountChipBar();
  sheet.show(picker.picks.map(p => p.payload));
}
```

`sheet.showError` is the function added in Task 12; make sure it's on the `sheet` module's property list (`showError: showError`).

- [ ] **Step 3: Type-check, build, manual test**

```bash
pnpm compile && pnpm build
```

Reload. On any page:
- Press `Alt+Shift+M` → cursor becomes glowing, edges aurora-glow — same as a wiggle activation.
- Pick a paragraph + Enter → sheet opens normally.
- On a long article, select 8-10 large paragraphs (or repeatedly the same one is fine since each pick has its own payload) → Enter → expect the `selection-too-big` error inside the sheet rather than a successful commit.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/content/index.ts
git commit -m "feat(picker): Alt+Shift+M keyboard entry + selection-too-big guard"
```

---

## Task 14: First-run onboarding + help page shortcuts

**Files:**
- Modify: `entrypoints/content/index.ts`
- Modify: `entrypoints/content/content.css`
- Modify: `entrypoints/help/index.html`

A one-time coachmark appears the first time the user wiggles. Help page documents the new shortcuts.

- [ ] **Step 1: Add the coachmark element to the overlay HTML**

In `entrypoints/content/index.ts`, inside the overlay innerHTML, add at the bottom (before `<div id="wm-toast"></div>`):

```html
<div id="wm-coach" role="dialog" aria-label="Welcome to Magic" hidden>
  <div class="step">① Wiggle your cursor — already!</div>
  <div class="step">② Click anything to pick it.</div>
  <div class="step">③ Press <kbd>⏎</kbd> to ask.</div>
  <div class="tip">Tip: <kbd>Alt</kbd>+<kbd>⇧</kbd>+<kbd>M</kbd> does the same.</div>
  <button id="wm-coach-dismiss" type="button">Got it</button>
</div>
```

- [ ] **Step 2: Add coachmark logic**

Add a ref:

```ts
const coach = root.querySelector<HTMLElement>('#wm-coach')!;
const coachDismiss = root.querySelector<HTMLButtonElement>('#wm-coach-dismiss')!;
```

Add a helper:

```ts
async function maybeShowCoach(): Promise<void> {
  const { 'wm:first-run': seen } = await chrome.storage.local.get('wm:first-run') as { 'wm:first-run'?: boolean };
  if (seen) return;
  coach.hidden = false;
  requestAnimationFrame(() => coach.classList.add('visible'));
}

async function dismissCoach(): Promise<void> {
  coach.classList.remove('visible');
  setTimeout(() => { coach.hidden = true; }, 220);
  await chrome.storage.local.set({ 'wm:first-run': true });
}
```

Call `maybeShowCoach()` at the **bottom** of `picker.activate()` (so it appears the first time selection mode kicks in):

```ts
function activate(x: number, y: number): void {
  // … (existing body) …
  setTimeout(() => { if (picker.mode === 'activating') picker.mode = 'selecting'; }, 220);
  maybeShowCoach();
}
```

Auto-dismiss on first successful commit. Inside `commit()`, after the size-budget check passes (just before `sheet.show(…)`), add:

```ts
dismissCoach();
```

Wire the button:

```ts
coachDismiss.addEventListener('click', dismissCoach);
```

- [ ] **Step 3: Coachmark CSS**

Append to `entrypoints/content/content.css`:

```css
#wm-coach {
  position: fixed;
  right: 20px; bottom: 20px;
  width: 280px;
  padding: 16px;
  background: rgba(20, 24, 35, 0.95);
  border: 1px solid rgba(125, 249, 255, 0.28);
  border-radius: 14px;
  color: #e7ecf3;
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  display: flex; flex-direction: column; gap: 8px;
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 220ms ease, transform 220ms cubic-bezier(0.18, 1.25, 0.4, 1);
  z-index: 2147483647;
}
#wm-coach.visible { opacity: 1; transform: translateY(0); }
#wm-coach .step { font-size: 13px; }
#wm-coach .tip { font-size: 12px; color: #8a93a6; margin-top: 4px; }
#wm-coach kbd {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 16px; height: 18px; padding: 0 5px;
  background: rgba(125, 249, 255, 0.12);
  border: 1px solid rgba(125, 249, 255, 0.22);
  border-radius: 5px;
  font-family: inherit; font-size: 11px; color: #e7ecf3;
}
#wm-coach button {
  align-self: flex-end;
  margin-top: 4px;
  appearance: none;
  background: rgba(125, 249, 255, 0.12);
  border: 1px solid rgba(125, 249, 255, 0.28);
  color: #e7ecf3;
  border-radius: 8px;
  padding: 6px 12px;
  font: 600 12px inherit;
  cursor: pointer;
}
#wm-coach button:hover { background: rgba(125, 249, 255, 0.2); }
```

- [ ] **Step 4: Append keyboard shortcuts section to the help page**

Open `entrypoints/help/index.html`. Find a good insertion point near the existing keyboard hints (search for `<kbd>` or `Esc`). Add a new section before the closing of `<main>` (or near the end of the document body content):

```html
<section class="shortcuts">
  <h2>Keyboard shortcuts</h2>
  <table>
    <tr><th>Key</th><th>What it does</th></tr>
    <tr><td><kbd>Alt</kbd>+<kbd>⇧</kbd>+<kbd>M</kbd></td><td>Enter selection mode (same as wiggle)</td></tr>
    <tr><td><kbd>⏎</kbd></td><td>Commit selection → open Magic sheet</td></tr>
    <tr><td><kbd>Esc</kbd></td><td>Cancel selection or close sheet</td></tr>
    <tr><td><kbd>×</kbd> on a chip</td><td>Remove that pick (in sheet: marks answer stale)</td></tr>
  </table>
</section>
```

If the help page already has unrelated `<style>` for tables / sections, the section will inherit. Otherwise add minimal inline CSS to the existing `<style>` block, e.g.:

```html
<style>
  /* … existing styles … */
  .shortcuts table { border-collapse: collapse; margin-top: 8px; }
  .shortcuts th, .shortcuts td { padding: 6px 12px; border: 1px solid #222838; text-align: left; }
  .shortcuts th { background: rgba(125,249,255,0.05); }
  .shortcuts kbd {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 16px; height: 18px; padding: 0 5px; margin: 0 2px;
    background: rgba(125, 249, 255, 0.1);
    border: 1px solid rgba(125, 249, 255, 0.22);
    border-radius: 5px;
    font-family: inherit; font-size: 11px;
  }
</style>
```

(If `entrypoints/help/index.html` already has a `<style>` block, add to it; otherwise add a small one in `<head>`.)

- [ ] **Step 5: Type-check, build, manual test**

```bash
pnpm compile && pnpm build
```

Reload. In DevTools console:

```js
chrome.storage.local.remove('wm:first-run');
```

Reload the page. Wiggle → coachmark appears bottom-right after activation. Click "Got it" → it slides away, `wm:first-run` is set.

Run `chrome.storage.local.remove('wm:first-run')` again, reload, wiggle, pick something, press Enter → coachmark auto-dismisses on commit.

Click the toolbar popup's `?` icon → help page opens; scroll to "Keyboard shortcuts" → table is present.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/content/index.ts entrypoints/content/content.css entrypoints/help/index.html
git commit -m "feat(onboarding): first-run coachmark + help-page keyboard shortcuts"
```

---

## Task 15: Final verification

**Files:**
- None to modify (verification only).

- [ ] **Step 1: Type-check the whole project**

```bash
pnpm compile
```

Expected: exit 0.

- [ ] **Step 2: Production build**

```bash
pnpm build
```

Expected: produces `.output/chrome-mv3/`; no errors.

- [ ] **Step 3: Cross-site smoke test**

Reload the extension. Walk through this checklist on three sites — one content-heavy (Wikipedia), one media-heavy (Unsplash search), one SPA (Gmail or Twitter):

- [ ] Wiggle → glow + cursor swap + edges aurora.
- [ ] Hover preview shows resolved (not literal) element, with tag badge.
- [ ] Click two paragraphs → chip bar appears top-of-viewport with both chips.
- [ ] Press `Alt+Shift+M` from idle on a fresh tab → enters selection mode same as wiggle.
- [ ] `Esc` while selecting → exits cleanly.
- [ ] Pick 2 elements + Enter → sheet opens; chip bar moved inside header; Summarize + Compare both visible; backend pill shows correct backend.
- [ ] Click Summarize → streams; Save writes a `MemoryEntry` with `action: 'summary'`.
- [ ] Click Compare → streams; Save writes `action: 'compare'`.
- [ ] Type in Ask + Enter → streams; Save writes `action: 'ask'`.
- [ ] Click `×` on a sheet chip after an answer exists → stale banner appears; answer stays visible.
- [ ] Click Rerun → answer regenerates over the old one; banner hides.
- [ ] Click `×` on the last chip → sheet closes.
- [ ] Open popup → entries listed with no action buttons / no variant chips.
- [ ] Pre-Spec-1 entries (if any) still render their `answer` correctly.
- [ ] Trigger `byok-no-key` error (Options → byok, clear key) → structured error UI in the sheet with an "Add key" button.
- [ ] First-run only: clear `wm:first-run` in storage, wiggle on a fresh page → coachmark appears.

- [ ] **Step 4: Confirm no console errors**

Open DevTools on each test site, wiggle + pick + commit + Summarize + Rerun. The console should show no `[wiggle-magic]` errors during normal flow. The only acceptable warnings are model-availability messages from Chrome AI APIs.

- [ ] **Step 5: Commit the smoke-test note (if anything broke and got fixed)**

If steps 3-4 surfaced bugs and you fixed them, make a final commit. Otherwise nothing to commit.

```bash
git log --oneline | head -20
```

Confirm the last ~14 commits tell a clear story.

---

## Acceptance criteria recap

A reviewer should be able to verify Spec 1 is done by walking the user stories:

- **US-1** Summarize across non-contiguous picks: Task 7 implements; verified in Step 3 of Task 15.
- **US-2** Compare appears only at 2+ picks: Task 6 + Task 8; verified.
- **US-3** Free-text Ask: existing path retained; verified.
- **US-4** Save without variant-stacking: Task 10; verified by inspecting `wm_memory`.
- **US-5** Popup is browse-only: Task 2; verified.
- **US-6** Backend indicator: Task 11; verified.
- **US-7** `Alt+Shift+M` + onboarding: Task 13 + Task 14; verified.
- **US-8** Error states: Task 12; verified via byok-no-key + selection-too-big.
- **US-9** Stale + Rerun: Task 9; verified.

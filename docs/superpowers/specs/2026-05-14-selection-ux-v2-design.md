# Selection UX v2 — Design

**Status:** Draft for review
**Date:** 2026-05-14
**Scope:** Spec 1 of the post–build-modernization roadmap. Reshapes the in-page selection experience and the saved-memory popup. Out of scope: backend changes, agentic actions, cross-tab selection, threaded chat.

## 1. Positioning

> **Selective AI for the web — point at the parts that matter, get an answer about just those.**

We compete against copy-pasting into a ChatGPT tab, not against Chrome's built-in "Ask about this page." The wiggle gesture plus multi-element picking is the differentiator: the user gestures to enter a mode, picks two or three specific elements that matter (even when they're not adjacent), and gets one cohesive answer about exactly those.

**One persona — "the triager":** a power-user knowledge worker who reads and triages a lot on the web. The two verbs they need are *summarize across what I picked* and *compare what I picked*. Everything else is an escape hatch.

## 2. User stories

| ID | Story |
|---|---|
| US-1 | Summarize whatever I picked, even when picks aren't adjacent — one cohesive answer. |
| US-2 | When I pick 2+ comparable items, offer "Compare these" without me typing it. |
| US-3 | Let me ask a free-form question about my selection. |
| US-4 | Save the answer I'm looking at in one tap (active variant only — no variant stacking). |
| US-5 | Browse what I saved in the toolbar popup; no transforms there. |
| US-6 | Tell me when my content is on-device (Nano) vs leaving (BYOK). |
| US-7 | Onboard me to the gesture and give me `Alt+Shift+M` as a co-equal entry. |
| US-8 | When something goes wrong (Nano not ready, page blocked, stream failed, selection too big), tell me why and what to do. |
| US-9 | Refine selection inside the sheet — `×` an item; mark answer stale; offer Rerun. |

**Explicitly cut from scope:** Translate / Explain / Bullets / Shorter as standalone actions; variant-stacking on save; threaded chat; cross-tab selection; agentic actions.

## 3. Architecture

Reorganize `entrypoints/content/index.ts` internally into named module-style sections within the existing `defineContentScript({ main() { … } })` IIFE. **No new files.** No build-step changes.

```ts
defineContentScript({ main() {
  // shared scaffolding: refs, cursor coords, settings

  const wiggle  = { onMove, detect };                                   // pure detection
  const overlay = { paintCursor, paintHighlight, spawnBurst,            // visual paint
                    mountChipBar, unmountChipBar, renderChipBar };
  const picker  = { activate, deactivate, commit,                       // selection mode
                    picks, add, remove, removeInSheet, clear,
                    resolveTarget, hoverPreview, mode };
  const sheet   = { show, close, onChipRemove,                          // Magic UI
                    markStale, rerun, askAI, save, copy, showError,
                    activeAction, stale };
  // ai + settings unchanged

  // bindings at bottom, dispatch to modules
}});
```

### 3.1 State ownership

- `picker.picks: Array<Pick>` is the single source of truth. `Pick = { id, el, role, label, payload }`.
- `picker.mode: 'idle' | 'selecting' | 'sheet'` — global selection-state machine.
- `picker.hover: { el, resolved, rect } | null` — recomputed on `mousemove` when `mode === 'selecting'`.
- `sheet.stale: boolean` — owned by sheet; set when picks change while an answer exists.
- `sheet.activeAction: 'summary' | 'compare' | 'ask' | null` — the last hero action that produced the current answer.

### 3.2 Cross-module calls

- `picker.commit()` → `sheet.show(picker.picks)` + `overlay.unmountChipBar()` + remount the chip bar inside the sheet header.
- `sheet.onChipRemove(id)` → `picker.removeInSheet(id)` → calls `picker.remove(id)`; if `sheet.activeAction !== null`, set `sheet.stale = true`.
- `sheet.rerun()` → re-invokes `sheet.activeAction` with current `picker.picks`; resets `stale` on completion.

No event bus, no shared globals beyond module objects. Plain function calls.

## 4. Picking UX

### 4.1 Hover preview (during `mode === 'selecting'`)

On `mousemove`:

1. `document.elementFromPoint(x, y)` finds the leaf under the cursor; skip if inside `#wm-root`.
2. `picker.resolveTarget(leaf)` walks up to the nearest semantic ancestor (algorithm below).
3. Paint a dashed outline of the **resolved** target's bounding rect.
4. Render a tiny tag-label badge at the top-left of the bbox: `<p>`, `<img>`, `<article>`, `<a>`, etc. Single line, ~16 chars max.

If the resolved target is already in `picks`, swap the dashed outline for a filled one (so the user sees it's picked; clicking again removes it).

### 4.2 Smart-escalate algorithm

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
    // Don't escalate into giant containers (avoid grabbing an <article> with
    // 80 children when the user clicked one paragraph).
    if (cur.parentElement && cur.parentElement.children.length > 30) return cur;
    cur = cur.parentElement;
  }
  return el; // literal fallback
}
```

Examples:
- Click a `<span>` inside a `<p>` → picks the `<p>`.
- Click an `<img>` inside a `<figure>` → picks the `<figure>`.
- Click text in a plain `<div>` with no semantic ancestor → picks that `<div>`.
- Click a paragraph inside an `<article>` with 80 sibling paragraphs → picks the paragraph, not the article.

### 4.3 Top viewport chip bar

A `position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;` strip. Mounts when `picks.length` transitions 0 → 1; unmounts when it transitions back to 0.

Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│ ✦ 3 picked  [¶ "The article…" ×] [¶ "But critics…" ×] [→ "Cont…"]│ Press ⏎
└──────────────────────────────────────────────────────────────────┘
```

- ~38px tall, `rgba(20,24,35,0.92)` background, `backdrop-filter: blur(8px)`.
- Each chip: type-icon prefix (`¶` text / `🖼` image / `🔗` link / `→` button) + truncated label (~24 chars) + `×`.
- The `×` removes that pick; if length reaches 0, the bar unmounts.
- Chip strip scrolls horizontally on overflow; "Press ⏎" hint stays pinned on the right.
- Mount/unmount: 200 ms slide from/to top.

### 4.4 What's removed from the current UX

- The cursor-following `#wm-popover` (`Magic ⏎ N` pill) is removed. Commit affordance now lives in the right edge of the top chip bar plus the `Enter` key.
- The cursor stays clean during selection — no floating count badge.

What stays unchanged: custom magic cursor, spark/ring burst on commit, per-element persistent outline markers, `body.wm-active` page-dim.

## 5. Sheet redesign

### 5.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ✦ Magic                                  Nano · on-device  × │  header
├──────────────────────────────────────────────────────────────┤
│ [¶ "The article…" ×] [¶ "But critics…" ×] [→ "Continue" ×]   │  chip bar (remounted)
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌──────────────────┐                    │
│  │ ✦ Summarize    │  │ ⇄ Compare these  │   contextual,      │
│  └────────────────┘  └──────────────────┘   only when 2+     │
│                                                              │
│  Ask anything about your selection…           [ Ask ⏎ ]      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ── answer stream area (markdown, rendered) ──               │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ ⚠ Selection changed — answer may be stale     [ Rerun ↻ ]    │  US-9 banner
├──────────────────────────────────────────────────────────────┤
│                              [ Copy ]  [ Save ]              │  footer (after answer)
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Sheet states

The sheet cycles through three states:

1. **Empty** — no answer yet. Hero actions visible. Footer hidden.
2. **Streaming** — answer area shows incremental markdown. Hero actions disabled (greyed). The active action's label is replaced by a Stop button.
3. **Answered** — answer area populated. Footer shows `Copy` + `Save`. If picks change after this point, the stale banner appears.

### 5.3 Hero action ordering and behavior

The empty-state row is two pill-shaped action buttons plus one input, in this order:

| Action | When shown | Behavior |
|---|---|---|
| **Summarize** | Always | Calls the Summarizer API; falls back to Prompt API with a summarize-of-selection prompt if Summarizer is unavailable or BYOK. |
| **Compare these** | Only when `picks.length >= 2` | Calls the Prompt API with a compare prompt over each pick's payload. Disabled with tooltip if all picks resolve to non-comparable types. |
| **Ask** (input) | Always | Free-text question. Submits on `Enter` or via the button. |

Focus order: Summarize → Compare → Ask input. `1` / `2` shortcuts focus Summarize / Compare. `/` focuses the input.

### 5.4 Stale + Rerun (US-9)

`sheet.stale` is `false` initially. It becomes `true` when a chip's `×` is clicked **while `sheet.activeAction !== null`** (an answer exists). `picker.removeInSheet(id)` is the entry point that flips this flag.

When `stale === true`:
- A banner appears between answer and footer: `⚠ Selection changed — answer may be stale   [ Rerun ↻ ]`.
- The answer is **not** cleared.
- `Rerun` re-invokes `sheet.activeAction` with current `picker.picks`. The stream replaces the old answer in-place; `stale` resets to `false`.

The banner does **not** appear if removing a chip drops `picks.length` to 0 — in that case the sheet closes entirely (no selection left to operate on).

### 5.5 Save flow change (US-4 — variant-stacking cut)

**Current behavior:** Saving generates four variants (Summarize / Shorter / Bullets / Translate) and stores them on `SavedSelection.variants`. Popup renders four buttons to switch between variants.

**New behavior:**
- `Save` stores only the currently visible answer plus the picks that produced it. No variant generation; no `variants` array on new entries.
- `SavedSelection.variants` field is **deprecated**; storage reads the field for backward compatibility with previously-saved entries but never writes it. New entries omit it.

`MemoryEntry` payload after Spec 1:

```ts
{
  id, ts, host, url, q,                          // unchanged
  a: string,                                     // active answer at save time
  action: 'summary' | 'compare' | 'ask',         // which hero produced it
  picks: SavedPick[],                            // unchanged shape (snapshot)
  // variants: removed for new writes
}
```

### 5.6 Header backend indicator (US-6)

Top-right of the sheet header, next to `×`: a small pill that reads `Nano · on-device` (green dot) when the active model is Gemini Nano, or `OpenAI · cloud` / `Anthropic · cloud` / `Gemini · cloud` (amber dot) when BYOK. Source: `settings.modelPref` plus a runtime `LanguageModel.availability()` check. Click → opens the options page anchored to the model section.

## 6. Memory popup stripdown (US-5)

The popup becomes browse-only. All transforms move to the in-page sheet.

`entrypoints/popup/index.html` (`#row-tpl`):
- Remove the `<div class="actions-row">` block (four `<button class="action">` + `<span class="action-status">`).
- Remove the `<div class="variants" hidden>` block (variant switcher).
- Keep `.row-head` (host/when/delete), `.q` (question), `.a` (answer), `.src` (selection details).

`entrypoints/popup/main.ts`:
- Remove the action-button click handlers and the in-popup AI invocation paths.
- Remove the variant switching logic.
- Read `entry.a` directly into `.a` via `renderMarkdownInto`.
- Old entries that contain `variants` still render correctly because storage always wrote `entry.a` alongside, so the read path is backward compatible.

## 7. Keyboard map

All bindings are captured at the content-script level with `addEventListener('keydown', …, { capture: true })` so the page's own handlers don't swallow them.

| Key | `idle` | `selecting` | `sheet` |
|---|---|---|---|
| `Alt+Shift+M` | Enter `selecting` (co-equal to wiggle) | No-op (already selecting) | Close sheet, re-enter `selecting` |
| `Esc` | — | Exit `selecting`, clear picks | Close sheet, picks cleared |
| `Enter` | — | Commit if `picks.length ≥ 1` → open sheet | Submit the Ask input if focused; otherwise Summarize if picks present |
| `1` | — | — | Focus / trigger Summarize |
| `2` | — | — | Focus / trigger Compare (no-op if `picks < 2`) |
| `/` | — | — | Focus Ask input |
| `Tab` | — | — | Cycle: Summarize → Compare → Ask input → answer area → footer |
| `Cmd/Ctrl+S` | — | — | Save (when an answer exists) |
| `Cmd/Ctrl+C` (no text selected) | — | — | Copy answer |
| `Cmd/Ctrl+Enter` | — | — | Rerun (when `stale === true`) |
| `Backspace` (on focused chip) | — | Remove focused chip | Remove focused chip → set stale |

Wiggle and `Alt+Shift+M` are co-equal entries — both call `picker.activate()`. Wiggle is for discovery; the shortcut is for power-user retention.

## 8. Error and empty states (US-8)

All error UI is a single component, `sheet.showError({ code, title, body, primaryAction?, secondaryAction? })`. Errors replace the answer area when the sheet is open, or replace the chip bar contents when raised pre-commit.

| Code | Title | Body | Primary action |
|---|---|---|---|
| `nano-unavailable` | "On-device AI isn't ready" | "Gemini Nano needs Chrome 138+ and a one-time model download." | "Set up Nano" → opens `options.html#models` |
| `nano-downloading` | "Model still downloading" | "Nano is X% downloaded. Tap retry once it finishes, or switch to a cloud model." | "Retry" / "Use cloud model" |
| `byok-no-key` | "Add an API key to use cloud" | "You picked {provider} but no key is saved." | "Add key" → `options.html#byok` |
| `stream-failed` | "The model stopped mid-answer" | Inline `{providerErrorMessage}` if safe to show. | "Try again" |
| `selection-too-big` | "That selection is too long" | "We capture up to ~16k characters across picks (Nano's window); you've picked ~{n}. Remove a chip and try again." | (no primary; user removes chips) |
| `page-blocked` | "Can't run on this page" | "{host} blocks extension content scripts." | "Open in a new tab" |
| `no-picks` (chip-bar inline) | — | "Pick at least one element first." | — |

`selection-too-big` is the only error that prevents commit; the rest surface inside the sheet. Errors are dismissable via `×` — returns to the empty state if no answer existed, or to the previous answer if one did.

## 9. Onboarding (US-7)

**First-run flow** (triggered when `chrome.storage.local.get('wm:first-run')` is unset):

A single non-modal coachmark overlay appears the first time the user wiggles on any page:

```
┌─────────────────────────────────────┐
│ ① Wiggle your cursor — already!     │
│ ② Click anything to pick it.        │
│ ③ Press Enter to ask.               │
│                                     │
│ Tip: Alt+Shift+M does the same.     │
│                          [ Got it ] │
└─────────────────────────────────────┘
```

- Positioned bottom-right, ~280px wide, dismissable.
- "Got it" sets `wm:first-run = false`.
- Auto-dismisses after the first successful commit, whether or not the user clicked Got it.

**Help page (`entrypoints/help/`)** gets a "Keyboard shortcuts" section that mirrors §7.

No tooltip on subsequent visits — discovery is one-shot. The only persistent reminder is the `Nano · on-device` pill in the sheet header.

## 10. Testing notes

Spec 1 is UI-heavy and the codebase has no test harness yet. The implementation plan should include:

- Manual test script: a checklist of the user stories (US-1 through US-9) with reproduction steps and expected behavior.
- Visual smoke test on three site classes: a content site (article with prose), a media-heavy site (image grid), and a SPA (Gmail / Twitter-style).
- Backward-compatibility check: previously-saved entries with `variants` must still render correctly in the stripped-down popup.

A real automated harness (Playwright against the unpacked extension) is out of scope for this spec.

## 11. Open questions

None blocking. Resolved during brainstorming:
- Chip bar location: **top viewport pinned strip** (vs. near-cursor popover or bottom dock).
- Element resolution: **smart-escalate to nearest semantic ancestor** (vs. literal hover or click-up-tree).
- Refinement rerun: **mark stale + manual Rerun** (vs. auto-rerun or wipe).
- Compare entry point: **contextual chip** that appears at 2+ picks (vs. always-visible standing button).
- Architecture: **module-within-file** (vs. multi-file split).

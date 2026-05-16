# Sidebar & Pluggable Actions — Design

**Status:** Draft for review
**Date:** 2026-05-16
**Scope:** Rebuild of the post-commit Magic surface. Replaces the bottom-centered pill→sheet morph (v2.1) with a right-docked conversational sidebar, and reorganizes Magic actions into a pluggable registry with a built-in library and contextual surfacing.
**Supersedes:** The v2.1 sheet (commits since `cdd0171`).
**Builds on (keeps):** The wiggle gesture, smart-escalate target resolution, payload extraction, AI backend code, markdown rendering, and the saved-memory popup from Spec 1.
**Out of scope:** Wiggle detector tuning, picker UX, cross-tab threads, agentic actions, server-side anything, remote action marketplace, learned contextual ranker.

## 1. Positioning

> **Selective AI for the web — point at the parts that matter, converse about exactly those, with the right prompts already on hand.**

Two principles drive the rebuild:

1. **The sidebar is the primary interaction point.** It deserves first-class structure — a real conversation model, not an answer-div with messages grafted in.
2. **Prompt engineering is a feature, not a power-user tax.** AI-fluent users have learned that "ELI5," "find the counter-argument," "rewrite for clarity" are reusable lenses. Average users haven't. Wiggle Magic ships a curated library of these lenses as one-click **actions**, and surfaces the right one for the current selection contextually — the same "don't make me think" instinct that the wiggle gesture embodies for selection.

The picker stays — wiggle + smart-escalate + multi-pick — unchanged from Spec 1. What follows is everything after `picker.commit()`.

## 2. User stories

| ID | Story |
|---|---|
| US-1 | After committing my picks, a right-docked sidebar opens with my picks as chips and the most relevant actions one tap away. |
| US-2 | When I come back to the same page later, my conversation about it is still there. |
| US-3 | I can run a *prompt engineering* action (ELI5, counter-argument, find the flaw, pros/cons, …) without writing any prompt — they're in the library, one tap to enable. |
| US-4 | The right action for *this* selection appears first — code → "Explain this code"; two products → "Compare"; a paragraph → "Summarize". |
| US-5 | I can write my own actions in plain-language prompts and pick when they show up. I can share them as a JSON file. |
| US-6 | After Magic answers, every claim is anchored to the picks that produced it — clicking a back-reference scrolls me to that element. |
| US-7 | I can add more picks mid-conversation (`+ Add`) without losing the sidebar; new picks attach to my next turn. |
| US-8 | I can save a single Magic turn as a keepsake; the conversation as a whole is scratch I can return to. |
| US-9 | I get a clear "may be stale" cue when I've changed picks after an answer was generated, with one-tap Rerun. |
| US-10 | I can drive the whole sidebar from the keyboard: slash for actions, `1`-`9` for heroes, `Cmd+Enter` to rerun, `Cmd+S` to save. |

## 3. Lifecycle & geometry

### 3.1 State machine

```
idle ──wiggle / Alt+Shift+M──▶ selecting ──⏎ commit──▶ sidebar
  ▲                              │                       │
  │                              └──Esc──┘               │
  │                                                      │
  └──────────────close (×) / Esc────────────────────────┘
                                                         │
                                                  wiggle / +Add
                                                         ▼
                                                  sidebar+selecting
                                                         │
                                                       ⏎/Esc
                                                         ▼
                                                      sidebar
```

`Mode = 'idle' | 'selecting' | 'sidebar' | 'sidebar+selecting'`.

The `sidebar+selecting` substate is the `+Add` flow: sidebar stays mounted, the bottom-center pill returns for staging, new picks attach to the composer's staging chips (not to existing turns above).

### 3.2 Sidebar geometry

- `position: fixed; top: 0; right: 0; bottom: 0;`
- Default width **420px**; user-resizable 320–600 via a drag handle on the left edge.
- Width persisted per-origin (`wm:sidebar-width:<origin>`).
- **Pushes the page** via injected style: `html { margin-right: var(--wm-sidebar-w); transition: margin-right 240ms cubic-bezier(0.4, 0, 0.2, 1); }`. Sites with `position: fixed` headers expose `--wm-sidebar-w` as a CSS variable they can opt into; the default behavior is a best-effort `right` inset adjustment, with hardcoded-viewport layouts documented as a known limitation.
- Mount animation: page slides left (240ms); sidebar slides in from right (300ms) with a subtle gradient halo (`#7df9ff → #b07cff → #ff7ad9`).
- Close: `×` button, `Esc` (when no other element has focus), or wiggle outside the sidebar.

### 3.3 Selection-state pill

Unchanged in spirit from today. Bottom-center, 320×56, "X picked · press ⏎". The pill no longer morphs into a sheet — commit dismisses the pill and opens the sidebar. Renamed from `#wm-sheet` (collapsed form) to a dedicated `#wm-pill` element.

### 3.4 Thread restoration

On `commit`, the thread store looks up `wm:thread:<origin><pathname>`. If a thread exists and `now - lastTouchedAt < 7 days`:

- Restore turns into the sidebar.
- Prepend a system banner: `↻ Continuing your previous conversation about this page. [Start fresh]`.
- `Start fresh` archives the current thread (kept in storage; never auto-restored again on this URL) and clears the conversation.

Older than 7 days: silent archive — banner does not appear. Future "Recent threads" UI (out of scope) reads the archived set.

## 4. Conversation model

### 4.1 Types

```ts
type ThreadId = string;                          // `${origin}${pathname}`
type TurnId = string;                            // ulid

interface PickRef {
  id: string;
  type: 'text' | 'img' | 'link' | 'control' | 'media';
  tags: string[];                                // 'code', 'table', 'price', 'video', etc.
  label: string;                                 // truncated for chip display
  selector: string;                              // CSS path for re-locate
  payload: Payload;                              // full payload, kept for reruns
}

interface UserTurn {
  id: TurnId;
  role: 'user';
  kind: 'hero' | 'ask';
  actionId: string;                              // resolved against the registry at run time
  text?: string;                                 // present for 'ask', absent for hero
  modifiers: string[];                           // modifier ids applied
  picks: PickRef[];                              // snapshot at submit time
  ts: number;
}

interface MagicTurn {
  id: TurnId;
  role: 'magic';
  inReplyTo: TurnId;                             // matching UserTurn
  answer: string;                                // markdown
  sources: PickRef[];                            // denormalized for chip-back-refs
  status: 'streaming' | 'done' | 'error';
  errorCode?: string;
  backend: 'nano' | 'openai' | 'anthropic' | 'gemini';
  ts: number;
}

type Turn = UserTurn | MagicTurn;

interface Thread {
  id: ThreadId;
  origin: string;
  pathname: string;
  title: string;                                 // from <title> at first turn
  turns: Turn[];
  createdAt: number;
  lastTouchedAt: number;
}
```

### 4.2 Persistence

`chrome.storage.local` keys:

```
wm:thread:<origin><pathname>   →  Thread
wm:thread-index                →  Array<{ id, lastTouchedAt, title, archived }>
wm:thread-archive:<id>         →  Thread                (after `Start fresh`)
wm_memory                      →  Array<MemoryEntry>    (existing; unchanged key + shape)
wm:sidebar-width:<origin>      →  number
```

**Caps**:
- 50 active threads max (LRU eviction by `lastTouchedAt`).
- 20 turns per active thread (FIFO eviction with banner: "Older turns trimmed").
- Archived threads not capped in v1; future work to bound.

**Restoration window**: 7 days.

### 4.3 Save semantics

Per-turn, not per-thread. Every Magic turn has its own `[Save]` button. Saving copies into `wm_memory` (the existing storage key used by the popup):

```ts
{
  id, ts, host, url,
  q: <user turn's text, or action.label for hero turns>,
  a: <magic turn's answer>,
  action: actionId,
  picks: <magic turn's sources>,
}
```

The popup memory browser is unchanged. Threads are the conversational scratchpad; MemoryEntries are deliberate keepsakes.

## 5. Pluggable actions

### 5.1 Types

```ts
interface ActionDef {
  id: string;                                    // 'summarize', 'eli5', 'counter-argument'
  label: string;
  icon?: string;                                 // built-in icon name or single emoji
  source: 'builtin-core' | 'builtin-library' | 'user';
  surface: ('hero' | 'slash')[];                 // where it can appear
  acceptsFreeText: boolean;                      // ask-style actions
  acceptsModifiers: string[];                    // modifier ids it composes with
  availableWhen: AvailabilityRule;
  prompt: PromptTemplate;
  apiPreference: ApiPref;                        // 'summarizer' | 'prompt' | 'translator'
  fallback?: ApiPref[];
  description?: string;                          // plain-English; required for library entries
  tags?: ActionTags;                             // for contextual ranking
  examples?: Array<{ input: string; output: string }>;
}

interface ModifierDef {
  id: string;                                    // 'bullets', 'shorter'
  label: string;
  surface: ('slash' | 'inline')[];
  promptAddendum: string;
}

type AvailabilityRule =
  | { kind: 'always' }
  | { kind: 'minPicks'; n: number }
  | { kind: 'pickTypesIncludes'; types: PickRef['type'][]; minCount?: number }
  | { kind: 'pickTagsIncludes'; tags: string[]; minCount?: number }
  | { kind: 'and'; rules: AvailabilityRule[] };

interface PromptTemplate {
  system?: string;
  user: string;                                  // supports {{selections}} {{question}} {{title}} {{url}} {{lang}}
}

interface ActionTags {
  picksContains?: ('text' | 'img' | 'link' | 'code' | 'table' | 'price' | 'video')[];
  pageType?: ('article' | 'product' | 'code-host' | 'social' | 'media')[];
  language?: string[];
}

interface ActionContext {
  picks: PickRef[];
  thread: Thread | null;
  backend: Backend;
  pageMeta: { host: string; title: string; primaryLang: string; pageType?: string };
}
```

### 5.2 Registry API

The single consumer-facing surface for the rest of the codebase:

```ts
interface ActionRegistry {
  // Read
  getVisibleHeroes(ctx: ActionContext): ActionDef[];   // ordered after ranker
  getSlashOptions(ctx: ActionContext): ActionDef[];
  getById(id: string): ActionDef | null;
  getModifiers(): ModifierDef[];
  getLibrary(): ActionDef[];                            // catalog (not necessarily enabled)

  // Mutate (called from options page or migration only)
  enableFromLibrary(id: string): Result;
  registerUser(def: ActionDef): Result;                 // user-authored
  unregister(id: string): Result;
  setHeroOrder(ids: string[]): void;
  setHidden(ids: string[]): void;

  // Contextual ranking seam — v1 returns user pin order; v2 swaps in learned ranker.
  rankForContext(ctx: ActionContext, candidates: ActionDef[]): ActionDef[];
}
```

### 5.3 Built-in core actions

Always present, cannot be unregistered (but can be unpinned from hero).

| id | surface | acceptsFreeText | availableWhen | API | Description |
|---|---|---|---|---|---|
| `summarize` | hero + slash | no | `minPicks(1)` | summarizer → prompt | "One cohesive summary across the selections." |
| `compare` | hero + slash | no | `and([minPicks(2), pickTypesIncludes({text,img,link,media}, 2)])` | prompt | "Side-by-side comparison across two or more comparable items." |
| `ask` | composer slot | yes | `minPicks(1)` | prompt | Free-text question about the selections. |

Built-in **modifiers**: `bullets` (slash + inline chip), `shorter` (inline chip only; only available when a previous Magic turn exists in the thread).

### 5.4 Action library

In-bundle catalog (`src/lib/actions/library.ts`) shipping these entries for v1:

| id | Label | When it shines |
|---|---|---|
| `eli5` | ELI5 | Jargon-heavy articles, legal/medical/technical content |
| `counter-argument` | Counter-argument | Opinion pieces, persuasive writing |
| `find-the-flaw` | Find the flaw | Logical claims, technical proposals |
| `pros-cons` | Pros & cons | Decisions, product comparisons, life choices |
| `rewrite-clearly` | Rewrite for clarity | Confusing paragraphs, dense prose |
| `action-items` | Extract action items | Meeting notes, long memos, email threads |
| `followup-questions` | Generate questions | Research, learning, interview prep |
| `explain-code` | Explain this code | Code blocks (auto-surfaces when `code` tag present) |
| `suggest-headline` | Better headline | Articles where the headline buried the lede |

Each library entry is a fully populated `ActionDef` with `source: 'builtin-library'`, a curated prompt template, an icon, a description, examples, and contextual tags. Users see them in **Options → Actions → Library**, one tap to enable.

Enabled library entries are stored in `wm:actions:enabled-library: string[]` (just ids — definitions live in-bundle). Updates to library prompts ship with extension updates.

### 5.5 Smart contextual surfacing

The picker is extended to attach **tags** to picks beyond the five `type` values:

| Tag | Detection |
|---|---|
| `code` | Element is `<pre>`, `<code>`, or descendant with `class*=hljs|prism|highlight` |
| `table` | Element is `<table>` or `role=grid` |
| `price` | innerText matches currency regex `/[$€£¥₹]\s?\d/` |
| `video` | Element is `<video>` or matches known video-embed selectors |
| `long` | innerText length > 1500 chars |
| `short` | innerText length < 200 chars |

The v1 ranker (`lib/actions/ranker.ts`) is rule-based. Hero selection is **user-pin-driven**, ranker-ordered:

1. Filter to candidates whose `availableWhen` passes for `ctx`.
2. Split into hero-eligible (id is in `wm:actions:hero`) and slash-only.
3. For hero-eligible candidates: compute a score by counting tag matches between `ActionDef.tags` and the union of `ctx.picks[*].tags` plus `ctx.pageMeta.pageType`.
4. Sort by score (desc), then user pin order (asc), then label (asc) for stability.
5. Up to **4** heroes render visibly. If the user has pinned more than 4, the lowest-ranked overflow for *this context* moves to the slash menu only (not hidden — still discoverable). Display cap protects layout sanity without surprising the user who pinned them.

Built-in `summarize` always passes any availability check on `minPicks(1)`, so it is the safety net when nothing else qualifies.

The ranker is intentionally one function with one signature: replacing it with a learned model in v2 is a single-file change.

### 5.6 User-authored actions

Stored in `wm:actions:user`. Created via **Options → Actions** (new tab) with an editor:

```
Options → Actions

Built-in core
  ✦ Summarize        [hero ✓] [slash ✓]
  ⇄ Compare          [hero ✓] [slash ✓]
  ¶ Ask              [composer]

From the library                                       [Browse library →]
  🔍 ELI5            [hero  ] [slash ✓]  [Edit] [Disable]
  ⚖ Counter-argument [hero ✓] [slash ✓]  [Edit] [Disable]

Custom                                                 [+ New action]
  🌐 "Translate ES"  [hero  ] [slash ✓]  [Edit] [Delete]

Hero order (drag to reorder):
  1. Summarize    2. Compare    3. Counter-argument

[Export actions JSON]   [Import actions JSON]
```

The editor form:

```
Name:            [ELI5                                              ]
Icon:            [🔍] (single emoji or pick from library)
Description:     [Explain like I'm five.                            ]
Available when:  [Selection has ≥ 1 pick                          ▼]
Surface:         [✓] Hero    [✓] Slash command
Accepts:         [✓] Bullets   [✓] Shorter
Prompt:
┌──────────────────────────────────────────────────────────────────┐
│ Explain the following selections like I'm five years old.        │
│                                                                  │
│ {{selections}}                                                   │
│                                                                  │
│ Keep it under 150 words. Use vivid analogies.                    │
└──────────────────────────────────────────────────────────────────┘
Available placeholders:
  {{selections}}  {{question}}  {{title}}  {{url}}  {{lang}}

                                                  [Cancel] [Save]
```

**Validation** (`lib/actions/validate.ts`):

- `id` matches `^[a-z][a-z0-9-]{1,30}$`; uniqueness enforced.
- `label` non-empty, ≤ 40 chars.
- `prompt.user` non-empty; placeholders must be in the allowlist `{{selections, question, title, url, lang}}`.
- `availableWhen` rules well-formed; `apiPreference` in known set.
- Bad actions: surfaced inline in the editor with field-level errors; excluded from registry at load time.

**Sharing**: `[Export actions JSON]` emits `{ version: 1, actions: [...user actions...], libraryEnabled: [ids...], heroOrder: [...] }`. Import validates, shows a preview, and on confirm merges by id (collisions prompt overwrite/skip).

### 5.7 Caps and edge cases

- Soft cap: 25 enabled actions (warning above 25 about slash menu length).
- Hard cap: 50 enabled actions.
- Zero heroes pinned: hero row is hidden entirely; composer-only mode. (No empty-state CTA — keeps the UI clean for users who prefer slash.)
- Rerun on a Magic turn whose `actionId` is no longer registered: render `action-missing` error (§9), Rerun disabled, Save still available.

## 6. Composer & turns

### 6.1 Empty-thread layout (just committed)

```
┌─ Magic ─────────────── Nano · on-device ── × ─┐
│                                               │
│  Picks                                        │
│  [¶ "The article…" ×]                         │
│  [¶ "But critics…" ×]                         │
│  [+ Add]                                      │
│                                               │
│  [ ✦ Summarize ]    [ ⇄ Compare ]             │
│                                               │
│  ┌─────────────────────────────────────┐  ↗   │
│  │ Ask anything about your selection…  │      │
│  └─────────────────────────────────────┘      │
│                                               │
└───────────────────────────────────────────────┘
```

### 6.2 Mid-thread layout

```
┌─ Magic ─────────────── Nano · on-device ── × ─┐
│ ╭ You ──────────────────────────────────╮     │
│ │ Summarize · [¶ Article…] [¶ But cri…] │     │
│ ╰──────────────────────────────────────── ╯    │
│                                               │
│ ╭ ✦ Magic ──────────────────────────────╮     │
│ │ The article argues that…               │    │
│ │ ⋯                                      │    │
│ │ ──                                     │    │
│ │ Based on: [¶ Article…] [¶ But critics…│    │
│ │ [Save] [Copy] [↻ Rerun]                │    │
│ ╰──────────────────────────────────────── ╯    │
│                                               │
│ ──────────────────────────────────────────────│
│ Next turn                                     │
│ [¶ "But critics…" ×] [+ Add]                  │
│ + Summarize  + Compare  + Counter-argument    │
│  ┌─────────────────────────────────────┐  ↗   │
│  │ Ask a follow-up…                    │      │
│  └─────────────────────────────────────┘      │
└───────────────────────────────────────────────┘
```

After turn 1, the hero row collapses into a compact inline row (`+ Summarize  + Compare  + …`) above the composer. Composer chips show the picks staged for **the next turn** — independent of any turn already in the thread.

### 6.3 Composer behavior

- **Hero buttons**: clicking submits a `kind: 'hero'` user turn with the composer's current picks + active inline modifiers (the bullets/shorter chips, if user enabled them for the next turn).
- **Text input**: when non-empty, submitting (⏎ or send button) creates a `kind: 'ask'` user turn with `actionId: 'ask'`.
- **Slash menu**: typing `/` at the start of the input opens a `role="listbox"` autocomplete showing all registered actions that pass `availableWhen` for the current context, sorted by relevance (ranker output). Tab accepts the highlighted item and converts the input into action mode (the slash command is replaced by a small action chip in the composer; remaining text becomes the question, if the action `acceptsFreeText`). Enter submits.
- **+Add**: enters `sidebar+selecting` mode. Pill returns; new picks land in the composer's staging chips. ⏎ on the pill or `Esc` returns focus to the composer.
- **Modifier chips**: small toggleable chips (bullets, shorter) shown beneath the composer when their `availableWhen` passes. Pre-armed for the next turn; cleared after submission.

### 6.4 Turn rendering

**User turn** — compact card. Label = action label (`Summarize`, `Ask`) + truncated text preview (if `kind: 'ask'`). Chips for `picks` rendered inline. Modifiers shown as small badges (`• bullets`).

**Magic turn** — full card with sections in order:
1. Header: action icon + label + backend badge.
2. Answer body (rendered markdown), streams in as `status: 'streaming'`.
3. `Based on:` row — chip-back-references for `sources`.
4. Footer actions: `[Save]` `[Copy]` `[↻ Rerun]`. Save toggles to `Saved ✓` after success.
5. (If `stale`) inline badge: `↻ may be stale`.

**Chip-back-references**: clicking a back-ref chip:

```ts
function focusSource(ref: PickRef): void {
  const el = document.querySelector(ref.selector);
  if (!el) {
    chip.classList.add('missing');                   // strikethrough + tooltip
    return;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Pulse the per-element outline marker for 1.2s
  pulsePersistentMarker(el);
}
```

If the element is gone (DOM diffed since the answer was generated), the chip renders strikethrough with tooltip "Element no longer on page" — a visible signal that the answer's grounding may have drifted.

### 6.5 Stale signaling

Only the **most recent** Magic turn shows the "may be stale" badge, and only when the composer's current picks differ from the matching user turn's pick snapshot. Older Magic turns rely on their `Based on:` chip-back-references for stale signal (strikethrough on missing elements).

`Rerun` re-executes the matching user turn with its **original** `picks` snapshot (not the current composer picks). Replaces the Magic turn in place. No rerun history stack in v1.

## 7. Code architecture

### 7.1 File layout

```
src/lib/
  types/
    thread.ts            # Thread, UserTurn, MagicTurn, PickRef
    action.ts            # ActionDef, ModifierDef, AvailabilityRule, PromptTemplate, ActionContext
    payload.ts           # Payload (selection-time, transient)
  actions/
    registry.ts          # ActionRegistry singleton
    storage.ts           # load/save wm:actions:user, hero-order, hidden, enabled-library
    library.ts           # in-bundle library catalog
    builtins/
      summarize.ts
      compare.ts
      ask.ts
      modifiers.ts
      index.ts
    ranker.ts            # v1: rule-based (tag-match + user pin order)
    prompt-builder.ts    # placeholder interpolation
    validate.ts          # schema validation for user actions
    api-route.ts         # ApiPref → Summarizer | Prompt | Translator with fallback
  thread/
    store.ts             # per-URL thread persistence, LRU, restoration window
    operations.ts        # appendTurn, markStale, rerunTurn, promoteToMemory
  picker/
    detect-wiggle.ts     # pure wiggle math
    resolve-target.ts    # smart-escalate + tag classification
    extract-payload.ts   # element → Payload
  ai/
    backend.ts           # availability + capability detection
    stream.ts            # provider-agnostic streaming abstraction
  markdown.ts            # existing — unchanged
  chrome-ai.d.ts         # existing — unchanged

entrypoints/content/
  index.ts               # ~150 lines: lifecycle wiring only
  state.ts               # mode machine + typed event bus
  pill.ts                # bottom-center pill (selecting state)
  pill.css
  overlay.ts             # cursor + highlight + chipbar + ripples
  overlay.css
  sidebar/
    mount.ts             # create + attach + page-push CSS injection
    shell.ts             # header (title + backend pill + close) + layout scaffold
    turn-list.ts         # renders Turn[] into DOM
    turn-user.ts         # UserTurn → DOM
    turn-magic.ts        # MagicTurn → DOM (chip-back-refs, stale, footer actions)
    composer.ts          # input + hero row + slash autocomplete + +Add + staged chips
    slash-menu.ts        # autocomplete listbox
    chip.ts              # shared chip rendering
    sidebar.css

entrypoints/options/
  main.ts                # existing, extended with actions tab routing
  actions-editor.ts      # CRUD editor for user actions
  actions-library.ts     # browse + 1-click enable from library
  actions.css

entrypoints/popup/        # unchanged
entrypoints/background.ts # unchanged
entrypoints/help/         # unchanged
```

### 7.2 Dependency rules

Enforced via code review, not tooling, for v1:

- `lib/types/*` — leaf, no dependencies.
- `lib/actions/*`, `lib/thread/*`, `lib/picker/*`, `lib/ai/*` — depend only on `lib/types/*` + Chrome APIs. **No DOM imports.** Testable in isolation.
- `entrypoints/content/sidebar/*` — depends on `lib/*` + DOM. UI layer.
- `entrypoints/content/state.ts` — owns the `Mode` state machine and the typed event bus. The **only legal cross-module communication channel** between sidebar, pill, overlay, and picker.

### 7.3 Event bus

```ts
interface WmEvents {
  'mode:change':    { from: Mode; to: Mode };
  'picks:change':   { picks: Pick[]; source: 'selecting' | 'staging' };
  'commit':         { picks: Pick[] };
  'turn:submit':    { actionId: string; modifiers: string[]; text?: string; picks: PickRef[] };
  'turn:stream':    { turnId: string; chunk: string };
  'turn:done':      { turnId: string };
  'turn:error':     { turnId: string; code: string };
  'thread:loaded':  { threadId: string };
  'thread:archived':{ threadId: string };
}
```

The bus is a typed `EventTarget` wrapper in `state.ts`. Modules subscribe via `state.on('turn:submit', handler)` and emit via `state.emit('turn:submit', payload)`. Direct cross-module function calls are disallowed.

## 8. Keyboard map

| Key | idle | selecting | sidebar | sidebar+selecting |
|---|---|---|---|---|
| Wiggle / `Alt+Shift+M` | → selecting | — | → sidebar+selecting (= +Add) | — |
| `Esc` | — | exit selecting | close sidebar | exit staging |
| `⏎` | — | commit if `picks ≥ 1` → sidebar | submit composer if focused | commit staging → composer |
| `1`..`9` | — | — | trigger Nth visible hero (composer empty) | — |
| `/` | — | — | focus composer, open slash menu | — |
| `Tab` | — | — | accept slash completion / cycle focus | — |
| `↑` / `↓` | — | — | composer-empty: prior user turns into composer; slash open: navigate options | — |
| `Cmd/Ctrl+⏎` | — | — | rerun last Magic turn | — |
| `Cmd/Ctrl+S` | — | — | save focused Magic turn | — |
| `Backspace` (composer empty) | — | — | remove rightmost staged chip | remove rightmost staged chip |

All bindings captured at the content-script level with `addEventListener('keydown', …, { capture: true })`.

## 9. Errors

Single `errors` rendering helper used both by the sidebar (in-turn error replacement) and by the pill (pre-commit errors). Reuses the v2 spec's error table and extends it with two action-related codes:

| Code | Title | Body | Primary action |
|---|---|---|---|
| `nano-unavailable` | "On-device AI isn't ready" | "Gemini Nano needs Chrome 138+ and a one-time model download." | "Set up Nano" → `options.html#models` |
| `nano-downloading` | "Model still downloading" | "Nano is X% downloaded. Retry once it finishes, or switch to a cloud model." | "Retry" / "Use cloud" |
| `byok-no-key` | "Add an API key to use cloud" | "You picked {provider} but no key is saved." | "Add key" → `options.html#byok` |
| `stream-failed` | "The model stopped mid-answer" | Inline `{providerErrorMessage}` if safe. | "Try again" |
| `selection-too-big` | "That selection is too long" | "We capture up to ~16k characters across picks." | (no primary — user removes chips) |
| `page-blocked` | "Can't run on this page" | "{host} blocks extension content scripts." | "Open in a new tab" |
| `action-missing` | "Action no longer available" | "This action was removed. Open Options → Actions to enable or recreate it." | "Open Options" |
| `action-template-broken` | "Action template error" | "`{{placeholderName}}` isn't a valid placeholder. Edit this action." | "Edit action" |

Errors render with `role="alert"`. In-turn errors replace the Magic turn's answer body but leave the user-turn card, the chip-back-refs (if any partial answer streamed), and the footer Save/Copy intact (so the user can salvage what's there).

## 10. Accessibility

- `#wm-sidebar` → `role="complementary" aria-label="Magic conversation"`.
- Turn list → `role="log" aria-live="polite"` for streaming announcements.
- Each turn → `role="article"` with a visually-hidden heading "From you" / "From Magic".
- Backend pill → `aria-label="On-device AI"` / `"Cloud AI via {provider}"`.
- Slash menu → `role="listbox"` + `aria-activedescendant`.
- Composer chips with `×` → `role="button" aria-label="Remove pick: {label}"`.
- `Based on:` back-ref chips → `role="link" aria-label="Scroll to: {label}"`.
- **Focus management**: opening sidebar moves focus to composer input; closing returns focus to the last focused page element (saved in `state.ts` before sidebar open). Mode transitions emit a focus directive on the event bus.

## 11. Migration plan

The v2.1 sheet code is removed wholesale.

1. **Delete**: `#wm-sheet` element, `#wm-sheet-*` IDs, all `wm-sheet-*` CSS rules (~660 lines of CSS), the `sheet` module in `index.ts` (~600 lines of TS), and the sidebar-toggle button (the new sidebar is the only post-commit surface).
2. **Rename**: the existing selection-state pill (currently `#wm-sheet` in collapsed form) → dedicated `#wm-pill` element with its own CSS file.
3. **Relocate**: wiggle detector, `resolveTarget`, payload extraction, AI backend code, and markdown rendering into the `src/lib/` modules listed in §7.1. No behavior change in these pieces.
4. **Backward compatibility**:
   - `wm_memory` storage is unchanged (key matches the popup's existing convention; uses an underscore, not the colon prefix of the new `wm:*` keys). Existing saved memories render correctly in the popup.
   - New storage keys (`wm:thread:*`, `wm:thread-index`, `wm:actions:*`, `wm:sidebar-width:*`) are net-new — no migration needed.
5. **Seed on first run**: `wm:actions:hero = ['summarize', 'compare']`; `wm:actions:enabled-library = []` (users browse the library and opt in).
6. **Feature flag**: gate the new sidebar behind a single `wm:feature:sidebar-v3` boolean in `chrome.storage.local`, default `true` after the rebuild ships; lets us A/B during canary if needed. Removed in the release after the rebuild.

## 12. Testing notes

The codebase has no automated test harness yet. The library-style modules in `lib/` are now structured for unit tests (no DOM dependencies). The implementation plan should add:

- **Unit tests** (Vitest, jsdom-free) for `lib/actions/{registry, ranker, validate, prompt-builder}`, `lib/thread/{store, operations}`, `lib/picker/{detect-wiggle, resolve-target}`.
- **Manual test script** covering US-1..US-10 with reproduction steps and expected behavior, on three site classes: content site (article), code host (e.g., github file view, for `explain-code` contextual surfacing), and product page (for `compare` and `pros-cons` surfacing).
- **Backward-compatibility check**: previously-saved memory entries render correctly; popup behavior unchanged.

Playwright against the unpacked extension remains out of scope.

## 13. Open questions

The defaults below are the spec's working positions. Easy to flip during review or implementation kickoff.

1. **Action cap**: soft 25, hard 50.
2. **Zero heroes pinned**: hide the hero row entirely; composer-only.
3. **Library refresh**: in-bundle only for v1 (updates with extension updates); no remote refresh.
4. **Thread restoration window**: 7 days. Shorter (24h, "just this session") would prioritize freshness; longer (30d) would prioritize continuity.
5. **+Add target**: new picks attach to the *composer* (next turn). Alternative considered: also offer "add to last user turn" via a per-turn `+ Add to this question`. Deferred to post-v1; the simpler model ships first.

## 14. Non-goals

To keep the rebuild focused, the following are explicitly out of scope:

- Cross-tab threads or cross-device sync.
- Remote action marketplace; remote prompt-template fetching.
- Learned contextual ranker (the seam is present; the model is not).
- Agentic actions (the AI navigating or clicking on the user's behalf).
- Per-turn rerun history stack.
- Threaded chat *within* a Magic turn (sub-replies).
- Sidebar on the left edge or floating (right-docked only).
- Mobile / non-desktop browser support.

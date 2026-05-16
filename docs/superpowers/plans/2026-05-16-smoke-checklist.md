# Plan 2 Manual Smoke Checklist

Run after merging Plan 2. Load `.output/chrome-mv3-dev/` (from `pnpm dev`) into Chrome via `chrome://extensions` → Developer mode → Load unpacked.

## A. Article page (Substack post / Wikipedia)

- [ ] Wiggle → bottom-center pill appears, page dims slightly
- [ ] Pick a paragraph → dashed outline tracks; tag badge shows "p"
- [ ] Press Enter → sidebar slides in from right; page content reflows left
- [ ] Sidebar header shows: "Magic" title, backend pill ("Nano · on-device" or "OpenAI · cloud"), close (×)
- [ ] Hero row shows Summarize + Compare (Compare requires 2+ picks)
- [ ] Click Summarize → streaming answer appears in a Magic turn card
- [ ] After streaming completes: Save / Copy / ↻ Rerun buttons visible at footer
- [ ] "Based on:" chips visible at the bottom of the Magic turn card
- [ ] Click a source chip → page scrolls smoothly to the picked element
- [ ] Click Save → "saved ✓" badge appears briefly
- [ ] Open the toolbar popup → the saved entry appears in the memory list

## B. Restoration

- [ ] Close sidebar (× or Esc), then reload the same page
- [ ] Wiggle, pick something, press Enter
- [ ] Sidebar opens with banner: "↻ Continuing your previous conversation about this page. [Start fresh]"
- [ ] Previous turns are visible in the body
- [ ] Click Start fresh → banner removed, turns cleared, ready for a new conversation

## C. +Add re-entry

- [ ] With sidebar open and a Magic turn rendered, click "+ Add" in the composer
- [ ] Pill reappears at the bottom; sidebar stays open
- [ ] Pick a new element on the page → highlights track
- [ ] Press Enter → pill dismisses; composer's staged chips show the new pick added

## D. Code host (GitHub file view)

- [ ] Open https://github.com/<any user>/<any repo>/blob/main/<a code file>
- [ ] Wiggle, pick a code block (`<pre>` or `.hljs` element), press Enter
- [ ] Hero row should show: Summarize (always), plus "Explain this code" IF that library entry was enabled in Options. If not enabled, only Summarize.

## E. Options → Actions

- [ ] Open the options page from chrome://extensions → Wiggle Magic → Details → Extension options
- [ ] Switch to the Actions tab
- [ ] Confirm three sections: Built-in core (Summarize/Compare/Ask), Library (9 entries), Hero order
- [ ] Click "enable" on ELI5; button changes to "enabled" (green); ELI5 appears in Hero order
- [ ] Click ↑/↓ to reorder; verify storage persists (reload options page; order should be the same)
- [ ] Go back to a content page, wiggle + commit; ELI5 should appear as a hero

## F. Slash menu

- [ ] In sidebar composer, type `/`
- [ ] Autocomplete listbox appears with matching actions (summarize, compare, ask, plus any enabled library entries starting with that prefix)
- [ ] Mouse over an option → highlight changes
- [ ] (Note: clicking-to-accept may not be wired in v1; type the slash command and press Enter to submit as Ask if that's the current behavior)

## G. Keyboard

- [ ] `Alt+Shift+M` from idle → activates selection mode (pill appears)
- [ ] `Esc` from sidebar → closes sidebar
- [ ] `Esc` from selecting → exits selection mode
- [ ] `Enter` while in selecting with ≥1 pick → commits → sidebar opens

## H. Backend pill

- [ ] On a Nano-enabled Chrome: backend pill shows green dot + "Nano · on-device"
- [ ] On a non-Nano Chrome (or with cloud BYOK selected): backend pill shows amber dot + "OpenAI · cloud" / etc.

## Known gaps (not blocking)

- Slash menu accept-on-Enter or Tab isn't wired to the composer's submit (you type `/eli5` and press Enter, it submits as Ask text)
- Custom user-authored action editor not in scope (registry supports it; UI is future)
- Sidebar resize handle not in scope (fixed 420px)
- Mid-stream Stop button not in scope
- Translate modifier UI not in scope

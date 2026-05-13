# Wiggle Magic — Chrome extension

Wiggle your cursor on any web page → enter selection mode → pick one or more elements → **Ask AI**. Answers come from **Gemini Nano** on-device when available, or your own API key (OpenAI / Anthropic / Gemini) as a fallback. Save useful answers; everything stays local.

## Load it (dev)

1. Open `chrome://extensions/`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this `extension/` folder
5. (Optional) Pin the extension icon for easy access to your saved memory

## Use it

- **Wiggle** your cursor briskly anywhere on any page → the cursor swaps to a glowing pointer, viewport edges light up
- **Click** elements to pick them (click again to deselect)
- Move onto the floating **Ask AI** pill → click (or press <kbd>Enter</kbd>)
- A chat sheet rises from the bottom. Type your question, hit Send. Answer streams in and renders as markdown (lists, code blocks, tables, links).
- Click **Save** to keep the answer — it shows up when you click the toolbar icon.
- **Wiggle again** or press <kbd>Esc</kbd> to exit at any time.

## Gemini Nano requirements

The on-device path needs:
- **Chrome 138+**
- **Supported hardware**: Windows 10/11, macOS 13+, Linux, or ChromeOS (Chromebook Plus); 22 GB free space; GPU >4 GB VRAM, or CPU with 16 GB RAM + 4+ cores
- The model may download on first use (~2 GB)

Open the extension's **Settings** page to see live availability status.

If Nano isn't available, paste an API key in Settings and pick a provider — the extension will use that instead.

## What gets stored

- **`chrome.storage.local`** → your saved answers (`wm_memory`). Capped at 500 entries to stay within Chrome's 5 MB local-storage budget.
- **`chrome.storage.sync`** → your settings, including the API key. (Chrome's sync storage syncs to your Google account if you have sync on — this is normal Chrome behavior; the key isn't sent anywhere else.)

No data ever goes to a Wiggle Magic server, because there isn't one.

## File layout

```
manifest.json         # MV3 manifest
content.js            # wiggle detector + selection UI + AI calls + save
content.css           # overlay styles (everything prefixed with wm-)
cursor.svg            # the cursor mask
background.js         # service worker (opens options on first install)
popup.html/.js/.css   # toolbar popup — saved answers list, Markdown export
options.html/.js      # BYOK + backend strategy settings
lib/marked.min.js     # marked v14 — vendored markdown parser
lib/purify.min.js     # DOMPurify v3 — vendored HTML sanitizer
lib/render.js         # shared markdown renderer used by content + popup
```

## Known v1 limitations

- Runs in the **top frame only** (`all_frames: false`). iframes (Stripe checkouts, embedded YouTube, etc.) won't trigger.
- Doesn't run on `chrome://` pages, the Chrome Web Store, or PDF viewer.
- Some sites with their own custom cursors (Notion, Figma) may visually clash — the wiggle still works, the cursor swap may look off.
- The selection payload truncates each element's text to 500 chars before sending to the model.

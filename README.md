# wiggle-magic

> Proof-of-concept / early sketch. Inspired by Google's **Magic Pointer / Wiggle gesture** demo from *The Android Show @ I/O 2026* — re-imagined for the web.

Wiggle your cursor briskly on any web page → the native cursor swaps to a glowing gradient pointer, an aurora glow lights up the viewport edges, and you can pick any element (or several) to ask AI about. Answers stream in as rendered markdown; save them to a local memory you can revisit anytime.

[**Live demo →**](https://ajmalhassan.github.io/wiggle-magic/)

## Two ways to try it

### 1. Chrome extension — use it on any page

A Manifest V3 extension in [`extension/`](extension/) brings the gesture to every site you visit. Answers come from **Gemini Nano on-device** (Chrome 138+, no API key needed) — with **BYOK fallback** to OpenAI / Anthropic / Gemini when Nano isn't available. Save answers to local memory; export to Markdown anytime. Nothing leaves your machine on the Nano path; with BYOK, prompts go directly from your browser to the provider you chose (there is no Wiggle Magic server).

See [`extension/README.md`](extension/README.md) for load instructions.

### 2. Single-file demo — feel the gesture

The static `index.html` is a self-contained tour: wiggle detector, selection UI, and themed mock cards (shopping, real estate, recipes, news, jobs, code diffs) showing where this lives in the real world. No backend, no AI calls — it just dispatches a `wiggle:ask` event you can hook your own model into.

```bash
python3 -m http.server 8765
# open http://localhost:8765
```

No build step, no dependencies — `index.html` + `cursor.svg`.

## Library API (the demo)

Every picked element fires `wiggle:ask` with this payload:

- `text` / `html` — innerText + outerHTML (capped)
- `aria` — all `aria-*` attrs, plus `role`, `id`, `title`
- `data` — all `data-*` attrs
- `image` — `{ src, alt, naturalWidth, naturalHeight }` if it's or contains an `<img>`
- `link` — `{ href, text }` if it's or sits inside an `<a>`
- `value` — for `<input>` / `<textarea>` / `<select>`
- `rect` + `selector` — bounding rect and a stable CSS path

```js
// Fires when the user clicks "Ask AI"
document.addEventListener('wiggle:select', e => {
  const { selections } = e.detail;
});

// Fires when the user submits a question in the chat sheet
document.addEventListener('wiggle:ask', e => {
  const { question, selections } = e.detail;
  // hand off to your model
});
```

## Tuning the gesture

Defaults live in the `opts` block at the top of each script:

```js
{
  windowMs: 600,       // sliding-window length
  minReversals: 4,     // direction flips required inside the window
  maxRadius: 220,      // gesture must stay inside this bounding box (px)
  minSpeedPxMs: 0.25,  // average cursor speed (px/ms)
  minSamples: 5,       // minimum samples before evaluating
  cooldownMs: 1200,    // ignore further triggers right after one fires
}
```

Wiggle to enter selection mode, wiggle (or <kbd>Esc</kbd>) to leave. Press <kbd>Enter</kbd> after picking to commit.

## Topics

`chrome-extension` · `gemini-nano` · `on-device-ai` · `manifest-v3` · `prompt-api` · `gesture` · `mouse-gesture` · `wiggle-gesture` · `ai` · `cursor` · `javascript` · `google-io` · `llm` · `browser-extension`

## License

MIT — see [LICENSE](LICENSE).

# wiggle-magic

> Proof-of-concept / early sketch. Inspired by Google's **Magic Pointer / Wiggle gesture** demo from *The Android Show @ I/O 2026* — re-imagined for the web.

A tiny single-file experiment that listens for a **cursor wiggle** gesture and turns any web page into an AI selection canvas.

Wiggle briskly anywhere on the page → the native cursor is swapped for a glowing gradient pointer, an aurora glow lights up the viewport edges, and you can pick any element (or several) to send to an AI. Click **Ask AI** (or press <kbd>↩</kbd>) and a chat pill rises from the bottom and expands into a floating sheet.

## Try it

```bash
python3 -m http.server 8765
# open http://localhost:8765
```

No build step, no dependencies — `index.html` + `cursor.svg`.

## Or use it on any page (Chrome extension)

A Manifest V3 extension lives in [`extension/`](extension/) that brings the same gesture to every site, with **Gemini Nano** answering questions on-device (or your own API key as a fallback). See [`extension/README.md`](extension/README.md) for load instructions.

## The payload

Every picked element is captured as:

- `text` / `html` — innerText + outerHTML (capped)
- `aria` — all `aria-*` attrs, plus `role`, `id`, `title`
- `data` — all `data-*` attrs
- `image` — `{ src, alt, naturalWidth, naturalHeight }` if it's or contains an `<img>`
- `link` — `{ href, text }` if it's or sits inside an `<a>`
- `value` — for `<input>` / `<textarea>` / `<select>`
- `rect` + `selector` — bounding rect and a stable CSS path

## Events

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

Defaults live in the `opts` block at the top of the script:

```js
{
  windowMs: 600,      // sliding-window length
  minReversals: 4,    // direction flips required inside the window
  maxRadius: 220,     // gesture must stay inside this bounding box (px)
  minSpeedPxMs: 0.25, // average cursor speed (px/ms)
  cooldownMs: 1200,   // ignore further triggers right after one fires
}
```

Wiggle to enter selection mode, wiggle (or Esc) to leave.

## Topics

`gesture` · `mouse-gesture` · `ai` · `cursor` · `javascript` · `wiggle-gesture` · `google-io`

## License

MIT — see [LICENSE](LICENSE).


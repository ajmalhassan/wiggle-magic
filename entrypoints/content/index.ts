import './content.css';
import { renderMarkdownInto } from '@/src/lib/markdown';
import type { WmSettings } from '@/src/lib/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',
  main() {
    // ---------- tunables ----------
    const opts = {
      windowMs: 600,
      minReversals: 4,
      maxRadius: 220,
      minSpeedPxMs: 0.25,
      minDx: 3,
      minSamples: 5,
      cooldownMs: 1200,
    };

    interface Payload {
      selector: string;
      tag: string;
      text: string;
      aria: Record<string, string>;
      data: Record<string, string>;
      image: { src: string; alt: string; naturalWidth?: number; naturalHeight?: number } | null;
      link: { href: string; text: string } | null;
      value: string | null;
      rect: { x: number; y: number; width: number; height: number };
    }

    type Mode = 'idle' | 'activating' | 'selecting' | 'sheet';
    interface Pick { id: string; el: Element; marker: HTMLDivElement; payload: Payload; label: string; }

    // ---------- scaffold the overlay ----------
    const root = document.createElement('div');
    root.id = 'wm-root';
    root.innerHTML = `
    <div id="wm-edge"></div>
    <div id="wm-ripples"></div>
    <div id="wm-highlight"></div>
    <div id="wm-tag" aria-hidden="true"></div>
    <div id="wm-cursor"><div class="shape"><div class="grad"></div></div></div>
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
    <div id="wm-sheet" role="dialog" aria-label="Magic">
      <div class="pill-state">
        <span class="dot"></span>
        <span>Preparing your context…</span>
      </div>
      <div class="sheet-state">
        <button class="close" id="wm-sheet-close" type="button" aria-label="Close">×</button>
        <div class="header">
          <b>Magic</b>
          <span id="wm-sheet-count"></span>
        </div>
        <div class="chips" id="wm-sheet-chips"></div>
        <div class="answer empty" id="wm-sheet-answer"></div>
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
          <input id="wm-sheet-input" type="text" placeholder="Ask Magic about your selection…" autocomplete="off" />
          <button id="wm-sheet-send" type="button">
            <svg class="sparkle" viewBox="-3 -3 6 6" aria-hidden="true">
              <polygon points="0,-2.6 0.7,-0.7 2.6,0 0.7,0.7 0,2.6 -0.7,0.7 -2.6,0 -0.7,-0.7" fill="#0b0d12"/>
            </svg>
            <span id="wm-sheet-send-label">Send</span>
          </button>
        </div>
      </div>
    </div>
    <div id="wm-toast"></div>
  `;
    document.documentElement.appendChild(root);

    // Cursor mask loads from the extension package — must use chrome.runtime.getURL.
    const cursorUrl = chrome.runtime.getURL('cursor.svg');
    const shape = root.querySelector<HTMLElement>('#wm-cursor .shape')!;
    shape.style.webkitMaskImage = `url("${cursorUrl}")`;
    shape.style.maskImage = `url("${cursorUrl}")`;

    // ---------- element refs ----------
    // #wm-edge and #wm-toast exist in the overlay markup but are CSS-only;
    // no JS reads or writes them, so they're not queried here.
    const cursor       = root.querySelector<HTMLElement>('#wm-cursor')!;
    const highlight    = root.querySelector<HTMLElement>('#wm-highlight')!;
    const tagBadge     = root.querySelector<HTMLElement>('#wm-tag')!;
    const ripples      = root.querySelector<HTMLElement>('#wm-ripples')!;
    const chipbar      = root.querySelector<HTMLElement>('#wm-chipbar')!;
    const chipbarCount = root.querySelector<HTMLElement>('#wm-chipbar-count')!;
    const chipbarChips = root.querySelector<HTMLElement>('#wm-chipbar-chips')!;
    const sheetEl      = root.querySelector<HTMLElement>('#wm-sheet')!;
    const sheetChips   = root.querySelector<HTMLElement>('#wm-sheet-chips')!;
    const sheetCount   = root.querySelector<HTMLElement>('#wm-sheet-count')!;
    const sheetInput   = root.querySelector<HTMLInputElement>('#wm-sheet-input')!;
    const sheetSend    = root.querySelector<HTMLButtonElement>('#wm-sheet-send')!;
    const sheetSendLabel = root.querySelector<HTMLElement>('#wm-sheet-send-label')!;
    const sheetClose   = root.querySelector<HTMLButtonElement>('#wm-sheet-close')!;
    const answerEl     = root.querySelector<HTMLElement>('#wm-sheet-answer')!;
    const actionsEl    = root.querySelector<HTMLElement>('#wm-sheet-actions')!;
    const saveBtn      = root.querySelector<HTMLButtonElement>('#wm-save')!;
    const copyBtn      = root.querySelector<HTMLButtonElement>('#wm-copy')!;
    const savedMsg     = root.querySelector<HTMLElement>('#wm-saved-msg')!;

    // ---------- state ----------
    let samples: { x: number; y: number; t: number }[] = [];
    let lastTrigger = 0;
    let cursorX = 0, cursorY = 0;
    let rafPending = false;
    let lastHighlightEl: Element | null = null;
    let viewportShiftPending = false;

    let currentAnswer = '';
    let currentQuestion = '';
    let currentSelections: Payload[] = [];
    let askController: AbortController | null = null;
    let answerSavedThisRun = false;

    // ---------- wiggle detector ----------
    function onPointerMove(e: MouseEvent): void {
      cursorX = e.clientX;
      cursorY = e.clientY;

      if (picker.mode === 'activating' || picker.mode === 'sheet') return;
      if (picker.mode === 'selecting') schedulePaint();

      const now = performance.now();
      if (now - lastTrigger < opts.cooldownMs) return;

      samples.push({ x: cursorX, y: cursorY, t: now });
      while (samples.length && now - samples[0].t > opts.windowMs) samples.shift();
      if (samples.length < opts.minSamples) return;

      let reversals = 0;
      let minX =  Infinity, maxX = -Infinity;
      let minY =  Infinity, maxY = -Infinity;
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
        lastTrigger = now;
        samples.length = 0;
        if (picker.mode === 'idle') activate(cursorX, cursorY);
        else if (picker.mode === 'selecting') deactivate();
      }
    }

    // ---------- activation ----------
    function activate(x: number, y: number): void {
      picker.mode = 'activating';
      document.body.classList.add('wm-active');
      spawnBurst(x, y);
      paintCursor(x, y);
      requestAnimationFrame(() => {
        cursor.classList.add('visible');
        cursor.style.transform = `translate(${x}px, ${y}px) scale(1)`;
      });
      setTimeout(() => { if (picker.mode === 'activating') picker.mode = 'selecting'; }, 220);
    }

    function deactivate(): void {
      picker.mode = 'idle';
      document.body.classList.remove('wm-active');
      cursor.classList.remove('visible');
      cursor.style.transform = `translate(${cursorX}px, ${cursorY}px) scale(0.4)`;
      highlight.style.opacity = '0';
      tagBadge.style.opacity = '0';
      overlay.unmountChipBar();
      for (const sel of picker.picks) sel.marker.remove();
      picker.picks.length = 0;
      samples.length = 0;
      lastHighlightEl = null;
    }

    function spawnBurst(x: number, y: number): void {
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
    }

    // ---------- painting ----------
    function schedulePaint(): void {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (picker.mode !== 'selecting') return;
        paintCursor(cursorX, cursorY);
        paintHighlight();
      });
    }

    function paintCursor(x: number, y: number): void {
      cursor.style.transform = `translate(${x}px, ${y}px) scale(1)`;
    }

    function applyRectBox(node: HTMLElement, rect: DOMRect): void {
      node.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
      node.style.width  = rect.width  + 'px';
      node.style.height = rect.height + 'px';
    }

    function isOverlayHit(el: Element | null): boolean {
      return !!(el && el.closest && el.closest('#wm-root'));
    }

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

    // ---------- chip bar ----------
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

    // ---------- selection ----------
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

    function positionMarker(marker: HTMLElement, el: Element): void {
      applyRectBox(marker, el.getBoundingClientRect());
    }

    function repaintMarkers(): void {
      for (const sel of picker.picks) positionMarker(sel.marker, sel.el);
    }

    function getPayload(el: Element): Payload {
      const rect = el.getBoundingClientRect();
      const aria: Record<string, string> = {};
      const data: Record<string, string> = {};
      for (const attr of el.attributes) {
        if (attr.name.startsWith('aria-')) aria[attr.name] = attr.value;
        if (attr.name.startsWith('data-')) data[attr.name.slice(5)] = attr.value;
      }
      if (el.getAttribute('role')) aria.role = el.getAttribute('role')!;
      if (el.id)    aria.id    = el.id;
      if ((el as HTMLElement).title) aria.title = (el as HTMLElement).title;

      let image: Payload['image'] = null;
      if (el.tagName === 'IMG') {
        const img = el as HTMLImageElement;
        image = { src: img.currentSrc || img.src, alt: img.alt,
                  naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
      } else {
        const img = el.querySelector('img');
        if (img) image = { src: img.currentSrc || img.src, alt: img.alt };
      }

      let link: Payload['link'] = null;
      const a = el.tagName === 'A' ? el as HTMLAnchorElement : el.closest('a');
      if (a && a.href) link = { href: a.href, text: (a.innerText || '').trim().slice(0, 200) };

      let value: string | null = null;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
        value = (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
      }

      return {
        selector: cssPath(el),
        tag: el.tagName.toLowerCase(),
        text: ((el as HTMLElement).innerText || el.textContent || '').trim().slice(0, 1000),
        aria, data, image, link, value,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    }

    function commit(): void {
      if (picker.picks.length === 0) return;
      overlay.unmountChipBar();
      const payloads = picker.picks.map(p => p.payload);
      sheet.show(payloads);
    }

    // ---------- sheet ----------
    function showSheet(payloads: Payload[]): void {
      picker.mode = 'sheet';
      cursor.classList.remove('visible');
      highlight.style.opacity = '0';

      currentSelections = payloads;
      currentAnswer = '';
      currentQuestion = '';
      answerSavedThisRun = false;
      answerEl.textContent = '';
      answerEl.classList.add('empty');
      actionsEl.classList.remove('show');
      savedMsg.style.display = 'none';
      sheetInput.value = '';
      sheetInput.disabled = false;
      sheetSend.disabled = false;
      sheetSendLabel.textContent = 'Send';

      sheetChips.innerHTML = '';
      for (const p of payloads) {
        const chip = document.createElement('div');
        chip.className = 'chip';
        const label = labelFor(p);
        chip.textContent = label.slice(0, 42) + (label.length > 42 ? '…' : '');
        chip.title = label;
        sheetChips.appendChild(chip);
      }
      sheetCount.textContent = payloads.length + ' selected';

      requestAnimationFrame(() => sheetEl.classList.add('visible'));
      setTimeout(() => sheetEl.classList.add('expanded'), 380);
      setTimeout(() => sheetInput.focus(), 920);
    }

    function closeSheet(): void {
      if (askController) { askController.abort(); askController = null; }
      sheetEl.classList.remove('expanded');
      sheetInput.value = '';
      setTimeout(() => sheetEl.classList.remove('visible'), 320);
      setTimeout(() => {
        for (const sel of picker.picks) sel.marker.remove();
        picker.picks.length = 0;
        document.body.classList.remove('wm-active');
        samples.length = 0;
        lastHighlightEl = null;
        currentSelections = [];
        currentAnswer = '';
        currentQuestion = '';
        picker.mode = 'idle';
      }, 700);
    }

    async function submitAsk(): Promise<void> {
      const question = sheetInput.value.trim();
      if (!question || askController) return;
      currentQuestion = question;
      currentAnswer = '';
      answerEl.classList.remove('empty');
      answerEl.innerHTML = '<span class="placeholder">Thinking…</span>';
      sheetInput.disabled = true;
      sheetSend.disabled = true;
      sheetSendLabel.textContent = 'Asking…';
      actionsEl.classList.remove('show');
      savedMsg.style.display = 'none';
      answerSavedThisRun = false;

      askController = new AbortController();
      const textNode = document.createTextNode('');
      try {
        await askAI(question, currentSelections, askController.signal, (chunk, isFirst) => {
          if (isFirst) {
            answerEl.replaceChildren(textNode);
            answerEl.classList.add('streaming');
          }
          textNode.appendData(chunk);
          currentAnswer += chunk;
          answerEl.scrollTop = answerEl.scrollHeight;
        });
        renderMarkdownInto(answerEl, currentAnswer);
        answerEl.scrollTop = answerEl.scrollHeight;
        actionsEl.classList.add('show');
      } catch (err) {
        if (err && (err as Error).name === 'AbortError') return;
        console.error('[wiggle-magic] askAI failed:', err);
        const errSpan = document.createElement('span');
        errSpan.className = 'err';
        const msg = (err as Error)?.message || String(err);
        errSpan.textContent = /Extension context invalidated/i.test(msg)
          ? 'Wiggle Magic was updated. Reload this tab to continue.'
          : msg;
        answerEl.replaceChildren(errSpan);
      } finally {
        answerEl.classList.remove('streaming');
        askController = null;
        sheetInput.disabled = false;
        sheetSend.disabled = false;
        sheetSendLabel.textContent = 'Ask again';
      }
    }

    // ---------- AI: Nano first, BYOK fallback ----------
    async function askAI(
      question: string,
      payloads: Payload[],
      signal: AbortSignal,
      onChunk: (chunk: string, isFirst: boolean) => void
    ): Promise<void> {
      const settings = await loadSettings();
      const sysPrompt = 'You are a concise, helpful assistant. The user has selected one or more elements on a web page and is asking a question about them. Answer briefly and concretely. Prefer bullets when comparing items.';

      if (settings.backend !== 'byok' && typeof LanguageModel !== 'undefined') {
        const avail = await LanguageModel.availability().catch(() => 'unavailable');
        if (avail === 'available' || avail === 'readily') {
          const imageBlobs = payloads.some(p => p.image?.src)
            ? await fetchImageBlobs(payloads, signal)
            : new Map<Payload, Blob>();

          let session: Awaited<ReturnType<typeof LanguageModel.create>> | null = null;
          if (imageBlobs.size) {
            // Some devices don't expose image input — fall through to text-only.
            try {
              session = await createNanoSession(sysPrompt, { expectedInputs: [{ type: 'text' }, { type: 'image' }] });
            } catch {}
          }
          if (!session) session = await createNanoSession(sysPrompt);

          const prompt = imageBlobs.size
            ? buildMultimodalPrompt(question, payloads, imageBlobs)
            : buildPrompt(question, payloads);

          try {
            const stream = session.promptStreaming(prompt, { signal });
            let first = true;
            for await (const chunk of stream) {
              onChunk(chunk, first);
              first = false;
            }
          } finally {
            session.destroy && session.destroy();
          }
          return;
        }
        // Nano not ready and user hasn't set BYOK — surface a useful error.
        if (settings.backend === 'nano') {
          throw new Error(`Gemini Nano isn't ready (status: ${avail}). Open the extension Options to download the model or switch to BYOK.`);
        }
        if (!settings.apiKey) {
          throw new Error(`Gemini Nano isn't ready (status: ${avail}) and no API key is set. Open the extension Options to download Nano or paste a BYOK key.`);
        }
      }

      if (!settings.apiKey) {
        throw new Error('No API key configured. Click the extension icon → Settings.');
      }
      await callByokStreaming(settings, sysPrompt, buildPrompt(question, payloads), signal, onChunk);
    }

    function createNanoSession(sysPrompt: string, extra: Partial<LanguageModelCreateOptions> = {}) {
      return LanguageModel.create({
        initialPrompts: [{ role: 'system', content: sysPrompt }],
        temperature: 0.4,
        topK: 3,
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
        ...extra,
      });
    }

    function formatItem(p: Payload, i: number, imageAttached: boolean): string {
      const lines = [`[${i + 1}] <${p.tag}>`];
      if (p.text) lines.push(`text: ${truncate(p.text, 500)}`);
      if (p.link) lines.push(`link: ${p.link.href}`);
      if (p.image) {
        lines.push(imageAttached
          ? `image: attached below as [image ${i + 1}]`
          : `image alt: ${p.image.alt || '(none)'}`);
      }
      if (p.value) lines.push(`value: ${truncate(p.value, 200)}`);
      const dataKeys = Object.keys(p.data || {});
      if (dataKeys.length) {
        lines.push('data: ' + dataKeys.map(k => `${k}=${p.data[k]}`).join(', '));
      }
      return lines.join('\n');
    }

    function buildPrompt(question: string, payloads: Payload[]): string {
      const items = payloads.map((p, i) => formatItem(p, i, false)).join('\n\n');
      return `The user selected these elements on ${location.hostname}:\n\n${items}\n\nQuestion: ${question}`;
    }

    function buildMultimodalPrompt(question: string, payloads: Payload[], imageBlobs: Map<Payload, Blob>) {
      const items = payloads.map((p, i) => formatItem(p, i, imageBlobs.has(p))).join('\n\n');
      const content: Array<{ type: string; value: string | Blob }> = [
        { type: 'text', value: `The user selected these elements on ${location.hostname}:\n\n${items}` },
      ];
      payloads.forEach((p, i) => {
        const blob = imageBlobs.get(p);
        if (blob) {
          content.push({ type: 'text', value: `[image ${i + 1}]` });
          content.push({ type: 'image', value: blob });
        }
      });
      content.push({ type: 'text', value: `Question: ${question}` });
      return [{ role: 'user', content }];
    }

    // Returns Map<payload, Blob>. Tries a direct CORS fetch first; falls back to
    // the service worker (which has host_permissions: <all_urls>) for opaque-CORS
    // images. Anything that still fails gets dropped — the caller uses alt text.
    async function fetchImageBlobs(
      payloads: Payload[],
      signal: AbortSignal | undefined
    ): Promise<Map<Payload, Blob>> {
      const out = new Map<Payload, Blob>();
      const targets = payloads.filter(p => p.image?.src);
      const results = await Promise.all(targets.map(async (p) => {
        if (signal?.aborted) return null;
        const blob = await fetchImageBlobDirect(p.image!.src, signal)
                   || await fetchImageBlobViaSW(p.image!.src);
        return blob?.type.startsWith('image/') ? blob : null;
      }));
      targets.forEach((p, i) => { if (results[i]) out.set(p, results[i]!); });
      return out;
    }

    async function fetchImageBlobDirect(url: string, signal: AbortSignal | undefined): Promise<Blob | null> {
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal });
        return res.ok ? await res.blob() : null;
      } catch { return null; }
    }

    async function fetchImageBlobViaSW(url: string): Promise<Blob | null> {
      try {
        const resp = await chrome.runtime.sendMessage({ action: 'fetchImage', url }) as { ok: boolean; dataURL?: string };
        if (!resp?.ok || !resp.dataURL) return null;
        return await (await fetch(resp.dataURL)).blob();
      } catch { return null; }
    }

    function truncate(s: string, n: number): string {
      s = String(s).replace(/\s+/g, ' ').trim();
      return s.length > n ? s.slice(0, n) + '…' : s;
    }

    // ---------- BYOK streaming for OpenAI / Anthropic / Gemini ----------
    interface ByokSpec {
      name: string;
      url: string;
      headers: Record<string, string>;
      body: Record<string, unknown>;
      extract: (j: Record<string, unknown>) => string | null | undefined;
    }

    async function callByokStreaming(
      settings: WmSettings,
      sysPrompt: string,
      userPrompt: string,
      signal: AbortSignal,
      onChunk: (chunk: string, isFirst: boolean) => void
    ): Promise<void> {
      const spec = byokSpec(settings, sysPrompt, userPrompt);
      if (!spec) throw new Error(`Unknown provider: ${settings.provider}`);
      const res = await fetch(spec.url, {
        method: 'POST',
        headers: spec.headers,
        body: JSON.stringify(spec.body),
        signal,
      });
      if (!res.ok) throw new Error(`${spec.name} ${res.status}: ${await res.text().catch(() => '')}`);
      let first = true;
      await consumeSSE(res, signal, (event) => {
        if (event === '[DONE]') return;
        try {
          const delta = spec.extract(JSON.parse(event) as Record<string, unknown>);
          if (delta) { onChunk(delta, first); first = false; }
        } catch {}
      });
    }

    function byokSpec(s: WmSettings, sys: string, user: string): ByokSpec | null {
      const provider = s.provider || 'openai';
      if (provider === 'openai') return {
        name: 'OpenAI',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.apiKey}` },
        body: {
          model: s.model || 'gpt-5.4-mini',
          stream: true,
          messages: [
            { role: 'system', content: sys },
            { role: 'user',   content: user },
          ],
        },
        extract: (j) => (j.choices as Array<{ delta: { content?: string } }>)?.[0]?.delta?.content,
      };
      if (provider === 'anthropic') return {
        name: 'Anthropic',
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': s.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: {
          model: s.model || 'claude-haiku-4-5',
          max_tokens: 1024,
          stream: true,
          system: sys,
          messages: [{ role: 'user', content: user }],
        },
        extract: (j) => j.type === 'content_block_delta'
          ? (j.delta as { text?: string })?.text
          : null,
      };
      if (provider === 'gemini') {
        const u = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${s.model || 'gemini-2.5-flash'}:streamGenerateContent`);
        u.searchParams.set('alt', 'sse');
        u.searchParams.set('key', s.apiKey);
        return {
          name: 'Gemini',
          url: u.toString(),
          headers: { 'Content-Type': 'application/json' },
          body: {
            systemInstruction: { parts: [{ text: sys }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
          },
          extract: (j) => (j.candidates as Array<{ content: { parts: Array<{ text: string }> } }>)?.[0]?.content?.parts?.[0]?.text,
        };
      }
      return null;
    }

    // Minimal SSE consumer: yields each "data:" event body string.
    async function consumeSSE(
      res: Response,
      signal: AbortSignal,
      onEvent: (event: string) => void
    ): Promise<void> {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        if (signal && signal.aborted) { try { reader.cancel(); } catch {} return; }
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of raw.split('\n')) {
            const m = /^data:\s?(.*)$/.exec(line);
            if (m) onEvent(m[1]);
          }
        }
      }
    }

    // ---------- save / copy ----------
    async function saveCurrentAnswer(): Promise<void> {
      if (!currentAnswer || answerSavedThisRun) return;
      const entry = {
        id: crypto.randomUUID(),
        ts: Date.now(),
        url: location.href,
        title: document.title,
        hostname: location.hostname,
        question: currentQuestion,
        answer: currentAnswer,
        selections: currentSelections.map(p => ({
          tag: p.tag,
          text: p.text,
          link: p.link,
          image: p.image && { src: p.image.src, alt: p.image.alt },
          selector: p.selector,
        })),
      };
      const { wm_memory = [] } = await chrome.storage.local.get('wm_memory') as { wm_memory?: unknown[] };
      wm_memory.unshift(entry);
      // Cap at 500 entries — chrome.storage.local has a 5MB total budget.
      if (wm_memory.length > 500) wm_memory.length = 500;
      await chrome.storage.local.set({ wm_memory });
      answerSavedThisRun = true;
      savedMsg.style.display = 'inline';
      setTimeout(() => { savedMsg.style.display = 'none'; }, 1800);
    }

    async function copyCurrentAnswer(): Promise<void> {
      if (!currentAnswer) return;
      try {
        await navigator.clipboard.writeText(currentAnswer);
        savedMsg.textContent = 'copied ✓';
        savedMsg.style.display = 'inline';
        setTimeout(() => {
          savedMsg.textContent = 'saved ✓';
          savedMsg.style.display = 'none';
        }, 1500);
      } catch {}
    }

    // ---------- settings ----------
    async function loadSettings(): Promise<WmSettings> {
      const def: WmSettings = { backend: 'auto', provider: 'openai', apiKey: '', model: '' };
      const got = await chrome.storage.sync.get('wm_settings') as { wm_settings?: Partial<WmSettings> };
      return Object.assign(def, got.wm_settings || {});
    }

    // ---------- semantic ancestor resolution ----------
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

    // ---------- misc helpers ----------
    function pick(e: MouseEvent): void {
      if (picker.mode !== 'selecting') return;
      e.preventDefault();
      e.stopPropagation();
      const leaf = document.elementFromPoint(e.clientX, e.clientY);
      if (!leaf || isOverlayHit(leaf)) return;
      const resolved = picker.resolveTarget(leaf);
      picker.togglePick(resolved);
    }

    function labelFor(p: Payload): string {
      const raw = p.text || (p.image && p.image.alt) || (p.link && p.link.href) || p.value || `<${p.tag}>`;
      return String(raw).replace(/\s+/g, ' ').trim();
    }

    function cssPath(el: Element): string {
      if (el.id) return '#' + CSS.escape(el.id);
      const parts: string[] = [];
      let cur: Element | null = el;
      while (cur && cur.nodeType === 1 && cur !== document.body) {
        let part = cur.tagName.toLowerCase();
        if (cur.classList.length) part += '.' + [...cur.classList].slice(0, 2).map(CSS.escape).join('.');
        const parent = cur.parentElement;
        if (parent) {
          const sibs = [...parent.children].filter(c => c.tagName === cur!.tagName);
          if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
        }
        parts.unshift(part);
        if (document.querySelectorAll(parts.join(' > ')).length === 1) break;
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    }

    // ---------- modules ----------
    const wiggle  = { onMove: onPointerMove };
    const overlay = { paintCursor, paintHighlight, spawnBurst, applyRectBox, isOverlayHit, repaintMarkers, mountChipBar, unmountChipBar, renderChipBar };
    const picker  = {
      mode: 'idle' as Mode,
      picks: [] as Pick[],
      activate,
      deactivate,
      commit,
      togglePick,
      add: pickerAdd,
      remove: pickerRemove,
      getPayload,
      pick,
      resolveTarget,
    };
    const sheet   = { show: showSheet, close: closeSheet, askAI: submitAsk, save: saveCurrentAnswer, copy: copyCurrentAnswer };

    // ---------- bindings ----------
    document.addEventListener('mousemove', wiggle.onMove, { passive: true });
    document.addEventListener('click', picker.pick, true);
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (picker.mode === 'sheet') sheet.close();
        else if (picker.mode !== 'idle') picker.deactivate();
      }
      if (e.key === 'Enter' && picker.mode === 'selecting' && picker.picks.length > 0) picker.commit();
    });
    sheetClose.addEventListener('click', sheet.close);
    sheetSend.addEventListener('click', sheet.askAI);
    sheetInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); sheet.askAI(); }
    });
    saveBtn.addEventListener('click', sheet.save);
    copyBtn.addEventListener('click', sheet.copy);

    const onViewportShift = () => {
      if (picker.mode !== 'selecting' || viewportShiftPending) return;
      viewportShiftPending = true;
      requestAnimationFrame(() => {
        viewportShiftPending = false;
        if (picker.mode !== 'selecting') return;
        overlay.repaintMarkers();
        lastHighlightEl = null;
        overlay.paintHighlight();
      });
    };
    window.addEventListener('scroll', onViewportShift, true);
    window.addEventListener('resize', onViewportShift);
  },
});

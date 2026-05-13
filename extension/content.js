/* Wiggle Magic — content script. Runs on every page. */
(() => {
  // Don't run twice if injected by Chrome's reinjection in odd states.
  if (window.__wiggleMagicLoaded) return;
  window.__wiggleMagicLoaded = true;

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

  // ---------- scaffold the overlay ----------
  const root = document.createElement('div');
  root.id = 'wm-root';
  root.innerHTML = `
    <div id="wm-edge"></div>
    <div id="wm-ripples"></div>
    <div id="wm-highlight"></div>
    <div id="wm-cursor"><div class="shape"><div class="grad"></div></div></div>
    <div id="wm-popover">
      <div class="inner">
        <button id="wm-popover-btn" type="button">
          <svg class="sparkle" viewBox="-3 -3 6 6" aria-hidden="true">
            <polygon points="0,-2.6 0.7,-0.7 2.6,0 0.7,0.7 0,2.6 -0.7,0.7 -2.6,0 -0.7,-0.7" fill="#0b0d12"/>
          </svg>
          <span>Magic</span>
          <span class="kbd" aria-label="press Enter to commit">⏎</span>
          <span class="count" aria-label="selected items">0</span>
        </button>
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
  const shape = root.querySelector('#wm-cursor .shape');
  shape.style.webkitMaskImage = `url("${cursorUrl}")`;
  shape.style.maskImage = `url("${cursorUrl}")`;

  // ---------- element refs ----------
  const edge        = root.querySelector('#wm-edge');
  const cursor      = root.querySelector('#wm-cursor');
  const highlight   = root.querySelector('#wm-highlight');
  const ripples     = root.querySelector('#wm-ripples');
  const toast       = root.querySelector('#wm-toast');
  const popover     = root.querySelector('#wm-popover');
  const popoverBtn  = root.querySelector('#wm-popover-btn');
  const popoverCount = popover.querySelector('.count');
  const sheet       = root.querySelector('#wm-sheet');
  const sheetChips  = root.querySelector('#wm-sheet-chips');
  const sheetCount  = root.querySelector('#wm-sheet-count');
  const sheetInput  = root.querySelector('#wm-sheet-input');
  const sheetSend   = root.querySelector('#wm-sheet-send');
  const sheetSendLabel = root.querySelector('#wm-sheet-send-label');
  const sheetClose  = root.querySelector('#wm-sheet-close');
  const answerEl    = root.querySelector('#wm-sheet-answer');
  const actionsEl   = root.querySelector('#wm-sheet-actions');
  const saveBtn     = root.querySelector('#wm-save');
  const copyBtn     = root.querySelector('#wm-copy');
  const savedMsg    = root.querySelector('#wm-saved-msg');

  // ---------- state ----------
  let state = 'idle';   // 'idle' | 'activating' | 'selecting' | 'sheet'
  let samples = [];
  let lastTrigger = 0;
  let cursorX = 0, cursorY = 0;
  let rafPending = false;
  let popoverX = 0, popoverY = 0, popoverW = 0, popoverH = 0;
  let lastHighlightEl = null;
  let viewportShiftPending = false;
  const selections = [];

  let currentAnswer = '';
  let currentQuestion = '';
  let currentSelections = [];
  let askController = null;
  let answerSavedThisRun = false;

  // ---------- wiggle detector ----------
  function onPointerMove(e) {
    cursorX = e.clientX;
    cursorY = e.clientY;

    if (state === 'activating' || state === 'sheet') return;
    if (state === 'selecting') schedulePaint();

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
      if (state === 'idle') activate(cursorX, cursorY);
      else if (state === 'selecting') deactivate();
    }
  }

  // ---------- activation ----------
  function activate(x, y) {
    state = 'activating';
    document.body.classList.add('wm-active');
    spawnBurst(x, y);
    paintCursor(x, y);
    requestAnimationFrame(() => {
      cursor.classList.add('visible');
      cursor.style.transform = `translate(${x}px, ${y}px) scale(1)`;
    });
    setTimeout(() => { if (state === 'activating') state = 'selecting'; }, 220);
  }

  function deactivate() {
    state = 'idle';
    document.body.classList.remove('wm-active');
    cursor.classList.remove('visible');
    cursor.style.transform = `translate(${cursorX}px, ${cursorY}px) scale(0.4)`;
    highlight.style.opacity = 0;
    popover.classList.remove('visible');
    for (const sel of selections) sel.marker.remove();
    selections.length = 0;
    samples.length = 0;
    lastHighlightEl = null;
  }

  function spawnBurst(x, y) {
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
  function schedulePaint() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (state !== 'selecting') return;
      paintCursor(cursorX, cursorY);
      paintHighlight();
      paintPopover();
    });
  }

  function paintCursor(x, y) {
    cursor.style.transform = `translate(${x}px, ${y}px) scale(1)`;
  }

  function applyRectBox(node, rect) {
    node.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    node.style.width  = rect.width  + 'px';
    node.style.height = rect.height + 'px';
  }

  function isOverlayHit(el) {
    return !!(el && el.closest && el.closest('#wm-root'));
  }

  function paintHighlight() {
    const el = document.elementFromPoint(cursorX, cursorY);
    if (!el || isOverlayHit(el) || el === document.documentElement || el === document.body) {
      if (lastHighlightEl !== null) {
        highlight.style.opacity = 0;
        lastHighlightEl = null;
      }
      return;
    }
    if (el === lastHighlightEl) return;
    lastHighlightEl = el;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) { highlight.style.opacity = 0; return; }
    highlight.style.opacity = 1;
    applyRectBox(highlight, r);
  }

  function paintPopover() {
    if (selections.length === 0) return;
    const isOver = cursorX >= popoverX && cursorX <= popoverX + popoverW &&
                   cursorY >= popoverY && cursorY <= popoverY + popoverH;
    if (isOver) return;
    const OFFX = 24, OFFY = 14;
    let px = cursorX + OFFX;
    let py = cursorY + OFFY;
    if (px + popoverW > window.innerWidth  - 10) px = cursorX - popoverW - 12;
    if (py + popoverH > window.innerHeight - 10) py = cursorY - popoverH - 14;
    if (px < 10) px = 10;
    if (py < 10) py = 10;
    popoverX = px; popoverY = py;
    popover.style.transform = `translate(${px}px, ${py}px)`;
  }

  // ---------- selection ----------
  function togglePick(el) {
    const idx = selections.findIndex(s => s.el === el);
    if (idx >= 0) {
      const [removed] = selections.splice(idx, 1);
      removed.marker.remove();
    } else {
      const marker = document.createElement('div');
      marker.className = 'wm-mark';
      document.body.appendChild(marker);
      positionMarker(marker, el);
      selections.push({ el, marker, payload: getPayload(el) });
    }
    if (selections.length > 0) {
      popoverCount.textContent = selections.length;
      popover.classList.add('visible');
      popoverW = popover.offsetWidth;
      popoverH = popover.offsetHeight;
      paintPopover();
    } else {
      popover.classList.remove('visible');
    }
  }

  function positionMarker(marker, el) {
    applyRectBox(marker, el.getBoundingClientRect());
  }

  function repaintMarkers() {
    for (const sel of selections) positionMarker(sel.marker, sel.el);
  }

  function getPayload(el) {
    const rect = el.getBoundingClientRect();
    const aria = {};
    const data = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith('aria-')) aria[attr.name] = attr.value;
      if (attr.name.startsWith('data-')) data[attr.name.slice(5)] = attr.value;
    }
    if (el.getAttribute('role')) aria.role = el.getAttribute('role');
    if (el.id)    aria.id    = el.id;
    if (el.title) aria.title = el.title;

    let image = null;
    if (el.tagName === 'IMG') {
      image = { src: el.currentSrc || el.src, alt: el.alt,
                naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight };
    } else {
      const img = el.querySelector('img');
      if (img) image = { src: img.currentSrc || img.src, alt: img.alt };
    }

    let link = null;
    const a = el.tagName === 'A' ? el : el.closest('a');
    if (a && a.href) link = { href: a.href, text: (a.innerText || '').trim().slice(0, 200) };

    let value = null;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) value = el.value;

    return {
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || el.textContent || '').trim().slice(0, 1000),
      aria, data, image, link, value,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  }

  function commit() {
    if (selections.length === 0) return;
    const payloads = selections.map(s => s.payload);
    showSheet(payloads);
  }

  // ---------- sheet ----------
  function showSheet(payloads) {
    state = 'sheet';
    cursor.classList.remove('visible');
    highlight.style.opacity = 0;
    popover.classList.remove('visible');

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

    requestAnimationFrame(() => sheet.classList.add('visible'));
    setTimeout(() => sheet.classList.add('expanded'), 380);
    setTimeout(() => sheetInput.focus(), 920);
  }

  function closeSheet() {
    if (askController) { askController.abort(); askController = null; }
    sheet.classList.remove('expanded');
    sheetInput.value = '';
    setTimeout(() => sheet.classList.remove('visible'), 320);
    setTimeout(() => {
      for (const sel of selections) sel.marker.remove();
      selections.length = 0;
      document.body.classList.remove('wm-active');
      samples.length = 0;
      lastHighlightEl = null;
      currentSelections = [];
      currentAnswer = '';
      currentQuestion = '';
      state = 'idle';
    }, 700);
  }

  async function submitAsk() {
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
      if (err && err.name === 'AbortError') return;
      console.error('[wiggle-magic] askAI failed:', err);
      const errSpan = document.createElement('span');
      errSpan.className = 'err';
      errSpan.textContent = err?.message || String(err);
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
  async function askAI(question, payloads, signal, onChunk) {
    const settings = await loadSettings();
    const sysPrompt = 'You are a concise, helpful assistant. The user has selected one or more elements on a web page and is asking a question about them. Answer briefly and concretely. Prefer bullets when comparing items.';

    if (settings.backend !== 'byok' && typeof LanguageModel !== 'undefined') {
      const avail = await LanguageModel.availability().catch(() => 'unavailable');
      if (avail === 'available' || avail === 'readily') {
        const imageBlobs = payloads.some(p => p.image?.src)
          ? await fetchImageBlobs(payloads, signal)
          : new Map();

        let session = null;
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

  function createNanoSession(sysPrompt, extra = {}) {
    return LanguageModel.create({
      initialPrompts: [{ role: 'system', content: sysPrompt }],
      temperature: 0.4,
      topK: 3,
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
      ...extra,
    });
  }

  function formatItem(p, i, imageAttached) {
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

  function buildPrompt(question, payloads) {
    const items = payloads.map((p, i) => formatItem(p, i, false)).join('\n\n');
    return `The user selected these elements on ${location.hostname}:\n\n${items}\n\nQuestion: ${question}`;
  }

  function buildMultimodalPrompt(question, payloads, imageBlobs) {
    const items = payloads.map((p, i) => formatItem(p, i, imageBlobs.has(p))).join('\n\n');
    const content = [
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
  async function fetchImageBlobs(payloads, signal) {
    const out = new Map();
    const targets = payloads.filter(p => p.image?.src);
    const results = await Promise.all(targets.map(async (p) => {
      if (signal?.aborted) return null;
      const blob = await fetchImageBlobDirect(p.image.src, signal)
                 || await fetchImageBlobViaSW(p.image.src);
      return blob?.type.startsWith('image/') ? blob : null;
    }));
    targets.forEach((p, i) => { if (results[i]) out.set(p, results[i]); });
    return out;
  }

  async function fetchImageBlobDirect(url, signal) {
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal });
      return res.ok ? await res.blob() : null;
    } catch { return null; }
  }

  async function fetchImageBlobViaSW(url) {
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'fetchImage', url });
      if (!resp?.ok || !resp.dataURL) return null;
      return await (await fetch(resp.dataURL)).blob();
    } catch { return null; }
  }

  function truncate(s, n) {
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  // ---------- BYOK streaming for OpenAI / Anthropic / Gemini ----------
  async function callByokStreaming(settings, sysPrompt, userPrompt, signal, onChunk) {
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
        const delta = spec.extract(JSON.parse(event));
        if (delta) { onChunk(delta, first); first = false; }
      } catch {}
    });
  }

  function byokSpec(s, sys, user) {
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
      extract: (j) => j.choices?.[0]?.delta?.content,
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
      extract: (j) => j.type === 'content_block_delta' ? j.delta?.text : null,
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
        extract: (j) => j.candidates?.[0]?.content?.parts?.[0]?.text,
      };
    }
    return null;
  }

  // Minimal SSE consumer: yields each "data:" event body string.
  async function consumeSSE(res, signal, onEvent) {
    const reader = res.body.getReader();
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
  async function saveCurrentAnswer() {
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
    const { wm_memory = [] } = await chrome.storage.local.get('wm_memory');
    wm_memory.unshift(entry);
    // Cap at 500 entries — chrome.storage.local has a 5MB total budget.
    if (wm_memory.length > 500) wm_memory.length = 500;
    await chrome.storage.local.set({ wm_memory });
    answerSavedThisRun = true;
    savedMsg.style.display = 'inline';
    setTimeout(() => { savedMsg.style.display = 'none'; }, 1800);
  }

  async function copyCurrentAnswer() {
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
  async function loadSettings() {
    const def = { backend: 'auto', provider: 'openai', apiKey: '', model: '' };
    const got = await chrome.storage.sync.get('wm_settings');
    return Object.assign(def, got.wm_settings || {});
  }

  // ---------- misc helpers ----------
  function pick(e) {
    if (state !== 'selecting') return;
    if (e.target.closest && e.target.closest('#wm-popover')) return;
    e.preventDefault();
    e.stopPropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOverlayHit(el)) return;
    togglePick(el);
  }

  function labelFor(p) {
    const raw = p.text || (p.image && p.image.alt) || (p.link && p.link.href) || p.value || `<${p.tag}>`;
    return String(raw).replace(/\s+/g, ' ').trim();
  }

  function cssPath(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      let part = el.tagName.toLowerCase();
      if (el.classList.length) part += '.' + [...el.classList].slice(0, 2).map(CSS.escape).join('.');
      const parent = el.parentElement;
      if (parent) {
        const sibs = [...parent.children].filter(c => c.tagName === el.tagName);
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(el) + 1})`;
      }
      parts.unshift(part);
      if (document.querySelectorAll(parts.join(' > ')).length === 1) break;
      el = el.parentElement;
    }
    return parts.join(' > ');
  }

  // ---------- bindings ----------
  document.addEventListener('mousemove', onPointerMove, { passive: true });
  document.addEventListener('click', pick, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (state === 'sheet') closeSheet();
      else if (state !== 'idle') deactivate();
    }
    if (e.key === 'Enter' && state === 'selecting' && selections.length > 0) commit();
  });
  popoverBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    commit();
  });
  sheetClose.addEventListener('click', closeSheet);
  sheetSend.addEventListener('click', submitAsk);
  sheetInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submitAsk(); }
  });
  saveBtn.addEventListener('click', saveCurrentAnswer);
  copyBtn.addEventListener('click', copyCurrentAnswer);

  const onViewportShift = () => {
    if (state !== 'selecting' || viewportShiftPending) return;
    viewportShiftPending = true;
    requestAnimationFrame(() => {
      viewportShiftPending = false;
      if (state !== 'selecting') return;
      repaintMarkers();
      lastHighlightEl = null;
      paintHighlight();
    });
  };
  window.addEventListener('scroll', onViewportShift, true);
  window.addEventListener('resize', onViewportShift);
})();

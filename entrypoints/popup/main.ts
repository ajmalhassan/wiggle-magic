import './popup.css';
import { renderMarkdownInto } from '@/src/lib/markdown';

interface SavedSelection {
  tag: string;
  text?: string;
  link?: { href: string; text?: string };
  image?: { src: string; alt?: string };
  selector?: string;
}

interface MemoryEntry {
  id: string;
  ts: number;
  url: string;
  title?: string;
  hostname: string;
  question: string;
  answer: string;
  selections?: SavedSelection[];
}

type Variant = 'original' | 'summary' | 'shorter' | 'bullets' | 'translated';
type Action = 'summary' | 'shorter' | 'bullets' | 'translated';

interface VariantState {
  summary?: string;
  shorter?: string;
  bullets?: string;
  translated?: string;
  _activeVariant?: Variant;
  _sourceLang?: string;
}

const listEl    = document.getElementById('list')!;
const emptyEl   = document.getElementById('empty')!;
const subEl     = document.getElementById('sub')!;
const clearBtn  = document.getElementById('clear') as HTMLButtonElement;
const exportBtn = document.getElementById('export') as HTMLButtonElement;
const settings  = document.getElementById('settings')!;
const rowTpl    = document.getElementById('row-tpl') as HTMLTemplateElement;

settings.addEventListener('click', () => chrome.runtime.openOptionsPage());

const VARIANTS: Variant[] = ['original', 'summary', 'shorter', 'bullets', 'translated'];
const VARIANT_LABEL: Record<Variant, string> = {
  original:   'Original',
  summary:    'Summary',
  shorter:    'Shorter',
  bullets:    'Bullets',
  translated: 'Translated',
};
const ACTION_LABEL: Record<Action, string> = {
  summary: 'Summarize',
  shorter: 'Shorter',
  bullets: 'Bullets',
  translated: 'Translate',
};

const isReady = (a: string) => a === 'available' || a === 'readily';

const variantsById = new Map<string, VariantState>();

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
    variantsById.delete(entry.id);
    row.remove();
    refreshChrome();
  });

  for (const btn of row.querySelectorAll<HTMLButtonElement>('.action')) {
    btn.addEventListener('click', () => runAction(entry, row, btn.dataset.action as Action));
  }

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
  variantsById.clear();
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

// ---------- variant + transform actions ----------

function getState(id: string): VariantState {
  if (!variantsById.has(id)) variantsById.set(id, { _activeVariant: 'original' });
  return variantsById.get(id)!;
}

function setStatus(row: HTMLElement, text: string, kind?: 'err'): void {
  const s = row.querySelector('.action-status') as HTMLElement;
  s.textContent = text || '';
  s.classList.toggle('err', kind === 'err');
}

function showVariant(row: HTMLElement, entry: MemoryEntry, variant: Variant): void {
  const state = getState(entry.id);
  state._activeVariant = variant;
  const ans = row.querySelector('.a') as HTMLElement;
  const body = variant === 'original' ? (entry.answer || '') : (state[variant] || '');
  renderMarkdownInto(ans, body);
  ans.classList.add('clamp');
  row.classList.remove('expanded');
  updateChips(row, entry);
}

function updateChips(row: HTMLElement, entry: MemoryEntry): void {
  const strip = row.querySelector('.variants') as HTMLElement;
  const state = getState(entry.id);
  const available = VARIANTS.filter(v => v === 'original' || state[v as Action]);
  strip.innerHTML = '';
  if (available.length <= 1) { strip.hidden = true; return; }
  strip.hidden = false;
  for (const v of available) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (state._activeVariant === v ? ' active' : '');
    chip.textContent = VARIANT_LABEL[v];
    chip.addEventListener('click', () => showVariant(row, entry, v));
    strip.appendChild(chip);
  }
}

async function runAction(entry: MemoryEntry, row: HTMLElement, action: Action): Promise<void> {
  if (row.dataset.busy) return;
  const state = getState(entry.id);

  if (state[action]) {
    showVariant(row, entry, action);
    return;
  }

  if (action === 'translated') {
    if (state._sourceLang == null) state._sourceLang = (await detectLang(entry.answer || '')) || 'en';
    if (state._sourceLang === browserLang()) {
      const t = browserLang();
      setStatus(row, `Already in ${LANG_NAMES[t] || t.toUpperCase()}`);
      return;
    }
  }

  const ans = row.querySelector('.a') as HTMLElement;
  const btn = row.querySelector(`.action[data-action="${action}"]`) as HTMLButtonElement;
  const buttons = row.querySelectorAll<HTMLButtonElement>('.action');
  const originalLabel = btn.textContent ?? '';
  row.dataset.busy = '1';
  buttons.forEach(b => b.disabled = true);
  btn.classList.add('loading');
  btn.textContent = '…';
  setStatus(row, '');

  state._activeVariant = action;
  ans.textContent = '';
  ans.classList.remove('clamp');
  const node = document.createTextNode('');
  ans.appendChild(node);

  let acc = '';
  try {
    for await (const chunk of openTransform(action, entry.answer || '', { sourceLang: state._sourceLang })) {
      acc += chunk;
      node.appendData(chunk);
    }
    if (!acc.trim()) throw new Error('empty result');
    state[action] = acc;
    renderMarkdownInto(ans, acc);
    ans.classList.add('clamp');
    updateChips(row, entry);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(row, `${ACTION_LABEL[action]} failed: ${msg}`, 'err');
    showVariant(row, entry, 'original');
  } finally {
    delete row.dataset.busy;
    buttons.forEach(b => b.disabled = false);
    btn.classList.remove('loading');
    btn.textContent = originalLabel;
  }
}

// ---------- adapters: dedicated Chrome AI APIs, with Prompt API fallback ----------

type Adapter = (
  action: Action,
  text: string,
  opts: { sourceLang?: string },
) => Promise<AsyncIterable<string> | null>;

async function* openTransform(
  action: Action,
  text: string,
  opts: { sourceLang?: string } = {},
): AsyncGenerator<string> {
  const adapters: Record<Action, Adapter[]> = {
    summary:    [adaptSummarizer, adaptPrompt],
    shorter:    [adaptRewriter,   adaptPrompt],
    bullets:    [adaptPrompt],
    translated: [adaptTranslator, adaptPrompt],
  };
  const list = adapters[action];

  let lastErr: unknown = null;
  for (const adapter of list) {
    try {
      const stream = await adapter(action, text, opts);
      if (stream) {
        for await (const chunk of stream) yield chunk;
        return;
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('no available backend');
}

// streamFrom wraps any of the streaming chrome-AI handles in a typed
// AsyncIterable. handle is intentionally `any` — the four handles
// (Summarizer/Rewriter/Translator/LanguageModel session) share no common
// base type, but the dispatch is dynamic by methodName.
function streamFrom(
  handle: any,
  methodName: string,
  text: string,
  finalize?: () => void,
): AsyncIterable<string> {
  return (async function* () {
    try {
      for await (const chunk of handle[methodName](text)) yield chunk;
    } finally {
      finalize?.();
    }
  })();
}

async function adaptSummarizer(_action: Action, text: string, _opts: { sourceLang?: string }): Promise<AsyncIterable<string> | null> {
  if (!('Summarizer' in self)) return null;
  if (!isReady(await Summarizer.availability().catch(() => 'unavailable'))) return null;
  const s = await Summarizer.create({
    type: 'tl;dr', format: 'markdown', length: 'short',
    expectedInputLanguages: ['en'], outputLanguage: 'en',
  });
  return streamFrom(s, 'summarizeStreaming', text, () => s.destroy?.());
}

async function adaptRewriter(action: Action, text: string, _opts: { sourceLang?: string }): Promise<AsyncIterable<string> | null> {
  if (!('Rewriter' in self) || action !== 'shorter') return null;
  if (!isReady(await Rewriter.availability().catch(() => 'unavailable'))) return null;
  const r = await Rewriter.create({
    length: 'shorter', format: 'markdown',
    expectedInputLanguages: ['en'], outputLanguage: 'en',
  });
  return streamFrom(r, 'rewriteStreaming', text, () => r.destroy?.());
}

async function detectLang(text: string): Promise<string | null> {
  if (!('LanguageDetector' in self)) return null;
  try {
    if (!isReady(await LanguageDetector.availability().catch(() => 'unavailable'))) return null;
    const det = await LanguageDetector.create();
    const results = await det.detect(text);
    det.destroy?.();
    return results?.[0]?.detectedLanguage?.split('-')[0].toLowerCase() || null;
  } catch { return null; }
}

function browserLang(): string {
  return (navigator.language || 'en').split('-')[0].toLowerCase();
}

async function adaptTranslator(_action: Action, text: string, opts: { sourceLang?: string }): Promise<AsyncIterable<string> | null> {
  if (!('Translator' in self)) return null;
  const target = browserLang();
  const source = opts?.sourceLang || (await detectLang(text)) || 'en';
  if (source === target) return null;
  const avail = await Translator.availability({ sourceLanguage: source, targetLanguage: target }).catch(() => 'unavailable');
  if (!isReady(avail)) return null;
  const t = await Translator.create({ sourceLanguage: source, targetLanguage: target });
  return streamFrom(t, 'translateStreaming', text, () => t.destroy?.());
}

async function adaptPrompt(action: Action, text: string, _opts: { sourceLang?: string }): Promise<AsyncIterable<string> | null> {
  if (typeof LanguageModel === 'undefined') return null;
  if (!isReady(await LanguageModel.availability().catch(() => 'unavailable'))) return null;
  const target = browserLang();
  const targetName = LANG_NAMES[target] || target.toUpperCase();
  const userPrompts: Record<Action, string> = {
    summary:    `Summarize the following text in 2-4 short bullets. Keep it concrete and skim-friendly.\n\n---\n${text}`,
    shorter:    `Rewrite the following text to be noticeably shorter while preserving the key points. Match the original tone.\n\n---\n${text}`,
    bullets:    `Reformat the following text as a concise bulleted list of the main points. Use Markdown bullets, no preamble.\n\n---\n${text}`,
    translated: `Translate the following text to ${targetName}. Output only the translation in Markdown, no commentary.\n\n---\n${text}`,
  };
  // Chrome refuses to stream non-English output unless the session attests the target language.
  const outputLangs = action === 'translated' ? ['en', target] : ['en'];
  const session = await LanguageModel.create({
    initialPrompts: [{ role: 'system', content: 'You are a precise text-transformation assistant. Reply with only the transformed text.' }],
    temperature: 0.3,
    topK: 3,
    expectedOutputs: [{ type: 'text', languages: outputLangs }],
  });
  return streamFrom(session, 'promptStreaming', userPrompts[action], () => session.destroy?.());
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', ja: 'Japanese', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', zh: 'Chinese', ko: 'Korean', hi: 'Hindi',
  ar: 'Arabic', ru: 'Russian', nl: 'Dutch', tr: 'Turkish', pl: 'Polish',
};

render();

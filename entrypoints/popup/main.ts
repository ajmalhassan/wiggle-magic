import './popup.css';
import { renderMarkdownInto } from '@/src/lib/markdown';
import type { MemoryEntry } from '@/src/lib/types';
import { chromeKV } from '@/src/lib/storage';
import { KEYS } from '@/src/lib/storage-keys';

const kv = chromeKV();

let cachedMemory: MemoryEntry[] = [];

const listEl    = document.getElementById('list')!;
const emptyEl   = document.getElementById('empty')!;
const subEl     = document.getElementById('sub')!;
const clearBtn  = document.getElementById('clear') as HTMLButtonElement;
const exportBtn = document.getElementById('export') as HTMLButtonElement;
const settings  = document.getElementById('settings')!;
const rowTpl    = document.getElementById('row-tpl') as HTMLTemplateElement;

settings.addEventListener('click', () => chrome.runtime.openOptionsPage());

async function render(): Promise<void> {
  const wm_memory = (await kv.get<MemoryEntry[]>(KEYS.memory)) ?? [];
  cachedMemory = wm_memory;
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
  const next = cachedMemory.filter(e => e.id !== id);
  cachedMemory = next;
  await kv.set(KEYS.memory, next);
}

clearBtn.addEventListener('click', async () => {
  if (!confirm('Clear all saved answers? This cannot be undone.')) return;
  await kv.set(KEYS.memory, []);
  render();
});

exportBtn.addEventListener('click', async () => {
  const md = toMarkdown(cachedMemory);
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

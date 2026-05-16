import type { WmSettings } from '@/src/lib/types';

const tabs = document.querySelectorAll<HTMLButtonElement>('.options-tab');
const sections = document.querySelectorAll<HTMLElement>('section.tab');
for (const t of tabs) {
  t.addEventListener('click', () => {
    for (const x of tabs) x.classList.toggle('active', x === t);
    const name = t.dataset.tab!;
    for (const s of sections) s.hidden = s.dataset.tab !== name;
  });
}

type Settings = Partial<WmSettings>;

const backendEl  = document.getElementById('backend')  as HTMLSelectElement;
const providerEl = document.getElementById('provider') as HTMLSelectElement;
const keyEl      = document.getElementById('apiKey')   as HTMLInputElement;
const modelEl    = document.getElementById('model')    as HTMLInputElement;
const modelHint  = document.getElementById('modelHint')!;
const saveBtn    = document.getElementById('save') as HTMLButtonElement;
const savedMsg   = document.getElementById('saved')!;
const nanoStatus = document.getElementById('nano-status')!;
const dlBtn      = document.getElementById('nano-download') as HTMLButtonElement;
const dlProgress = document.getElementById('dl-progress')!;
const dlBarFill  = document.getElementById('dl-bar-fill') as HTMLElement;
const dlPct      = document.getElementById('dl-pct')!;
const welcomeEl   = document.getElementById('welcome') as HTMLElement;
const welcomeGo   = document.getElementById('welcome-go')!;
const welcomeSkip = document.getElementById('welcome-skip')!;

const DEFAULT_MODELS: Record<string, string> = {
  openai:    'gpt-5.4-mini',
  anthropic: 'claude-haiku-4-5',
  gemini:    'gemini-2.5-flash',
};

function updateHint(): void {
  modelHint.textContent = `defaults to ${DEFAULT_MODELS[providerEl.value]}`;
}
providerEl.addEventListener('change', updateHint);

async function load(): Promise<void> {
  const got = await chrome.storage.sync.get(['wm_settings', 'wm_welcomed']) as {
    wm_settings?: Settings;
    wm_welcomed?: boolean;
  };
  const wm_settings = got.wm_settings ?? {};
  backendEl.value  = wm_settings.backend  || 'auto';
  providerEl.value = wm_settings.provider || 'openai';
  keyEl.value      = wm_settings.apiKey   || '';
  modelEl.value    = wm_settings.model    || '';
  updateHint();
  if (!got.wm_welcomed) welcomeEl.hidden = false;
  checkNano();
}

async function dismissWelcome(): Promise<void> {
  welcomeEl.hidden = true;
  await chrome.storage.sync.set({ wm_welcomed: true });
}
welcomeGo.addEventListener('click', async () => {
  await dismissWelcome();
  document.getElementById('ai-backend')!.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
welcomeSkip.addEventListener('click', dismissWelcome);

async function checkNano(): Promise<void> {
  nanoStatus.classList.remove('ok', 'bad');
  dlBtn.hidden = true;
  dlProgress.hidden = true;

  if (typeof LanguageModel === 'undefined') {
    nanoStatus.textContent = '⚠ Gemini Nano API not detected (needs Chrome 138+ on supported hardware).';
    nanoStatus.classList.add('bad');
    return;
  }
  try {
    const avail = await LanguageModel.availability();
    if (avail === 'available' || avail === 'readily') {
      nanoStatus.textContent = '✓ Gemini Nano is available on this device.';
      nanoStatus.classList.add('ok');
    } else if (avail === 'downloadable') {
      nanoStatus.textContent = "Gemini Nano is supported, but the on-device model (~2 GB) hasn't been downloaded yet.";
      dlBtn.hidden = false;
    } else if (avail === 'downloading' || avail === 'after-download') {
      nanoStatus.textContent = 'Gemini Nano is downloading in the background. This can take a few minutes; reload this page to recheck.';
    } else {
      nanoStatus.textContent = `Gemini Nano is unavailable on this device (status: ${avail}). BYOK fallback will be used.`;
      nanoStatus.classList.add('bad');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    nanoStatus.textContent = `Could not check Gemini Nano availability: ${msg}`;
    nanoStatus.classList.add('bad');
  }
}

dlBtn.addEventListener('click', async () => {
  dlBtn.hidden = true;
  dlProgress.hidden = false;
  nanoStatus.classList.remove('ok', 'bad');
  nanoStatus.textContent = 'Starting download…';
  try {
    const session = await LanguageModel.create({
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          // e.loaded is a 0–1 fraction.
          const pct = Math.round((e.loaded ?? 0) * 100);
          dlBarFill.style.width = pct + '%';
          dlPct.textContent = pct + '%';
          nanoStatus.textContent = `Downloading Gemini Nano… ${pct}%`;
        });
      },
    });
    try { session.destroy?.(); } catch { /* swallow */ }
    dlProgress.hidden = true;
    await checkNano();
  } catch (err) {
    dlProgress.hidden = true;
    dlBtn.hidden = false;
    const msg = err instanceof Error ? err.message : String(err);
    nanoStatus.textContent = `Download failed: ${msg}. Try the manual steps below, or use a BYOK key.`;
    nanoStatus.classList.add('bad');
  }
});

saveBtn.addEventListener('click', async () => {
  const wm_settings: Settings = {
    backend:  backendEl.value,
    provider: providerEl.value,
    apiKey:   keyEl.value.trim(),
    model:    modelEl.value.trim(),
  };
  await chrome.storage.sync.set({ wm_settings });
  savedMsg.classList.add('show');
  setTimeout(() => savedMsg.classList.remove('show'), 1400);
});

load();

import { initActionsUI } from './actions-library';
initActionsUI().catch(err => console.error('[wm options] actions UI init failed:', err));

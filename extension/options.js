const backendEl  = document.getElementById('backend');
const providerEl = document.getElementById('provider');
const keyEl      = document.getElementById('apiKey');
const modelEl    = document.getElementById('model');
const modelHint  = document.getElementById('modelHint');
const saveBtn    = document.getElementById('save');
const savedMsg   = document.getElementById('saved');
const nanoStatus = document.getElementById('nano-status');

const DEFAULT_MODELS = {
  openai:    'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
  gemini:    'gemini-2.0-flash',
};

function updateHint() {
  modelHint.textContent = `defaults to ${DEFAULT_MODELS[providerEl.value]}`;
}
providerEl.addEventListener('change', updateHint);

async function load() {
  const { wm_settings = {} } = await chrome.storage.sync.get('wm_settings');
  backendEl.value  = wm_settings.backend  || 'auto';
  providerEl.value = wm_settings.provider || 'openai';
  keyEl.value      = wm_settings.apiKey   || '';
  modelEl.value    = wm_settings.model    || '';
  updateHint();
  checkNano();
}

async function checkNano() {
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
    } else if (avail === 'after-download' || avail === 'downloading') {
      nanoStatus.textContent = `Gemini Nano model status: ${avail}. It will be ready after the browser finishes downloading it.`;
    } else {
      nanoStatus.textContent = `Gemini Nano is unavailable on this device (status: ${avail}). BYOK fallback will be used.`;
      nanoStatus.classList.add('bad');
    }
  } catch (err) {
    nanoStatus.textContent = `Could not check Gemini Nano availability: ${err.message}`;
    nanoStatus.classList.add('bad');
  }
}

saveBtn.addEventListener('click', async () => {
  const wm_settings = {
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

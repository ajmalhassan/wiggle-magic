// entrypoints/content/sidebar/banners.ts

export function renderRestorationBanner(onStartFresh: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sidebar-banner restoration';
  el.innerHTML = `
    <span>↻ Continuing your previous conversation about this page.</span>
    <button class="banner-action" type="button">Start fresh</button>
  `;
  el.querySelector<HTMLButtonElement>('.banner-action')!.addEventListener('click', () => {
    onStartFresh();
    el.remove();
  });
  return el;
}

export function renderTrimNotice(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sidebar-banner trim';
  el.textContent = 'Older turns trimmed';
  return el;
}

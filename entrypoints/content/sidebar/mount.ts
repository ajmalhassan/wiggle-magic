// entrypoints/content/sidebar/mount.ts
import './sidebar.css';

const WIDTH_DEFAULT = 420;

export interface SidebarMount {
  root: HTMLElement;
  header: HTMLElement;
  body: HTMLElement;
  composer: HTMLElement;
  open(): void;
  close(): void;
}

export function createSidebarMount(parent: HTMLElement): SidebarMount {
  document.documentElement.style.setProperty('--wm-sidebar-w', `${WIDTH_DEFAULT}px`);

  const root = document.createElement('aside');
  root.id = 'wm-sidebar';
  root.setAttribute('role', 'complementary');
  root.setAttribute('aria-label', 'Magic conversation');
  root.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-title">
        <svg viewBox="-3 -3 6 6" width="14" height="14" aria-hidden="true">
          <polygon points="0,-2.6 0.7,-0.7 2.6,0 0.7,0.7 0,2.6 -0.7,0.7 -2.6,0 -0.7,-0.7" fill="#7df9ff"/>
        </svg>
        Magic
        <span class="backend-pill" id="wm-backend-pill" hidden>
          <span class="dot"></span>
          <span class="label">Nano · on-device</span>
        </span>
      </div>
      <button class="sidebar-close" type="button" aria-label="Close">×</button>
    </div>
    <div class="sidebar-body" role="log" aria-live="polite"></div>
    <div class="sidebar-composer"></div>
  `;
  parent.appendChild(root);

  const header = root.querySelector<HTMLElement>('.sidebar-header')!;
  const body = root.querySelector<HTMLElement>('.sidebar-body')!;
  const composer = root.querySelector<HTMLElement>('.sidebar-composer')!;

  return {
    root, header, body, composer,
    open() {
      document.documentElement.classList.add('wm-sidebar-open');
      requestAnimationFrame(() => root.classList.add('visible'));
    },
    close() {
      root.classList.remove('visible');
      document.documentElement.classList.remove('wm-sidebar-open');
    },
  };
}

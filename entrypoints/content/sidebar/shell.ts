// entrypoints/content/sidebar/shell.ts
import type { State } from '../state';
import type { Backend } from '@/src/lib/types/thread';
import type { SidebarMount } from './mount';

export interface Shell {
  setBackend(b: Backend, available: boolean): void;
}

const BACKEND_LABEL: Record<Backend, string> = {
  nano: 'Nano · on-device',
  openai: 'OpenAI · cloud',
  anthropic: 'Anthropic · cloud',
  gemini: 'Gemini · cloud',
};

export function createShell(mount: SidebarMount, state: State): Shell {
  const closeBtn = mount.root.querySelector<HTMLButtonElement>('.sidebar-close')!;
  closeBtn.addEventListener('click', () => state.emit('sidebar:close', {}));

  const pill = mount.root.querySelector<HTMLElement>('#wm-backend-pill')!;
  const pillLabel = pill.querySelector<HTMLElement>('.label')!;

  return {
    setBackend(b, available) {
      pill.hidden = false;
      pillLabel.textContent = BACKEND_LABEL[b];
      pill.classList.toggle('cloud', b !== 'nano');
      pill.setAttribute('aria-label', b === 'nano' ? 'On-device AI' : `Cloud AI via ${b}`);
      pill.style.opacity = available ? '1' : '0.5';
    },
  };
}

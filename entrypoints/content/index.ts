import './content.css';
import type { PickRef, UserTurn, MagicTurn, Thread } from '@/src/lib/types/thread';
import type { WmSettings } from '@/src/lib/types';
import { createWiggleDetector, DEFAULT_WIGGLE_OPTS } from '@/src/lib/picker/detect-wiggle';
import { resolveTarget } from '@/src/lib/picker/resolve-target';
import { classifyPick } from '@/src/lib/picker/classify-pick';
import { extractPayload } from '@/src/lib/picker/extract-payload';
import { chromeKV } from '@/src/lib/storage';
import { createRegistry } from '@/src/lib/actions/registry';
import { createThreadStore } from '@/src/lib/thread/store';
import { createThreadOperations } from '@/src/lib/thread/operations';
import { buildAdapterMap } from '@/src/lib/ai/adapters';
import { selectAdapter } from '@/src/lib/actions/api-route';
import { buildPrompt } from '@/src/lib/actions/prompt-builder';
import { activeBackend } from '@/src/lib/ai/backend';
import { BUILTIN_MODIFIERS } from '@/src/lib/actions/builtins/modifiers';

import { createState } from './state';
import { createOverlay } from './overlay';
import { createPill } from './pill';
import { createSidebarMount } from './sidebar/mount';
import { createShell } from './sidebar/shell';
import { createComposer } from './sidebar/composer';
import { createSlashMenu } from './sidebar/slash-menu';
import { createTurnList } from './sidebar/turn-list';
import { renderRestorationBanner } from './sidebar/banners';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',
  async main() {
    const root = document.createElement('div');
    root.id = 'wm-root';
    document.documentElement.appendChild(root);

    const kv = chromeKV();
    const registry = await createRegistry(kv);
    const threadStore = createThreadStore(kv);
    const threadOps = createThreadOperations(threadStore, kv);
    const adapters = buildAdapterMap();
    const state = createState();

    const cursorUrl = chrome.runtime.getURL('cursor.svg');
    const overlay = createOverlay(root, cursorUrl);
    overlay.mount();

    const pill = createPill(root);
    pill.onCommit(() => commit());
    pill.onChipRemove((id) => removePick(id));

    const sidebar = createSidebarMount(root);
    const shell = createShell(sidebar, state);
    const composer = createComposer(sidebar.composer, state, registry);
    const slashMenu = createSlashMenu(sidebar.composer, registry);

    const turnList = createTurnList(sidebar.body, registry, {
      onSave: async (m) => {
        if (currentThread) await threadOps.promoteToMemory(currentThread, m);
      },
      onCopy: async (m) => {
        try { await navigator.clipboard.writeText(m.answer); } catch { /* ignored */ }
      },
      onRerun: async (m) => { await rerun(m); },
      onBackRefClick: (selector) => {
        const el = document.querySelector(selector);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    });

    // ---------- coachmark (first-run onboarding) ----------
    const coach = document.createElement('div');
    coach.id = 'wm-coach';
    coach.setAttribute('role', 'dialog');
    coach.setAttribute('aria-label', 'Welcome to Magic');
    coach.hidden = true;
    coach.innerHTML = `
      <div class="step">① Wiggle your cursor — already!</div>
      <div class="step">② Click anything to pick it.</div>
      <div class="step">③ Press <kbd>⏎</kbd> for Magic.</div>
      <div class="tip">Tip: <kbd>Alt</kbd>+<kbd>⇧</kbd>+<kbd>M</kbd> does the same.</div>
      <button id="wm-coach-dismiss" type="button">Got it</button>
    `;
    root.appendChild(coach);

    let coachSeen: boolean | null = null; // null = unknown, true/false = cached

    async function maybeShowCoach(): Promise<void> {
      if (coachSeen) return;
      if (coachSeen === null) {
        const { 'wm:first-run': seen } = await chrome.storage.local.get('wm:first-run') as { 'wm:first-run'?: boolean };
        coachSeen = !!seen;
        if (coachSeen) return;
      }
      coach.hidden = false;
      requestAnimationFrame(() => coach.classList.add('visible'));
    }

    async function dismissCoach(): Promise<void> {
      coachSeen = true;
      coach.classList.remove('visible');
      setTimeout(() => { coach.hidden = true; }, 220);
      await chrome.storage.local.set({ 'wm:first-run': true });
    }

    coach.querySelector('#wm-coach-dismiss')?.addEventListener('click', dismissCoach);

    // ---------- picker state ----------
    let stagingPicks: PickRef[] = [];
    let pickIdCounter = 0;
    let currentThread: Thread | null = null;

    const wiggle = createWiggleDetector(DEFAULT_WIGGLE_OPTS);
    let cursorX = 0, cursorY = 0;
    let lastHover: Element | null = null;

    function buildSelector(el: Element): string {
      const parts: string[] = [];
      let cur: Element | null = el;
      while (cur && cur !== document.body && parts.length < 6) {
        let s = cur.tagName.toLowerCase();
        if (cur.id) { parts.unshift(`${s}#${cur.id}`); break; }
        if (cur.parentElement) {
          const i = Array.from(cur.parentElement.children).indexOf(cur) + 1;
          s += `:nth-child(${i})`;
        }
        parts.unshift(s);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    }

    function makePickRef(el: Element): PickRef {
      const selector = buildSelector(el);
      const payload = extractPayload(el, selector);
      const tags = classifyPick(el);
      const labelText = (payload.text || payload.image?.alt || payload.link?.text || el.tagName).trim();
      const label = labelText.length > 60 ? labelText.slice(0, 57) + '…' : labelText;
      return {
        id: `pick-${++pickIdCounter}`,
        type: payload.image ? 'img'
            : payload.link ? 'link'
            : (payload.tag === 'button' || payload.tag === 'a') ? 'control'
            : (payload.tag === 'video' || payload.tag === 'audio') ? 'media'
            : 'text',
        tags,
        label,
        selector,
        payload,
      };
    }

    // ---------- mode transitions ----------
    function activate() {
      state.setMode('selecting');
      document.body.classList.add('wm-active');
      pill.mount();
      pill.setPicks(stagingPicks);
      overlay.setCursor(cursorX, cursorY, true);
      maybeShowCoach();
    }

    function deactivate() {
      stagingPicks = [];
      pill.unmount();
      overlay.setCursor(cursorX, cursorY, false);
      overlay.setHighlight(null, false);
      overlay.setTag(null, '');
      document.body.classList.remove('wm-active');
      state.setMode('idle');
    }

    function removePick(id: string) {
      stagingPicks = stagingPicks.filter(p => p.id !== id);
      pill.setPicks(stagingPicks);
      if (stagingPicks.length === 0 && state.getMode() === 'selecting') deactivate();
    }

    async function getSettings(): Promise<WmSettings> {
      const out = await chrome.storage.sync.get('wm_settings') as { wm_settings?: WmSettings };
      return out.wm_settings ?? { backend: 'nano', provider: '', apiKey: '', model: '' };
    }

    function getPageMeta() {
      return { host: location.host, title: document.title, primaryLang: document.documentElement.lang || 'en' };
    }

    async function commit() {
      if (stagingPicks.length === 0) return;
      const picks = [...stagingPicks];
      stagingPicks = [];
      pill.unmount();
      overlay.setCursor(cursorX, cursorY, false);
      overlay.setHighlight(null, false);
      document.body.classList.remove('wm-active');
      dismissCoach();

      const origin = window.location.origin;
      const pathname = window.location.pathname;
      const settings = await getSettings();
      const backend = activeBackend(settings);

      const fresh = await threadStore.loadIfFresh(origin, pathname);
      const isRestored = fresh !== null && fresh.turns.length > 0;
      currentThread = fresh ?? {
        id: `${origin}${pathname}`,
        origin, pathname,
        title: document.title || '(untitled)',
        turns: [],
        createdAt: Date.now(),
        lastTouchedAt: Date.now(),
      };
      await threadStore.save(currentThread);

      sidebar.open();
      shell.setBackend(backend, true);
      state.setMode('sidebar');

      turnList.reset(currentThread.turns);
      if (isRestored) {
        sidebar.body.insertBefore(renderRestorationBanner(async () => {
          await threadStore.archive(origin, pathname);
          currentThread = {
            id: `${origin}${pathname}`,
            origin, pathname,
            title: document.title || '(untitled)',
            turns: [],
            createdAt: Date.now(),
            lastTouchedAt: Date.now(),
          };
          await threadStore.save(currentThread);
          turnList.reset([]);
        }), sidebar.body.firstChild);
      }

      composer.setPicks(picks);
      const ctx = { picks, thread: currentThread, backend, pageMeta: getPageMeta() };
      composer.setContext(ctx);
      slashMenu.setContext(ctx);
    }

    async function runAction(
      userTurn: UserTurn,
      magic: MagicTurn,
      handle: ReturnType<typeof turnList.appendMagic>,
    ) {
      const action = registry.getById(userTurn.actionId);
      if (!action) {
        handle.showError('action-missing', 'This action was removed.');
        return;
      }
      const adapter = selectAdapter(action.apiPreference, action.fallback, adapters);
      if (!adapter || !adapter.run) {
        handle.showError('nano-unavailable', 'On-device AI isn\'t ready and no fallback is available.');
        return;
      }
      const prompt = buildPrompt(action.prompt, {
        picks: userTurn.picks,
        question: userTurn.text,
        pageMeta: getPageMeta(),
        modifiers: userTurn.modifiers,
        url: location.href,
        modifierAddenda: Object.fromEntries(BUILTIN_MODIFIERS.map(m => [m.id, m.promptAddendum])),
      });
      const controller = new AbortController();
      try {
        const stream = await adapter.run(prompt, controller.signal);
        let full = '';
        for await (const chunk of stream.chunks()) {
          full += chunk;
          handle.appendChunk(chunk);
        }
        magic.answer = full;
        magic.status = 'done';
        handle.finalize(full);
        if (currentThread) {
          currentThread = await threadOps.appendTurn(currentThread.origin, currentThread.pathname, magic);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        handle.showError('stream-failed', `The model stopped: ${msg}`);
        magic.status = 'error';
        magic.errorCode = 'stream-failed';
      }
    }

    state.on('turn:submit', async ({ actionId, modifiers, text, picks }) => {
      if (!currentThread) return;
      const settings = await getSettings();
      const backend = activeBackend(settings);

      const userTurn: UserTurn = {
        id: crypto.randomUUID(),
        role: 'user',
        kind: text !== undefined ? 'ask' : 'hero',
        actionId, modifiers,
        text,
        picks,
        ts: Date.now(),
      };
      currentThread = await threadOps.appendTurn(currentThread.origin, currentThread.pathname, userTurn);
      turnList.appendUser(userTurn);

      const magic: MagicTurn = {
        id: crypto.randomUUID(),
        role: 'magic',
        inReplyTo: userTurn.id,
        answer: '',
        sources: picks,
        status: 'streaming',
        backend,
        ts: Date.now(),
      };
      const handle = turnList.appendMagic(magic);
      await runAction(userTurn, magic, handle);
    });

    async function rerun(oldMagic: MagicTurn) {
      if (!currentThread) return;
      const userTurn = currentThread.turns.find(
        t => t.role === 'user' && t.id === oldMagic.inReplyTo,
      ) as UserTurn | undefined;
      if (!userTurn) return;

      const replacement: MagicTurn = {
        ...oldMagic,
        id: crypto.randomUUID(),
        answer: '',
        status: 'streaming',
        ts: Date.now(),
      };
      const handle = turnList.replaceMagic(oldMagic.id, replacement);
      await runAction(userTurn, replacement, handle);
      if (currentThread) {
        currentThread = await threadOps.rerunTurn(currentThread.origin, currentThread.pathname, oldMagic.id, replacement);
      }
    }

    // ---------- +Add re-entry ----------
    state.on('add-clicked', () => {
      if (state.getMode() !== 'sidebar') return;
      state.setMode('sidebar+selecting');
      document.body.classList.add('wm-active');
      pill.mount();
      pill.setPicks(stagingPicks);
      overlay.setCursor(cursorX, cursorY, true);
    });

    function commitStaging() {
      if (state.getMode() !== 'sidebar+selecting') return;
      composer.setPicks([...composer.getStagedPicks(), ...stagingPicks]);
      stagingPicks = [];
      pill.unmount();
      overlay.setCursor(cursorX, cursorY, false);
      overlay.setHighlight(null, false);
      document.body.classList.remove('wm-active');
      state.setMode('sidebar');
      composer.focusInput();
    }

    // ---------- sidebar close ----------
    state.on('sidebar:close', () => {
      sidebar.close();
      currentThread = null;
      state.setMode('idle');
    });

    // ---------- input handlers ----------
    document.addEventListener('mousemove', (e) => {
      cursorX = e.clientX;
      cursorY = e.clientY;
      const mode = state.getMode();
      if (mode !== 'selecting' && mode !== 'sidebar+selecting') {
        if (wiggle.observe(cursorX, cursorY, performance.now())) {
          if (mode === 'idle') activate();
          else if (mode === 'sidebar') state.emit('add-clicked', {});
        }
        return;
      }
      overlay.setCursor(cursorX, cursorY, true);
      const leaf = document.elementFromPoint(cursorX, cursorY);
      if (!leaf || leaf.closest('#wm-root')) {
        overlay.setHighlight(null, false);
        overlay.setTag(null, '');
        return;
      }
      const resolved = resolveTarget(leaf);
      if (resolved === lastHover) return;
      lastHover = resolved;
      const rect = resolved.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        overlay.setHighlight(null, false);
        return;
      }
      const sel = buildSelector(resolved);
      const picked = stagingPicks.some(p => p.selector === sel);
      overlay.setHighlight(rect, picked);
      overlay.setTag(rect, resolved.tagName.toLowerCase());
    }, { capture: true });

    document.addEventListener('click', (e) => {
      const mode = state.getMode();
      if (mode !== 'selecting' && mode !== 'sidebar+selecting') return;
      const leaf = document.elementFromPoint(e.clientX, e.clientY);
      if (!leaf || leaf.closest('#wm-root')) return;
      e.preventDefault();
      e.stopPropagation();
      const resolved = resolveTarget(leaf);
      const newPick = makePickRef(resolved);
      const dupIdx = stagingPicks.findIndex(p => p.selector === newPick.selector);
      if (dupIdx >= 0) stagingPicks.splice(dupIdx, 1);
      else stagingPicks.push(newPick);
      pill.setPicks(stagingPicks);
    }, { capture: true });

    document.addEventListener('keydown', (e) => {
      const mode = state.getMode();
      if (mode === 'selecting' && e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (mode === 'sidebar+selecting' && e.key === 'Enter') {
        e.preventDefault();
        commitStaging();
      } else if (e.key === 'Escape') {
        if (mode === 'selecting') { e.preventDefault(); deactivate(); }
        else if (mode === 'sidebar+selecting') {
          e.preventDefault();
          state.setMode('sidebar');
          pill.unmount();
          stagingPicks = [];
        }
        else if (mode === 'sidebar') { e.preventDefault(); state.emit('sidebar:close', {}); }
      } else if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        if (mode === 'idle') activate();
        else if (mode === 'sidebar') state.emit('add-clicked', {});
      }
    }, { capture: true });
  },
});

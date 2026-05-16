// entrypoints/content/state.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createState, type Mode } from './state';

describe('state machine + event bus', () => {
  let s: ReturnType<typeof createState>;
  beforeEach(() => { s = createState(); });

  it('starts in idle', () => {
    expect(s.getMode()).toBe('idle');
  });

  it('setMode emits mode:change with from/to', () => {
    const seen: Array<{ from: Mode; to: Mode }> = [];
    s.on('mode:change', (e) => seen.push(e));
    s.setMode('selecting');
    expect(seen).toEqual([{ from: 'idle', to: 'selecting' }]);
    expect(s.getMode()).toBe('selecting');
  });

  it('setMode does not emit when the mode does not change', () => {
    let count = 0;
    s.on('mode:change', () => count++);
    s.setMode('idle');
    expect(count).toBe(0);
  });

  it('off() removes a listener', () => {
    let count = 0;
    const fn = () => count++;
    s.on('mode:change', fn);
    s.off('mode:change', fn);
    s.setMode('selecting');
    expect(count).toBe(0);
  });

  it('emits typed events to typed listeners', () => {
    const seen: any[] = [];
    s.on('commit', (e) => seen.push(e));
    s.emit('commit', { picks: [] });
    expect(seen).toEqual([{ picks: [] }]);
  });
});

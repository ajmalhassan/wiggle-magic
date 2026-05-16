import { describe, it, expect } from 'vitest';
import { createWiggleDetector, DEFAULT_WIGGLE_OPTS } from './detect-wiggle';

function feed(d: ReturnType<typeof createWiggleDetector>, samples: { x: number; y: number; t: number }[]) {
  let triggered = false;
  for (const s of samples) {
    if (d.observe(s.x, s.y, s.t)) triggered = true;
  }
  return triggered;
}

describe('createWiggleDetector', () => {
  it('does not fire under minSamples', () => {
    const d = createWiggleDetector();
    expect(feed(d, [{ x: 0, y: 0, t: 0 }, { x: 10, y: 0, t: 10 }])).toBe(false);
  });

  it('fires on a tight zig-zag with enough reversals', () => {
    const d = createWiggleDetector();
    const samples = [
      { x: 0,  y: 0, t: 0 },
      { x: 20, y: 0, t: 10 },
      { x: 0,  y: 0, t: 20 },
      { x: 20, y: 0, t: 30 },
      { x: 0,  y: 0, t: 40 },
      { x: 20, y: 0, t: 50 },
    ];
    expect(feed(d, samples)).toBe(true);
  });

  it('respects cooldown — does not fire twice in close succession', () => {
    const d = createWiggleDetector();
    const burst = [
      { x: 0,  y: 0, t: 0 },
      { x: 20, y: 0, t: 10 },
      { x: 0,  y: 0, t: 20 },
      { x: 20, y: 0, t: 30 },
      { x: 0,  y: 0, t: 40 },
      { x: 20, y: 0, t: 50 },
    ];
    expect(feed(d, burst)).toBe(true);
    const repeat = burst.map(s => ({ ...s, t: s.t + 100 }));
    expect(feed(d, repeat)).toBe(false);
  });

  it('does not fire when motion exceeds maxRadius (drift, not wiggle)', () => {
    const d = createWiggleDetector();
    const drift = [
      { x: 0,   y: 0, t: 0 },
      { x: 200, y: 0, t: 10 },
      { x: 0,   y: 0, t: 20 },
      { x: 300, y: 0, t: 30 },
      { x: 0,   y: 0, t: 40 },
      { x: 400, y: 0, t: 50 },
    ];
    expect(feed(d, drift)).toBe(false);
  });

  it('exposes default opts', () => {
    expect(DEFAULT_WIGGLE_OPTS.windowMs).toBe(600);
    expect(DEFAULT_WIGGLE_OPTS.minReversals).toBe(4);
  });
});

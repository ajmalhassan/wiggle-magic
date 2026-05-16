export interface WiggleOpts {
  windowMs: number;
  minReversals: number;
  maxRadius: number;
  minSpeedPxMs: number;
  minDx: number;
  minSamples: number;
  cooldownMs: number;
}

export const DEFAULT_WIGGLE_OPTS: WiggleOpts = {
  windowMs: 600,
  minReversals: 4,
  maxRadius: 220,
  minSpeedPxMs: 0.25,
  minDx: 3,
  minSamples: 5,
  cooldownMs: 1200,
};

interface Sample { x: number; y: number; t: number; }

export interface WiggleDetector {
  /** Feed a pointer sample. Returns true on the frame the gesture fires. */
  observe(x: number, y: number, t: number): boolean;
  reset(): void;
}

export function createWiggleDetector(opts: WiggleOpts = DEFAULT_WIGGLE_OPTS): WiggleDetector {
  const samples: Sample[] = [];
  let lastTrigger = -Infinity;

  return {
    observe(x, y, t) {
      if (t - lastTrigger < opts.cooldownMs) return false;
      samples.push({ x, y, t });
      while (samples.length && t - samples[0].t > opts.windowMs) samples.shift();
      if (samples.length < opts.minSamples) return false;

      let reversals = 0;
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let dist = 0;
      let dirPrev = 0;
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1], b = samples[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        dist += Math.hypot(dx, dy);
        if (Math.abs(dx) >= opts.minDx) {
          const dir = dx > 0 ? 1 : -1;
          if (dirPrev && dir !== dirPrev) reversals++;
          dirPrev = dir;
        }
        if (b.x < minX) minX = b.x; if (b.x > maxX) maxX = b.x;
        if (b.y < minY) minY = b.y; if (b.y > maxY) maxY = b.y;
      }
      const dt = samples[samples.length - 1].t - samples[0].t;
      const speed = dist / Math.max(dt, 1);
      const radius = Math.max(maxX - minX, maxY - minY);

      if (reversals >= opts.minReversals && radius <= opts.maxRadius && speed >= opts.minSpeedPxMs) {
        lastTrigger = t;
        samples.length = 0;
        return true;
      }
      return false;
    },
    reset() {
      samples.length = 0;
      lastTrigger = -Infinity;
    },
  };
}

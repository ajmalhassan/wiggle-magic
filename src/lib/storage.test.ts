import { describe, it, expect, beforeEach } from 'vitest';
import { memoryKV } from './storage';

describe('memoryKV', () => {
  let kv: ReturnType<typeof memoryKV>;
  beforeEach(() => { kv = memoryKV(); });

  it('returns null for a missing key', async () => {
    expect(await kv.get('absent')).toBeNull();
  });

  it('round-trips an object', async () => {
    await kv.set('user', { name: 'Ada' });
    expect(await kv.get('user')).toEqual({ name: 'Ada' });
  });

  it('removes a key', async () => {
    await kv.set('k', 1);
    await kv.remove('k');
    expect(await kv.get('k')).toBeNull();
  });

  it('lists keys by prefix', async () => {
    await kv.set('wm:thread:a', 1);
    await kv.set('wm:thread:b', 2);
    await kv.set('wm:memory', 3);
    const keys = await kv.keys('wm:thread:');
    expect(keys.sort()).toEqual(['wm:thread:a', 'wm:thread:b']);
  });
});

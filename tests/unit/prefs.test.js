import { describe, it, expect } from 'vitest';
import { loadVolume, saveVolume } from '../../src/audio/prefs.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};
const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };

describe('volume prefs', () => {
  it('round-trips volume and mute', () => {
    const s = memory();
    saveVolume(s, { volume: 0.4, muted: true });
    expect(loadVolume(s)).toEqual({ volume: 0.4, muted: true });
  });
  it('returns null when nothing, or garbage, is stored', () => {
    const s = memory();
    expect(loadVolume(s)).toBeNull();
    s.setItem('audioplayer.volume', '{not json');
    expect(loadVolume(s)).toBeNull();
    s.setItem('audioplayer.volume', JSON.stringify({ volume: 7 }));
    expect(loadVolume(s)).toBeNull();
  });
  it('never throws when storage is missing or blocked', () => {
    expect(loadVolume(null)).toBeNull();
    expect(loadVolume(throwing)).toBeNull();
    expect(() => saveVolume(throwing, { volume: 1, muted: false })).not.toThrow();
    expect(() => saveVolume(null, { volume: 1, muted: false })).not.toThrow();
  });
});

describe('shuffle pref', () => {
  it('round-trips and defaults to off', async () => {
    const { loadShuffle, saveShuffle } = await import('../../src/audio/prefs.js');
    const s = memory();
    expect(loadShuffle(s)).toBe(false);
    saveShuffle(s, true);
    expect(loadShuffle(s)).toBe(true);
    saveShuffle(s, false);
    expect(loadShuffle(s)).toBe(false);
    expect(loadShuffle(throwing)).toBe(false);
    expect(() => saveShuffle(throwing, true)).not.toThrow();
  });
});

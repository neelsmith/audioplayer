import { describe, it, expect } from 'vitest';
import { buildTree } from '../../src/fs/tree.js';
import { findDir, parentPath, folderPlaylist, step, shuffledOrder, makeQueue } from '../../src/audio/playlist.js';

const root = buildTree(
  ['A/01.mp3', 'A/02.ogg', 'A/03.mp3', 'A/cover.jpg', 'A/Sub/x.mp3', 'top.mp3'].map((path) => ({ path, file: null })),
);
const isPlayable = (n) => n.name.endsWith('.mp3');

describe('parentPath / findDir', () => {
  it('computes parent folder paths', () => {
    expect(parentPath('A/Sub/x.mp3')).toBe('A/Sub');
    expect(parentPath('top.mp3')).toBe('');
  });
  it('finds directories by path', () => {
    expect(findDir(root, '')).toBe(root);
    expect(findDir(root, 'A/Sub').name).toBe('Sub');
    expect(findDir(root, 'nope')).toBeNull();
  });
});

describe('folderPlaylist', () => {
  it('contains only playable files of the same folder, in order', () => {
    const { tracks, index } = folderPlaylist(root, 'A/03.mp3', isPlayable);
    expect(tracks.map((t) => t.path)).toEqual(['A/01.mp3', 'A/03.mp3']);
    expect(index).toBe(1);
  });
  it('does not descend into subfolders', () => {
    expect(folderPlaylist(root, 'top.mp3', isPlayable).tracks.map((t) => t.path)).toEqual(['top.mp3']);
  });
  it('returns index -1 for an unknown path', () => {
    expect(folderPlaylist(root, 'A/missing.mp3', isPlayable).index).toBe(-1);
  });
});

describe('step', () => {
  it('moves within bounds and stops at the ends', () => {
    expect(step(3, 0, 1)).toBe(1);
    expect(step(3, 2, 1)).toBe(-1);
    expect(step(3, 0, -1)).toBe(-1);
    expect(step(3, -1, 1)).toBe(-1);
  });
});

/** Deterministic stand-in for Math.random (a simple LCG). */
const seeded = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

describe('shuffledOrder', () => {
  it('is a permutation with the given track first', () => {
    for (let seed = 1; seed < 20; seed++) {
      const o = shuffledOrder(8, 5, seeded(seed));
      expect(o[0]).toBe(5);
      expect([...o].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    }
  });
  it('actually shuffles (not always the identity)', () => {
    const orders = new Set(Array.from({ length: 10 }, (_, s) => shuffledOrder(6, -1, seeded(s + 1)).join()));
    expect(orders.size).toBeGreaterThan(1);
  });
  it('handles tiny lists', () => {
    expect(shuffledOrder(0)).toEqual([]);
    expect(shuffledOrder(1, 0)).toEqual([0]);
  });
});

describe('makeQueue', () => {
  it('is display order when not shuffling', () => {
    expect(makeQueue(4, 2, false)).toEqual({ order: [0, 1, 2, 3], pos: 2 });
  });
  it('starts the shuffle at the chosen track', () => {
    const q = makeQueue(5, 3, true, seeded(7));
    expect(q.pos).toBe(0);
    expect(q.order[0]).toBe(3);
  });
  it('has no position without a current track', () => {
    expect(makeQueue(3, -1, false).pos).toBe(-1);
    expect(makeQueue(3, -1, true, seeded(2)).pos).toBe(-1);
  });
});

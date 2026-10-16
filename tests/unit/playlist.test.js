import { describe, it, expect } from 'vitest';
import { buildTree } from '../../src/fs/tree.js';
import { findDir, parentPath, folderPlaylist, step } from '../../src/audio/playlist.js';

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

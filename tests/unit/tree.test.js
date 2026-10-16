import { describe, it, expect } from 'vitest';
import { buildTree, fromFileList, naturalCompare } from '../../src/fs/tree.js';

const f = (path) => ({ name: path.split('/').pop(), webkitRelativePath: path });
const names = (node) => node.children.map((c) => c.name);

describe('naturalCompare', () => {
  it('orders numbers numerically', () => {
    expect(['Track 10', 'Track 2', 'Track 1'].sort(naturalCompare)).toEqual(['Track 1', 'Track 2', 'Track 10']);
  });
  it('is case-insensitive', () => {
    expect(['b', 'A', 'c'].sort(naturalCompare)).toEqual(['A', 'b', 'c']);
  });
});

describe('buildTree', () => {
  it('nests files under directories using their paths', () => {
    const root = buildTree([
      { path: 'Music/Album/01.mp3', file: 'F1' },
      { path: 'Music/Album/02.mp3', file: 'F2' },
      { path: 'Music/loose.wav', file: 'F3' },
    ]);
    expect(root.type).toBe('dir');
    expect(names(root)).toEqual(['Music']);
    const music = root.children[0];
    expect(music.path).toBe('Music');
    expect(names(music)).toEqual(['Album', 'loose.wav']);
    const album = music.children[0];
    expect(album.children.map((c) => [c.name, c.path, c.type, c.file])).toEqual([
      ['01.mp3', 'Music/Album/01.mp3', 'file', 'F1'],
      ['02.mp3', 'Music/Album/02.mp3', 'file', 'F2'],
    ]);
  });

  it('puts directories before files, each in natural order', () => {
    const root = buildTree(['z.mp3', 'b/x.mp3', 'a 10.mp3', 'a 2.mp3', 'A/x.mp3'].map((path) => ({ path, file: null })));
    expect(names(root)).toEqual(['A', 'b', 'a 2.mp3', 'a 10.mp3', 'z.mp3']);
  });

  it('skips hidden files and folders by default', () => {
    const root = buildTree(['.DS_Store', 'Album/._01.mp3', 'Album/01.mp3', '.git/config'].map((path) => ({ path, file: null })));
    expect(names(root)).toEqual(['Album']);
    expect(names(root.children[0])).toEqual(['01.mp3']);
  });

  it('can include hidden entries', () => {
    const root = buildTree([{ path: '.DS_Store', file: null }], { includeHidden: true });
    expect(names(root)).toEqual(['.DS_Store']);
  });

  it('returns an empty root for no input', () => {
    expect(buildTree([])).toEqual({ name: '', path: '', type: 'dir', children: [] });
  });
});

describe('fromFileList', () => {
  it('uses webkitRelativePath, falling back to name', () => {
    const plain = { name: 'solo.mp3', webkitRelativePath: '' };
    const root = fromFileList([f('Mix/a.mp3'), plain]);
    expect(names(root)).toEqual(['Mix', 'solo.mp3']);
    expect(root.children[0].children[0].file.webkitRelativePath).toBe('Mix/a.mp3');
  });
  it('accepts a FileList-like object', () => {
    const list = { length: 1, 0: f('x.mp3'), item(i) { return this[i]; } };
    expect(names(fromFileList(list))).toEqual(['x.mp3']);
  });
});

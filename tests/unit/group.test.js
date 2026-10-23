import { describe, it, expect } from 'vitest';
import { buildTree } from '../../src/fs/tree.js';
import { parseCatalog, applyCatalog, openedFolder } from '../../src/catalog/catalog.js';
import { groupTracks, compareTracks, GROUP_MODES } from '../../src/catalog/group.js';

function setup() {
  const root = buildTree(['M/a.mp3', 'M/b.mp3', 'M/c.mp3', 'M/d.mp3', 'M/cover.jpg'].map((path) => ({ path, file: {} })));
  const { entries } = parseCatalog(
    'path|composer|performer|album|tags\n' +
    'c.mp3|Bach, J. S.|Gould|Goldberg Variations|Piano, variations\n' +
    'a.mp3|bach, j. s.|Leonhardt|WTC|harpsichord, piano\n' +
    'b.mp3||Gould|Goldberg variations|\n',
  );
  applyCatalog(root, openedFolder(root), entries);
  return root;
}
const audio = (n) => n.name.endsWith('.mp3');
const summary = (groups) => groups.map((g) => [g.label, g.tracks.map((t) => t.name)]);

describe('groupTracks', () => {
  it('offers composer, performer and album', () => {
    expect(Object.keys(GROUP_MODES)).toEqual(['composer', 'performer', 'album', 'tag']);
  });
  it('groups by composer case-insensitively, without splitting "Last, First" names; none last', () => {
    expect(summary(groupTracks(setup(), 'composer', audio))).toEqual([
      ['Bach, J. S.', ['c.mp3', 'a.mp3']],
      ['No composer', ['b.mp3', 'd.mp3']],
    ]);
  });
  it('groups by performer, tracks in catalog order', () => {
    expect(summary(groupTracks(setup(), 'performer', audio))).toEqual([
      ['Gould', ['c.mp3', 'b.mp3']],
      ['Leonhardt', ['a.mp3']],
      ['No performer', ['d.mp3']],
    ]);
  });
  it('groups by album, keeping the first spelling in catalog order as the label', () => {
    expect(summary(groupTracks(setup(), 'album', audio))).toEqual([
      ['Goldberg Variations', ['c.mp3', 'b.mp3']],
      ['WTC', ['a.mp3']],
      ['No album', ['d.mp3']],
    ]);
  });
  it('groups by tag: a track appears under each tag; case-insensitive; untagged last', () => {
    expect(summary(groupTracks(setup(), 'tag', audio))).toEqual([
      ['harpsichord', ['a.mp3']],
      ['Piano', ['c.mp3', 'a.mp3']],
      ['variations', ['c.mp3']],
      ['Untagged', ['b.mp3', 'd.mp3']],
    ]);
  });
  it('only includes the files the caller asks for', () => {
    const names = groupTracks(setup(), 'album', audio).flatMap((g) => g.tracks.map((t) => t.name));
    expect(names).not.toContain('cover.jpg');
  });
  it('rejects unknown modes', () => expect(() => groupTracks(setup(), 'year', audio)).toThrow());
});

describe('compareTracks', () => {
  it('puts cataloged tracks (in catalog order) before uncataloged ones (by path)', () => {
    const t = (path, order) => ({ path, meta: order === undefined ? undefined : { order } });
    const sorted = [t('z', undefined), t('b', 1), t('a', undefined), t('c', 0)].sort(compareTracks);
    expect(sorted.map((x) => x.path)).toEqual(['c', 'b', 'a', 'z']);
  });
});

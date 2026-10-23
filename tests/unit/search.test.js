import { describe, it, expect } from 'vitest';
import { buildTree } from '../../src/fs/tree.js';
import { parseCatalog } from '../../src/catalog/catalog.js';
import { normalizeText, searchText, matcher, filterTree, countFiles } from '../../src/catalog/search.js';

/** Catalog metadata for one row, parsed the real way (so `text` holds every cell). */
const meta = (cols) => parseCatalog(`path|${Object.keys(cols).join('|')}\nx|${Object.values(cols).join('|')}`).entries[0];

describe('normalizeText', () => {
  it('lower-cases and strips accents', () => expect(normalizeText('Dvořák Café ÉTUDE')).toBe('dvorak cafe etude'));
});

describe('searchText / matcher', () => {
  const track = {
    path: 'Classical/Bach/wtc-01.mp3', name: 'wtc-01.mp3',
    meta: meta({ title: 'Prelude in C', composer: 'Bach, J. S.', performer: 'Leonhardt', album: 'WTC',
      tags: 'harpsichord, baroque', caption: 'Book 1', credits: 'Rec. 1967', license: 'CC BY-SA',
      year: '1967', venue: 'Doopsgezinde Kerk', notes: 'tuned in meantone' }),
  };
  it('covers the file path and every column of the catalog row, used by the app or not', () => {
    const hay = searchText(track);
    for (const w of ['classical', 'wtc-01', 'prelude', 'bach', 'leonhardt', 'wtc', 'harpsichord', 'book 1', '1967',
      'cc by-sa', 'doopsgezinde', 'meantone']) expect(hay).toContain(w);
  });
  it('is null for a blank query', () => {
    expect(matcher('')).toBeNull();
    expect(matcher('   ')).toBeNull();
  });
  it('requires every word, in any order, case- and accent-insensitively', () => {
    expect(matcher('LEONHARDT prelude')(track)).toBe(true);
    expect(matcher('prelude gould')(track)).toBe(false);
    expect(matcher('dvorak')({ path: 'x.mp3', meta: meta({ composer: 'Dvořák' }) })).toBe(true);
    expect(matcher('dvořák')({ path: 'Dvorak/x.mp3' })).toBe(true);
  });
  it('matches uncataloged files by path', () => {
    expect(matcher('bach')({ path: 'Bach/goldberg.mp3' })).toBe(true);
  });
});

describe('filterTree', () => {
  const root = buildTree(['A/x.mp3', 'A/B/y.mp3', 'C/z.mp3'].map((path) => ({ path, file: null })));
  it('keeps matching files and the folders that contain them, sharing file nodes', () => {
    const out = filterTree(root, (n) => n.name !== 'z.mp3');
    expect(out.children.map((c) => c.name)).toEqual(['A']);
    expect(countFiles(out)).toBe(2);
    expect(out.children[0].children.find((c) => c.name === 'x.mp3')).toBe(root.children[0].children.find((c) => c.name === 'x.mp3'));
    expect(countFiles(root)).toBe(3); // original untouched
  });
  it('can come back empty', () => expect(filterTree(root, () => false).children).toEqual([]));
});

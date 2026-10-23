import { describe, it, expect } from 'vitest';
import { buildTree } from '../../src/fs/tree.js';
import {
  parseCatalog, splitTags, normalizePath, openedFolder, findCatalogs, defaultCatalog, applyCatalog, clearCatalog,
} from '../../src/catalog/catalog.js';

const treeOf = (paths) => buildTree(paths.map((path) => ({ path, file: { name: path.split('/').pop() } })));
const node = (root, path) => {
  const walk = (d) => { for (const c of d.children) { if (c.path === path) return c; if (c.type === 'dir') { const r = walk(c); if (r) return r; } } };
  return walk(root);
};

describe('splitTags / normalizePath', () => {
  it('splits, trims and dedupes tags', () => expect(splitTags(' Bach, organ ,,Bach')).toEqual(['Bach', 'organ']));
  it('normalises paths', () => {
    expect(normalizePath(' ./Disc 1\\01.mp3 ')).toBe('Disc 1/01.mp3');
    expect(normalizePath('/a.mp3')).toBe('a.mp3');
  });
});

describe('parseCatalog', () => {
  it('reads all audio columns, any of which may be missing', () => {
    const { entries, errors } = parseCatalog(
      'path|title|composer|performer|album|tags|credits|license|caption\n' +
      'Disc 1/01.mp3|Prelude|Bach, J. S.|Leonhardt|WTC|baroque,harpsichord|Rec. NS|CC BY|Side A\n' +
      'notes.mp3|Field notes\n',
    );
    expect(errors).toEqual(['line 3: expected 9 fields, found 2']);
    expect(entries[0]).toEqual({
      path: 'Disc 1/01.mp3', title: 'Prelude', composer: 'Bach, J. S.', performer: 'Leonhardt', album: 'WTC',
      tags: ['baroque', 'harpsichord'], credits: 'Rec. NS', license: 'CC BY',
      caption: 'Side A', order: 0,
      text: 'Disc 1/01.mp3 Prelude Bach, J. S. Leonhardt WTC baroque,harpsichord Rec. NS CC BY Side A',
    });
    expect(entries[1]).toMatchObject({ path: 'notes.mp3', title: 'Field notes', composer: '', performer: '', tags: [], order: 1 });
  });
  it('ignores other columns, such as imageviewer\'s year and place', () => {
    const e = parseCatalog('path|year|place|title\na.mp3|1967|Rome|X').entries[0];
    expect(e).not.toHaveProperty('year');
    expect(e).not.toHaveProperty('place');
    expect(e.title).toBe('X');
    expect(e.text).toBe('a.mp3 1967 Rome X'); // ...but they're still searchable
  });
  it('reads an artist column as the performer', () => {
    expect(parseCatalog('path|artist\na.mp3|Gould').entries[0].performer).toBe('Gould');
    expect(parseCatalog('path|artist|performer\na.mp3|X|Gould').entries[0].performer).toBe('Gould');
  });
  it('accepts an imageviewer-style catalog', () => {
    const { entries } = parseCatalog('path|caption|credits|license|tags\na.mp3|Talk|NS|CC0|Pliny, Leiden');
    expect(entries[0]).toMatchObject({ caption: 'Talk', title: '', tags: ['Pliny', 'Leiden'] });
  });
  it('requires a path column', () => {
    expect(parseCatalog('title\nx')).toEqual({ entries: [], errors: ['catalog has no "path" column'] });
  });
  it('skips rows with an empty path', () => {
    const r = parseCatalog('path|title\n|orphan\na.mp3|ok');
    expect(r.entries.map((e) => [e.path, e.order])).toEqual([['a.mp3', 0]]);
    expect(r.errors).toEqual(['catalog row with empty path skipped']);
  });
});

describe('finding catalogs', () => {
  it('uses the single top-level folder (folder picker / one dropped folder)', () => {
    const root = treeOf(['Music/b.cex', 'Music/catalog.cex', 'Music/Sub/deep.cex', 'Music/a.mp3']);
    const { folder, catalogs } = findCatalogs(root);
    expect(folder.path).toBe('Music');
    expect(catalogs.map((c) => c.name)).toEqual(['b.cex', 'catalog.cex']);
    expect(defaultCatalog(catalogs)).toBe('catalog.cex');
  });
  it('uses the root for loose dropped files', () => {
    const root = treeOf(['x.cex', 'a.mp3']);
    expect(openedFolder(root)).toBe(root);
    expect(findCatalogs(root).catalogs.map((c) => c.name)).toEqual(['x.cex']);
  });
  it('has no default without a catalog.cex', () => {
    expect(defaultCatalog(findCatalogs(treeOf(['M/other.cex'])).catalogs)).toBe('');
    expect(defaultCatalog(findCatalogs(treeOf(['M/CATALOG.CEX'])).catalogs)).toBe('CATALOG.CEX');
  });
});

describe('applyCatalog', () => {
  const root = treeOf(['Music/Disc 1/01.mp3', 'Music/Disc 1/02.mp3', 'Music/Live.MP3']);
  const folder = openedFolder(root);

  it('attaches metadata by path relative to the catalog folder and reports missing files', () => {
    const { entries } = parseCatalog('path|title\nDisc 1/01.mp3|One\ngone.mp3|Gone\nlive.mp3|Live!');
    const r = applyCatalog(root, folder, entries);
    expect(r).toEqual({ matched: 2, missing: ['gone.mp3'] });
    expect(node(root, 'Music/Disc 1/01.mp3').meta.title).toBe('One');
    expect(node(root, 'Music/Live.MP3').meta.title).toBe('Live!'); // case-insensitive fallback
    expect(node(root, 'Music/Disc 1/02.mp3').meta).toBeUndefined();
  });

  it('lets later duplicate rows win but keeps the first position', () => {
    const { entries } = parseCatalog('path|title|album\nDisc 1/02.mp3|A|X\nDisc 1/01.mp3|B|\nDisc 1/02.mp3|C|');
    applyCatalog(root, folder, entries);
    expect(node(root, 'Music/Disc 1/02.mp3').meta).toMatchObject({ title: 'C', album: '', order: 0 });
    expect(node(root, 'Music/Disc 1/02.mp3').meta.text).toBe('Disc 1/02.mp3 A X Disc 1/02.mp3 C');
  });

  it('replaces a previous catalog, and clearCatalog removes it', () => {
    applyCatalog(root, folder, parseCatalog('path|title\nLive.MP3|X').entries);
    expect(node(root, 'Music/Disc 1/01.mp3').meta).toBeUndefined();
    clearCatalog(root);
    expect(node(root, 'Music/Live.MP3').meta).toBeUndefined();
  });
});

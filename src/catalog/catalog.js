import { parseDelimited } from './cex.js';
import { naturalCompare } from '../fs/tree.js';

/**
 * Audio catalogs: `|`-delimited CEX-style files (like imageviewer's) describing tracks.
 * Required column: `path`, relative to the catalog's folder. Optional columns:
 * title, composer, performer (or `artist`, read as performer), album,
 * tags (comma-separated), credits, license, caption. Other columns aren't used for
 * display, but every cell of a row (known column or not) is kept in `text` for search.
 *
 * @typedef {{
 *   path: string, title: string, composer: string, performer: string, album: string,
 *   tags: string[], credits: string, license: string, caption: string,
 *   text: string,   // all of the row's non-empty cells, for free-text search
 *   order: number,  // 0-based position of the path's first row
 * }} TrackMeta
 */

export const isCatalogName = (name) => /\.cex$/i.test(name);
export const DEFAULT_CATALOG = 'catalog.cex';

/** Comma-separated tags → unique, trimmed, non-empty. */
export function splitTags(s) {
  const seen = new Set();
  for (const t of s.split(',')) {
    const tag = t.trim();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/** "./a\\b.mp3" → "a/b.mp3". */
export function normalizePath(p) {
  return p.trim().replace(/\\/g, '/').replace(/^\.?\/+/, '');
}

/** @returns {{ entries: TrackMeta[], errors: string[] }} */
export function parseCatalog(text) {
  const table = parseDelimited(text);
  const errors = [...table.errors];
  if (table.headers.length && !table.headers.includes('path')) {
    errors.push('catalog has no "path" column');
    return { entries: [], errors };
  }
  const entries = [];
  table.rows.forEach((r) => {
    const path = normalizePath(r.path ?? '');
    if (!path) {
      errors.push('catalog row with empty path skipped');
      return;
    }
    entries.push({
      path,
      title: r.title ?? '',
      composer: r.composer ?? '',
      performer: r.performer || r.artist || '',
      album: r.album ?? '',
      tags: splitTags(r.tags ?? ''),
      credits: r.credits ?? '',
      license: r.license ?? '',
      caption: r.caption ?? '',
      text: Object.values(r).filter(Boolean).join(' '),
      order: entries.length,
    });
  });
  return { entries, errors };
}

/**
 * The folder the person opened. The folder picker, and dropping one folder, give a
 * root with that folder as its only child; dropping loose files gives a root with files.
 */
export function openedFolder(root) {
  const [only] = root.children;
  return root.children.length === 1 && only.type === 'dir' ? only : root;
}

/** Catalog files at the top of the opened folder, in name order. */
export function findCatalogs(root) {
  const folder = openedFolder(root);
  const catalogs = folder.children
    .filter((c) => c.type === 'file' && isCatalogName(c.name))
    .sort((a, b) => naturalCompare(a.name, b.name));
  return { folder, catalogs };
}

/** "catalog.cex" if present (any case), else "" (no catalog). */
export function defaultCatalog(catalogs) {
  return catalogs.find((c) => c.name.toLowerCase() === DEFAULT_CATALOG)?.name ?? '';
}

function* files(dir) {
  for (const c of dir.children) {
    if (c.type === 'dir') yield* files(c);
    else yield c;
  }
}

/** Remove catalog metadata from every file node. */
export function clearCatalog(root) {
  for (const f of files(root)) delete f.meta;
}

/**
 * Attach catalog entries to file nodes as `node.meta` (clearing any previous catalog).
 * Paths are relative to `folder`. An exact match wins; otherwise a case-insensitive
 * one (catalogs typed by hand on macOS often differ in case). If a path is listed
 * twice, later rows' values win but the first row's position is kept, and both
 * rows' text stays searchable.
 *
 * @returns {{ matched: number, missing: string[] }} missing = catalog paths with no file
 */
export function applyCatalog(root, folder, entries) {
  clearCatalog(root);
  const prefix = folder.path ? `${folder.path}/` : '';
  const exact = new Map();
  const loose = new Map();
  for (const f of files(folder)) {
    const rel = f.path.slice(prefix.length);
    exact.set(rel, f);
    if (!loose.has(rel.toLowerCase())) loose.set(rel.toLowerCase(), f);
  }
  const missing = [];
  const matchedNodes = new Set();
  for (const e of entries) {
    const node = exact.get(e.path) ?? loose.get(e.path.toLowerCase());
    if (!node) {
      missing.push(e.path);
      continue;
    }
    node.meta = node.meta
      ? { ...node.meta, ...e, order: node.meta.order, text: `${node.meta.text} ${e.text}` }
      : { ...e };
    matchedNodes.add(node);
  }
  return { matched: matchedNodes.size, missing };
}

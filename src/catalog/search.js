/**
 * Free-text search over tracks: the file path (file and folder names) plus
 * everything in the track's catalog row — every column, including ones the app
 * doesn't otherwise use.
 * Case- and accent-insensitive ("dvorak" finds "Dvořák"); every word must match.
 */

/** Lower-case and strip accents/diacritics. */
export function normalizeText(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Everything a track can be found by, normalised. */
export function searchText(node) {
  return normalizeText([node.path, node.meta?.text].filter(Boolean).join(' '));
}

/**
 * @param {string} query
 * @returns {((node) => boolean) | null}  null for a blank query (no filtering)
 */
export function matcher(query) {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return null;
  const cache = new WeakMap();
  return (node) => {
    let hay = cache.get(node);
    if (hay === undefined) cache.set(node, (hay = searchText(node)));
    return terms.every((t) => hay.includes(t));
  };
}

/**
 * Copy of the tree keeping only files that pass `keep` and folders that still
 * contain something. File nodes are shared with the original (not copied).
 * @returns {import('../fs/tree.js').DirNode}
 */
export function filterTree(dir, keep) {
  const children = [];
  for (const c of dir.children) {
    if (c.type === 'file') {
      if (keep(c)) children.push(c);
    } else {
      const sub = filterTree(c, keep);
      if (sub.children.length) children.push(sub);
    }
  }
  return { ...dir, children };
}

/** Number of files in a tree. */
export function countFiles(dir) {
  let n = 0;
  for (const c of dir.children) n += c.type === 'file' ? 1 : countFiles(c);
  return n;
}

import { naturalCompare } from '../fs/tree.js';

/**
 * Group-by modes built from catalog columns. `values` returns a list: composer,
 * performer and album are single-valued; a track appears under each of its tags.
 * Matching is case-insensitive (the label is the first spelling in catalog order);
 * tracks without a value go in a final "No …" group.
 */
const single = (field) => (m) => (m?.[field] ? [m[field]] : []);
export const GROUP_MODES = Object.freeze({
  composer: { label: 'Composer', none: 'No composer', values: single('composer') },
  performer: { label: 'Performer', none: 'No performer', values: single('performer') },
  album: { label: 'Album', none: 'No album', values: single('album') },
  tag: { label: 'Tag', none: 'Untagged', values: (m) => m?.tags ?? [] },
});

const NONE = '￿';

/** Cataloged tracks in catalog order, then uncataloged ones by path. */
export function compareTracks(a, b) {
  const ao = a.meta?.order;
  const bo = b.meta?.order;
  if (ao !== undefined && bo !== undefined) return ao - bo;
  if (ao !== undefined) return -1;
  if (bo !== undefined) return 1;
  return naturalCompare(a.path, b.path);
}

function* files(dir) {
  for (const c of dir.children) {
    if (c.type === 'dir') yield* files(c);
    else yield c;
  }
}

/**
 * @param {import('../fs/tree.js').DirNode} root
 * @param {keyof typeof GROUP_MODES} mode
 * @param {(node) => boolean} include  which files take part (e.g. audio only)
 * @returns {{ key: string, label: string, tracks: any[] }[]}
 */
export function groupTracks(root, mode, include) {
  const spec = GROUP_MODES[mode];
  if (!spec) throw new Error(`unknown group mode: ${mode}`);
  const groups = new Map();
  const add = (key, label, node) => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, label, tracks: [] }));
    if (!g.tracks.includes(node)) g.tracks.push(node);
  };
  // Visit in catalog order so each label is the catalog's first spelling of it.
  for (const f of [...files(root)].filter(include).sort(compareTracks)) {
    const vals = spec.values(f.meta).map((v) => v.trim()).filter(Boolean);
    if (vals.length) for (const v of vals) add(v.toLowerCase(), v, f);
    else add(NONE, spec.none, f);
  }
  const list = [...groups.values()];
  list.forEach((g) => g.tracks.sort(compareTracks));
  list.sort((a, b) => (a.key === NONE ? 1 : b.key === NONE ? -1 : naturalCompare(a.key, b.key)));
  return list;
}

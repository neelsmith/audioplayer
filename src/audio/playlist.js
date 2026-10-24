/**
 * Playlist helpers: "the current folder" is the folder containing the
 * selected track; its playable files, in display order, form the playlist.
 * Pure functions over the tree from fs/tree.js.
 */

/** Directory node at `dirPath` ("" = root), or null. */
export function findDir(root, dirPath) {
  if (!dirPath) return root;
  let dir = root;
  let path = '';
  for (const part of dirPath.split('/')) {
    path = path ? `${path}/${part}` : part;
    dir = dir.children.find((c) => c.type === 'dir' && c.path === path);
    if (!dir) return null;
  }
  return dir;
}

/** Parent folder path of a file path ("Album/01.mp3" → "Album", "x.mp3" → ""). */
export const parentPath = (path) => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/**
 * @param {import('../fs/tree.js').DirNode} root
 * @param {string} path  path of the selected file
 * @param {(node: import('../fs/tree.js').FileNode) => boolean} isPlayable
 * @returns {{ tracks: import('../fs/tree.js').FileNode[], index: number }}
 *   index is -1 if the selected file isn't in the playlist
 */
export function folderPlaylist(root, path, isPlayable) {
  const dir = findDir(root, parentPath(path));
  const tracks = dir ? dir.children.filter((c) => c.type === 'file' && isPlayable(c)) : [];
  return { tracks, index: tracks.findIndex((t) => t.path === path) };
}

/**
 * Like folderPlaylist, but the selected file's folder *and everything below it*:
 * playable files in display order (each folder's subfolders, then its own files).
 * @returns {{ tracks: import('../fs/tree.js').FileNode[], index: number }}
 */
export function branchPlaylist(root, path, isPlayable) {
  const dir = findDir(root, parentPath(path));
  const tracks = dir ? dirTracks(dir, isPlayable) : [];
  return { tracks, index: tracks.findIndex((t) => t.path === path) };
}

/**
 * Every playable file in a folder and its subfolders, in display order (each
 * folder's subfolders first, then its own files) — even if the folder itself has none.
 */
export function dirTracks(dir, isPlayable) {
  const tracks = [];
  const walk = (d) => {
    for (const c of d.children) {
      if (c.type === 'dir') walk(c);
      else if (isPlayable(c)) tracks.push(c);
    }
  };
  walk(dir);
  return tracks;
}

/** Index after moving `delta` from `index`, or -1 if that runs off either end (no wrap-around). */
export function step(length, index, delta) {
  const next = index + delta;
  return index >= 0 && next >= 0 && next < length ? next : -1;
}

/**
 * Random permutation of 0..length-1 (Fisher–Yates), with `first` moved to the
 * front when it's a valid index (so the current track stays current).
 * @param {() => number} [random]  returns [0, 1); injectable for tests
 */
export function shuffledOrder(length, first = -1, random = Math.random) {
  const rest = [];
  for (let i = 0; i < length; i++) if (i !== first) rest.push(i);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first >= 0 && first < length ? [first, ...rest] : rest;
}

/**
 * Play order over `length` tracks, positioned at track `index` (-1 = none):
 * in order, or shuffled with that track first.
 * @returns {{ order: number[], pos: number }}  the current track is order[pos]
 */
export function makeQueue(length, index, shuffle, random = Math.random) {
  const order = shuffle ? shuffledOrder(length, index, random) : Array.from({ length }, (_, i) => i);
  return { order, pos: index >= 0 ? order.indexOf(index) : -1 };
}

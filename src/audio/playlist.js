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

/** Index after moving `delta` from `index`, or -1 if that runs off either end (no wrap-around). */
export function step(length, index, delta) {
  const next = index + delta;
  return index >= 0 && next >= 0 && next < length ? next : -1;
}

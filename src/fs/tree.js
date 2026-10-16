/**
 * Build an in-memory folder tree from a flat list of files.
 * Pure: no DOM or browser APIs.
 *
 * @typedef {{ name: string, path: string, type: 'file', file: any }} FileNode
 * @typedef {{ name: string, path: string, type: 'dir', children: TreeNode[] }} DirNode
 * @typedef {FileNode | DirNode} TreeNode
 */

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Natural, case-insensitive comparison ("Track 2" < "Track 10"). */
export function naturalCompare(a, b) {
  return collator.compare(a, b);
}

/** Directories first, then natural order by name. */
function compareNodes(a, b) {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
  return naturalCompare(a.name, b.name);
}

function sortRecursive(dir) {
  dir.children.sort(compareNodes);
  for (const child of dir.children) if (child.type === 'dir') sortRecursive(child);
}

/**
 * @param {Iterable<{ path: string, file: any }>} entries  "/"-separated relative paths
 * @param {{ includeHidden?: boolean }} [options]  hidden = any path segment starting with "."
 * @returns {DirNode} unnamed root directory
 */
export function buildTree(entries, { includeHidden = false } = {}) {
  /** @type {DirNode} */
  const root = { name: '', path: '', type: 'dir', children: [] };
  /** path → DirNode, so lookups stay O(1) for large folders */
  const dirs = new Map([['', root]]);

  for (const { path, file } of entries) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    if (!includeHidden && parts.some((p) => p.startsWith('.'))) continue;

    let parent = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join('/');
      let dir = dirs.get(dirPath);
      if (!dir) {
        dir = { name: parts[i], path: dirPath, type: 'dir', children: [] };
        dirs.set(dirPath, dir);
        parent.children.push(dir);
      }
      parent = dir;
    }
    const name = parts[parts.length - 1];
    parent.children.push({ name, path: parts.join('/'), type: 'file', file });
  }

  sortRecursive(root);
  return root;
}

/**
 * Tree from the FileList of an <input type="file" webkitdirectory> (or any
 * array of File-like objects). Uses webkitRelativePath when present.
 * @param {ArrayLike<{ name: string, webkitRelativePath?: string }>} files
 * @param {{ includeHidden?: boolean }} [options]
 */
export function fromFileList(files, options) {
  const entries = Array.from(files, (file) => ({ path: file.webkitRelativePath || file.name, file }));
  return buildTree(entries, options);
}

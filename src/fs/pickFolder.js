/**
 * Collect files from a drag-and-drop of folders and/or files.
 * Uses the non-standard but universally supported (Chrome, Firefox, Safari)
 * `DataTransferItem.webkitGetAsEntry()` API.
 *
 * Returns `{ path, file }` pairs ready for `buildTree`.
 */

/** Promise wrapper for FileSystemFileEntry.file(). */
function entryFile(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** Read *all* children of a directory entry: readEntries() returns batches (≈100 in Chrome) until empty. */
async function readAllEntries(dirEntry) {
  const reader = dirEntry.createReader();
  const all = [];
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

/** Strip the leading "/" that fullPath carries. */
const relPath = (entry) => (entry.fullPath || entry.name).replace(/^\/+/, '');

/**
 * Recursively walk entries, appending `{ path, file }` to `out`.
 * Unreadable entries are skipped and counted in `errors`.
 */
async function walk(entry, out, errors) {
  try {
    if (entry.isFile) {
      out.push({ path: relPath(entry), file: await entryFile(entry) });
    } else if (entry.isDirectory) {
      for (const child of await readAllEntries(entry)) await walk(child, out, errors);
    }
  } catch {
    errors.count++;
  }
}

/**
 * @param {DataTransfer} dataTransfer
 * @returns {Promise<{ entries: { path: string, file: File }[], errors: number }>}
 */
export async function collectDropped(dataTransfer) {
  // Grab every entry synchronously: DataTransfer items are cleared after the event handler yields.
  const roots = [];
  const looseFiles = [];
  for (const item of Array.from(dataTransfer.items || [])) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) roots.push(entry);
    else {
      const file = item.getAsFile();
      if (file) looseFiles.push(file);
    }
  }
  const entries = looseFiles.map((file) => ({ path: file.name, file }));
  const errors = { count: 0 };
  for (const entry of roots) await walk(entry, entries, errors);
  return { entries, errors: errors.count };
}

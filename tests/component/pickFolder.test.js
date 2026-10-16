import { describe, it, expect } from 'vitest';
import { collectDropped } from '../../src/fs/pickFolder.js';

/** Fake FileSystemEntry tree. `batch` controls how many children readEntries returns per call. */
function fileEntry(fullPath, { fail = false } = {}) {
  return {
    isFile: true, isDirectory: false, fullPath, name: fullPath.split('/').pop(),
    file: (ok, err) => (fail ? err(new Error('nope')) : ok({ name: fullPath.split('/').pop(), path: fullPath })),
  };
}
function dirEntry(fullPath, children, batch = 2) {
  return {
    isFile: false, isDirectory: true, fullPath, name: fullPath.split('/').pop(),
    createReader() {
      let i = 0;
      return { readEntries: (ok) => { const out = children.slice(i, i + batch); i += batch; ok(out); } };
    },
  };
}
const dt = (...entries) => ({ items: entries.map((e) => ({ kind: 'file', webkitGetAsEntry: () => e })) });

describe('collectDropped', () => {
  it('walks nested folders across multiple readEntries batches', async () => {
    const root = dirEntry('/Music', [
      fileEntry('/Music/a.mp3'), fileEntry('/Music/b.mp3'), fileEntry('/Music/c.mp3'),
      dirEntry('/Music/Sub', [fileEntry('/Music/Sub/d.mp3')]),
    ]);
    const { entries, errors } = await collectDropped(dt(root));
    expect(errors).toBe(0);
    expect(entries.map((e) => e.path).sort()).toEqual(['Music/Sub/d.mp3', 'Music/a.mp3', 'Music/b.mp3', 'Music/c.mp3']);
    expect(entries[0].file.name).toBeDefined();
  });

  it('accepts loose dropped files', async () => {
    const { entries } = await collectDropped(dt(fileEntry('/solo.mp3')));
    expect(entries.map((e) => e.path)).toEqual(['solo.mp3']);
  });

  it('skips unreadable files and counts them', async () => {
    const root = dirEntry('/M', [fileEntry('/M/ok.mp3'), fileEntry('/M/bad.mp3', { fail: true })]);
    const { entries, errors } = await collectDropped(dt(root));
    expect(entries.map((e) => e.path)).toEqual(['M/ok.mp3']);
    expect(errors).toBe(1);
  });

  it('falls back to getAsFile when entries are unavailable', async () => {
    const file = { name: 'x.mp3' };
    const { entries } = await collectDropped({ items: [{ kind: 'file', getAsFile: () => file }, { kind: 'string' }] });
    expect(entries).toEqual([{ path: 'x.mp3', file }]);
  });
});

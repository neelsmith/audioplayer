import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getByLabelText, queryByLabelText } from '@testing-library/dom';
import { initApp } from '../../src/ui/app.js';
import { fakeClassify, fakeFile, mountAppMarkup, makePlayer } from '../helpers.js';

/** Play a whole folder (or group) from its row — in order, or shuffled — even if it has no files of its own. */

const zero = () => 0;
let app, player, audio;
const footer = () => document.getElementById('player');
const tree = () => document.getElementById('tree');
const current = () => footer().querySelector('.title').title;
const finish = () => { audio.loadMeta(5); audio.end(); };
const playAllBtn = (name) => tree().querySelector(`button.play-all[data-name="${name}"]`);

/** Collect file names until playback stops. */
function playedUntilStop() {
  const seen = [current()];
  for (let i = 0; i < 20 && !getByLabelText(footer(), 'Next track').disabled; i++) { finish(); seen.push(current()); }
  return seen;
}

async function setup({ catalog } = {}) {
  mountAppMarkup();
  document.body.insertAdjacentHTML('beforeend', '<footer id="player"></footer>');
  ({ player, audio } = await makePlayer());
  app = initApp(document, { classify: fakeClassify, player, random: zero });
  const files = ['Lib/bach/wtc/prelude.mp3', 'Lib/bach/wtc/fugue.mp3', 'Lib/bach/inventions/inv1.mp3',
    'Lib/bach/inventions/inv2.ogg', 'Lib/bach/notes.txt', 'Lib/mozart/k331.mp3', 'Lib/empty/readme.txt']
    .map((p) => fakeFile(p));
  if (catalog) files.push(fakeFile('Lib/catalog.cex', '', catalog));
  const input = document.getElementById('folder-input');
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}
afterEach(() => app.destroy());

describe('play-all buttons on folders', () => {
  beforeEach(() => setup());

  it('appear on folders with playable audio anywhere below, labelled with the count', () => {
    expect(playAllBtn('bach').getAttribute('aria-label')).toBe('Play all 3 tracks in bach'); // inv2.ogg unsupported
    expect(playAllBtn('wtc').getAttribute('aria-label')).toBe('Play all 2 tracks in wtc');
    expect(playAllBtn('Lib').getAttribute('aria-label')).toBe('Play all 4 tracks in Lib');
    expect(playAllBtn('empty')).toBeNull();
  });

  it('with shuffle off, play a folder with no files of its own through its subfolders in display order', () => {
    playAllBtn('bach').click();
    expect(audio.paused).toBe(false);
    expect(playedUntilStop()).toEqual(['inv1.mp3', 'fugue.mp3', 'prelude.mp3']);
    finish();
    expect(audio.paused).toBe(true);
  });

  it('reveal and highlight the track that starts', () => {
    playAllBtn('bach').click();
    const li = tree().querySelector('li.file[data-path="Lib/bach/inventions/inv1.mp3"]');
    expect(li.querySelector('[aria-current]')).not.toBeNull();
    expect(li.closest('details').open).toBe(true);
  });

  it('with shuffle on, play every track below once in random order', () => {
    app.setShuffle(true);
    expect(playAllBtn('bach').getAttribute('aria-label')).toBe('Shuffle all 3 tracks in bach');
    playAllBtn('bach').click();
    const seen = playedUntilStop();
    expect([...seen].sort()).toEqual(['fugue.mp3', 'inv1.mp3', 'prelude.mp3']);
    expect(seen).not.toContain('k331.mp3');
  });

  it('toggling shuffle mid-way keeps the whole folder (doesn\'t narrow to one subfolder)', () => {
    playAllBtn('bach').click(); // inv1 (inventions/)
    getByLabelText(footer(), 'Shuffle').click();
    const seen = playedUntilStop();
    expect([...seen].sort()).toEqual(['fugue.mp3', 'inv1.mp3', 'prelude.mp3']);
  });

  it('relabel when shuffle is toggled from the keyboard', () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }));
    expect(playAllBtn('wtc').getAttribute('aria-label')).toBe('Shuffle all 2 tracks in wtc');
  });

  it('respect the search', () => {
    const search = document.getElementById('search');
    search.value = 'prelude';
    search.dispatchEvent(new Event('input'));
    expect(playAllBtn('bach').getAttribute('aria-label')).toBe('Play all 1 track in bach');
    expect(playAllBtn('mozart')).toBeNull();
    playAllBtn('bach').click();
    expect(playedUntilStop()).toEqual(['prelude.mp3']);
  });
});

describe('play-all buttons on groups', () => {
  it('play a whole group', async () => {
    await setup({ catalog: 'path|composer\nbach/wtc/fugue.mp3|Bach\nbach/inventions/inv1.mp3|Bach\nmozart/k331.mp3|Mozart' });
    const sel = document.getElementById('group-select');
    sel.value = 'composer';
    sel.dispatchEvent(new Event('change'));
    expect(playAllBtn('Bach').getAttribute('aria-label')).toBe('Play all 2 tracks in Bach');
    playAllBtn('Bach').click();
    expect(playedUntilStop()).toEqual(['fugue.mp3', 'inv1.mp3']); // catalog order
    expect(queryByLabelText(tree(), /in No composer/)).not.toBeNull(); // prelude.mp3 is uncataloged
  });
});

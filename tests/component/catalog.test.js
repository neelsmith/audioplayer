import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getByText, getByLabelText } from '@testing-library/dom';
import { initApp } from '../../src/ui/app.js';
import { fakeClassify, fakeFile, mountAppMarkup, makePlayer } from '../helpers.js';

/** Critical flow: a folder with catalog.cex → titles shown → group by tag → play within a group. */

const CATALOG = [
  'path|title|composer|performer|album|tags|caption',
  'Disc 1/01.mp3|Prelude|Bach|Leonhardt|WTC|harpsichord, baroque|Side A',
  'Disc 1/02.mp3|Fugue|Bach|Leonhardt|WTC|baroque|',
  'talk.mp3|Lecture||NS|||',
  'missing.mp3|Gone||||',
].join('\n');

let app, player, audio;
const status = () => document.getElementById('status').textContent;
const tree = () => document.getElementById('tree');
const catSel = () => document.getElementById('catalog-select');
const groupSel = () => document.getElementById('group-select');
const choose = (sel, value) => { sel.value = value; sel.dispatchEvent(new Event('change')); };

async function open(files) {
  const input = document.getElementById('folder-input');
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
  await new Promise((r) => setTimeout(r, 0)); // let catalog.cex be read
  await new Promise((r) => setTimeout(r, 0));
  document.querySelectorAll('#tree details').forEach((d) => (d.open = true));
}

const library = (catalogText = CATALOG) => [
  fakeFile('Music/Disc 1/01.mp3'), fakeFile('Music/Disc 1/02.mp3'), fakeFile('Music/talk.mp3'),
  fakeFile('Music/untagged.mp3'), fakeFile('Music/cover.jpg', 'image/jpeg'),
  fakeFile('Music/catalog.cex', '', catalogText), fakeFile('Music/other.cex', '', 'path|title\ntalk.mp3|Other title'),
];

beforeEach(async () => {
  mountAppMarkup();
  document.body.insertAdjacentHTML('beforeend', '<footer id="player"></footer>');
  ({ player, audio } = await makePlayer());
  app = initApp(document, { classify: fakeClassify, player });
});
afterEach(() => app.destroy());

describe('catalog discovery', () => {
  it('offers the folder\'s .cex files and picks catalog.cex by default', async () => {
    await open(library());
    expect(document.getElementById('catalog-bar').hidden).toBe(false);
    expect([...catSel().options].map((o) => o.textContent)).toEqual(['No catalog', 'catalog.cex', 'other.cex']);
    expect(catSel().value).toBe('catalog.cex');
    expect(status()).toContain('3 in catalog.cex');
  });

  it('hides the bar when there is no catalog', async () => {
    await open([fakeFile('Music/a.mp3')]);
    expect(document.getElementById('catalog-bar').hidden).toBe(true);
  });

  it('starts with no catalog when the folder has no catalog.cex', async () => {
    await open([fakeFile('Music/a.mp3'), fakeFile('Music/notes.cex', '', 'path|title\na.mp3|A')]);
    expect(catSel().value).toBe('');
    expect(getByText(tree(), 'a.mp3')).toBeTruthy();
    expect(groupSel().disabled).toBe(true);
  });
});

describe('catalog metadata', () => {
  it('shows catalog titles in the list, with file name and caption as the tooltip', async () => {
    await open(library());
    const btn = getByText(tree(), 'Prelude');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.title).toBe('Music/Disc 1/01.mp3\nSide A');
    expect(getByText(tree(), 'untagged.mp3')).toBeTruthy(); // uncataloged keeps its file name
  });

  it('shows title and composer · performer — album in the player bar and window title', async () => {
    await open(library());
    getByText(tree(), 'Prelude').click();
    const footer = document.getElementById('player');
    expect(footer.querySelector('.title').textContent).toBe('Prelude');
    expect(footer.querySelector('.folder').textContent).toBe('Bach · Leonhardt — WTC');
    expect(document.title).toBe('▶ Prelude — Audio Player');
  });

  it('switching catalogs updates labels, including the playing track', async () => {
    await open(library());
    getByText(tree(), 'Lecture').click();
    choose(catSel(), 'other.cex');
    await new Promise((r) => setTimeout(r, 0));
    expect(getByText(tree(), 'Other title')).toBeTruthy();
    expect(getByText(tree(), '01.mp3')).toBeTruthy(); // not in other.cex
    expect(document.querySelector('#player .title').textContent).toBe('Other title');
    choose(catSel(), '');
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('#player .title').textContent).toBe('talk');
    expect(audio.paused).toBe(false); // switching never interrupts playback
  });

  it('lists parse problems and missing files as warnings', async () => {
    await open(library());
    const warn = document.getElementById('warnings');
    expect(warn.hidden).toBe(false);
    expect(warn.querySelector('summary').textContent).toBe('2 catalog warnings');
    const items = [...warn.querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toContain('catalog.cex: line 5: expected 7 fields, found 6');
    expect(items).toContain('catalog.cex: 1 listed file not found: missing.mp3');
  });

  it('reports an unreadable catalog without breaking the folder view', async () => {
    const files = library();
    files[5] = fakeFile('Music/catalog.cex'); // text() rejects
    await open(files);
    expect(document.querySelector('#warnings li').textContent).toBe('catalog.cex: could not be read: unreadable');
    expect(getByText(tree(), '01.mp3')).toBeTruthy();
  });
});

describe('grouping', () => {
  const groupLabels = () => [...tree().querySelectorAll('li.group > details > summary')].map((s) => s.firstChild.textContent);

  it('groups audio by composer, performer or album, with "no value" groups last', async () => {
    await open(library());
    expect(groupSel().disabled).toBe(false);
    expect([...groupSel().options].map((o) => o.textContent)).toEqual(['Folder', 'Composer', 'Performer', 'Album', 'Tag']);
    choose(groupSel(), 'composer');
    expect(groupLabels()).toEqual(['Bach', 'No composer']);
    expect(tree().textContent).not.toContain('cover.jpg');
    choose(groupSel(), 'performer');
    expect(groupLabels()).toEqual(['Leonhardt', 'NS', 'No performer']);
    choose(groupSel(), 'album');
    expect(groupLabels()).toEqual(['WTC', 'No album']);
    choose(groupSel(), 'tag');
    expect(groupLabels()).toEqual(['baroque', 'harpsichord', 'Untagged']);
    choose(groupSel(), 'folder');
    expect(tree().querySelector('summary').textContent).toBe('Music');
  });

  it('plays within the group the track was picked from', async () => {
    await open(library());
    choose(groupSel(), 'album');
    const bach = tree().querySelector('li.group[data-group="wtc"]');
    bach.querySelector('details').open = true;
    getByText(bach, 'Prelude').click();
    expect(getByLabelText(document.getElementById('player'), 'Next track').disabled).toBe(false);
    audio.loadMeta(10);
    audio.end();
    expect(document.querySelector('#player .title').textContent).toBe('Fugue');
    expect(bach.querySelector('[aria-current]').textContent).toBe('Fugue');
    audio.end(); // last track of the group: stops
    expect(audio.paused).toBe(true);
  });

  it('keeps the playing track highlighted when the grouping changes', async () => {
    await open(library());
    getByText(tree(), 'Fugue').click();
    choose(groupSel(), 'performer');
    const leon = tree().querySelector('li.group[data-group="leonhardt"]');
    expect(leon.querySelector('details').open).toBe(true); // opened to reveal it
    expect(leon.querySelector('[aria-current]').textContent).toBe('Fugue');
    expect(tree().querySelectorAll('[aria-current]')).toHaveLength(1);
  });

  it('turning the catalog off returns to the folder view', async () => {
    await open(library());
    choose(groupSel(), 'album');
    choose(catSel(), '');
    await new Promise((r) => setTimeout(r, 0));
    expect(groupSel().value).toBe('folder');
    expect(groupSel().disabled).toBe(true);
    expect(tree().querySelector('li.group')).toBeNull();
  });

  it('opening another folder resets catalog and grouping', async () => {
    await open(library());
    choose(groupSel(), 'composer');
    await open([fakeFile('Other/x.mp3')]);
    expect(groupSel().value).toBe('folder');
    expect(document.getElementById('catalog-bar').hidden).toBe(true);
    expect(document.getElementById('warnings').hidden).toBe(true);
  });
});

describe('search', () => {
  const search = () => document.getElementById('search');
  const type = (text) => { search().value = text; search().dispatchEvent(new Event('input')); };
  const tracks = () => [...tree().querySelectorAll('button.track')].map((b) => b.textContent);

  it('is available once a folder is open, even without a catalog', async () => {
    expect(document.getElementById('toolbar').hidden).toBe(true);
    await open([fakeFile('Music/Bach/goldberg.mp3'), fakeFile('Music/Mozart/k331.mp3')]);
    expect(document.getElementById('toolbar').hidden).toBe(false);
    type('bach');
    expect(tracks()).toEqual(['goldberg.mp3']);
    expect(tree().querySelector('li.dir[data-path="Music/Bach"] details').open).toBe(true); // results expanded
  });

  it('matches catalog fields, hides non-audio and reports the count', async () => {
    await open(library());
    type('leonhardt');
    expect(tracks()).toEqual(['Prelude', 'Fugue']);
    expect(tree().textContent).not.toContain('cover.jpg');
    expect(status()).toContain('2 matches for “leonhardt”');
    type('baroque side');
    expect(tracks()).toEqual(['Prelude']);
    expect(status()).toContain('1 match for “baroque side”');
  });

  it('finds tracks by any catalog column, including ones the app doesn\'t display', async () => {
    const files = library('path|title|license|venue\nDisc 1/01.mp3|Prelude|CC BY-SA|Doopsgezinde Kerk\ntalk.mp3|Lecture|CC0|');
    await open(files);
    type('doopsgezinde');
    expect(tracks()).toEqual(['Prelude']);
    type('cc0');
    expect(tracks()).toEqual(['Lecture']);
  });

  it('filters groups too, dropping empty ones', async () => {
    await open(library());
    choose(groupSel(), 'tag');
    type('fugue');
    const labels = [...tree().querySelectorAll('li.group > details > summary')].map((s) => s.firstChild.textContent);
    expect(labels).toEqual(['baroque']);
    expect(tracks()).toEqual(['Fugue']);
  });

  it('says when nothing matches', async () => {
    await open(library());
    type('zzz');
    expect(tree().textContent).toBe('No tracks match “zzz”.');
    expect(status()).toContain('0 matches');
  });

  it('plays through the visible results only', async () => {
    await open([fakeFile('M/a1.mp3'), fakeFile('M/b.mp3'), fakeFile('M/a2.mp3')]);
    type('a');
    expect(tracks()).toEqual(['a1.mp3', 'a2.mp3']);
    getByText(tree(), 'a1.mp3').click();
    audio.loadMeta(5);
    audio.end();
    expect(document.querySelector('#player .title').title).toBe('a2.mp3'); // skipped b.mp3
  });

  it('Escape clears the search; / focuses it; typing in it never toggles playback', async () => {
    await open(library());
    getByText(tree(), 'Prelude').click();
    const slash = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    document.body.dispatchEvent(slash);
    expect(document.activeElement).toBe(search());
    search().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(audio.paused).toBe(false);
    type('fugue');
    search().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(search().value).toBe('');
    expect(tracks()).toContain('Lecture');
  });

  it('keeps playing while the search changes, and resets for a new folder', async () => {
    await open(library());
    getByText(tree(), 'Prelude').click();
    type('lecture');
    expect(audio.paused).toBe(false);
    await open([fakeFile('Other/x.mp3')]);
    expect(search().value).toBe('');
    expect(tracks()).toEqual(['x.mp3']);
  });
});

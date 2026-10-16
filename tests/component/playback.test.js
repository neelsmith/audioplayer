import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getByText, getByLabelText } from '@testing-library/dom';
import { initApp } from '../../src/ui/app.js';
import { fakeClassify, fakeFile, mountAppMarkup, makePlayer } from '../helpers.js';

/** Critical flow: open folder → click track → it plays → next/prev/auto-advance/keyboard. */

let app, player, audio;
const footer = () => document.getElementById('player');
/** Full file name of the current track (the footer shows it without extension; full name is the tooltip). */
const title = () => footer().querySelector('.title').title;
const current = () => document.querySelector('#tree [aria-current]')?.textContent;
const key = (k, target = document.body, init = {}) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
};

beforeEach(async () => {
  mountAppMarkup();
  document.body.insertAdjacentHTML('beforeend', '<footer id="player"></footer>');
  ({ player, audio } = await makePlayer());
  app = initApp(document, { classify: fakeClassify, player });
  const input = document.getElementById('folder-input');
  const files = ['Album/01.mp3', 'Album/02.ogg', 'Album/03.mp3', 'Album/04.wav', 'Album/cover.jpg', 'Other/x.mp3'].map((p) => fakeFile(p));
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
  document.querySelectorAll('#tree details').forEach((d) => (d.open = true));
});
afterEach(() => app.destroy());

describe('playback flow', () => {
  it('clicking a track plays it and shows it in the controls', () => {
    getByText(document.body, '01.mp3').click();
    expect(audio.src).toBe('blob:01.mp3');
    expect(audio.paused).toBe(false);
    expect(title()).toBe('01.mp3');
    expect(getByLabelText(footer(), 'Pause')).toBeTruthy();
  });

  it('next skips unsupported and non-audio files and stays in the folder', () => {
    getByText(document.body, '01.mp3').click();
    getByLabelText(footer(), 'Next track').click();
    expect(title()).toBe('03.mp3'); // 02.ogg is unsupported in the fake browser
    expect(current()).toBe('03.mp3');
    getByLabelText(footer(), 'Next track').click();
    expect(title()).toBe('04.wav');
    expect(getByLabelText(footer(), 'Next track').disabled).toBe(true);
  });

  it('auto-advances at the end of a track and stops after the last one', () => {
    getByText(document.body, '03.mp3').click();
    audio.loadMeta(10);
    audio.end();
    expect(title()).toBe('04.wav');
    expect(audio.paused).toBe(false);
    audio.end();
    expect(title()).toBe('04.wav');
    expect(audio.paused).toBe(true);
  });

  it('previous goes back a track near the start, but restarts the track later on', () => {
    getByText(document.body, '03.mp3').click();
    audio.loadMeta(100);
    audio.tick(30);
    getByLabelText(footer(), 'Previous track').click();
    expect(title()).toBe('03.mp3');
    expect(audio.currentTime).toBe(0);
    getByLabelText(footer(), 'Previous track').click();
    expect(title()).toBe('01.mp3');
  });

  it('Space toggles playback, even with a track button focused', () => {
    const btn = getByText(document.body, '01.mp3');
    btn.click();
    btn.focus();
    const ev = key(' ', btn);
    expect(ev.defaultPrevented).toBe(true);
    expect(audio.paused).toBe(true);
    key(' ');
    expect(audio.paused).toBe(false);
  });

  it('arrow keys seek ±5 s, but not when a slider has focus or with modifiers', () => {
    getByText(document.body, '01.mp3').click();
    audio.loadMeta(100);
    audio.tick(20);
    key('ArrowRight');
    expect(audio.currentTime).toBe(25);
    key('ArrowLeft');
    key('ArrowLeft');
    expect(audio.currentTime).toBe(15);
    key('ArrowRight', getByLabelText(footer(), 'Volume'));
    key('ArrowRight', document.body, { metaKey: true });
    expect(audio.currentTime).toBe(15);
  });

  it('shows the playing track in the window title', () => {
    getByText(document.body, '01.mp3').click();
    expect(document.title).toBe('▶ 01 — Audio Player');
    player.pause();
    expect(document.title).toBe('01 — Audio Player');
  });

  it('opening another folder keeps the current track playing', () => {
    getByText(document.body, '01.mp3').click();
    const input = document.getElementById('folder-input');
    Object.defineProperty(input, 'files', { value: [fakeFile('New/y.mp3')], configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(audio.paused).toBe(false);
    expect(title()).toBe('01.mp3');
  });
});

describe('remembered volume', () => {
  it('restores and saves volume and mute', async () => {
    app.destroy();
    mountAppMarkup();
    document.body.insertAdjacentHTML('beforeend', '<footer id="player"></footer>');
    const store = new Map([['audioplayer.volume', JSON.stringify({ volume: 0.3, muted: true })]]);
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    ({ player, audio } = await makePlayer());
    app = initApp(document, { classify: fakeClassify, player, storage });
    expect(audio.volume).toBe(0.3);
    expect(audio.muted).toBe(true);
    player.setVolume(0.8);
    expect(JSON.parse(store.get('audioplayer.volume'))).toEqual({ volume: 0.8, muted: false });
  });
});

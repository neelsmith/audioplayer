import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getByText, getByLabelText } from '@testing-library/dom';
import { initApp } from '../../src/ui/app.js';
import { fakeClassify, fakeFile, mountAppMarkup, makePlayer } from '../helpers.js';

/**
 * random() always returning 0 makes Fisher–Yates rotate: the rest of [0..n-1] (minus
 * the first) comes out as [..., ] deterministically — we just read the order back.
 */
const zero = () => 0;

let app, player, audio, store;
const footer = () => document.getElementById('player');
const btn = () => getByLabelText(footer(), 'Shuffle');
const current = () => footer().querySelector('.title').title; // full file name
const finish = () => { audio.loadMeta(5); audio.end(); };

async function setup({ saved } = {}) {
  mountAppMarkup();
  document.body.insertAdjacentHTML('beforeend', '<footer id="player"></footer>');
  store = new Map(saved === undefined ? [] : [['audioplayer.shuffle', saved]]);
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  ({ player, audio } = await makePlayer());
  app = initApp(document, { classify: fakeClassify, player, storage, random: zero });
  const input = document.getElementById('folder-input');
  const files = ['a', 'b', 'c', 'd', 'e'].map((n) => fakeFile(`M/${n}.mp3`)).concat(fakeFile('M/x.ogg'));
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
}
afterEach(() => app.destroy());

/** Play from `start` to the end of the playlist, returning the file names in play order. */
function playThrough(start) {
  getByText(document.body, start).click();
  const seen = [current()];
  for (let i = 0; i < 10 && getByLabelText(footer(), 'Next track').disabled === false; i++) {
    finish();
    seen.push(current());
  }
  return seen;
}

describe('shuffle', () => {
  beforeEach(() => setup());

  it('is off by default and toggles with the button', () => {
    expect(btn().getAttribute('aria-pressed')).toBe('false');
    btn().click();
    expect(btn().getAttribute('aria-pressed')).toBe('true');
    expect(btn().title).toBe('Shuffle on (S)');
    btn().click();
    expect(btn().getAttribute('aria-pressed')).toBe('false');
  });

  it('plays every playable track once, starting with the one picked, then stops', () => {
    btn().click();
    const seen = playThrough('c.mp3');
    expect(seen[0]).toBe('c.mp3');
    expect([...seen].sort()).toEqual(['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3', 'e.mp3']); // never x.ogg
    expect(seen).not.toEqual(['c.mp3', 'd.mp3', 'e.mp3']); // not just folder order from c
    finish();
    expect(audio.paused).toBe(true);
  });

  it('previous steps back through the shuffled order', () => {
    btn().click();
    getByText(document.body, 'a.mp3').click();
    finish();
    const second = current();
    finish();
    getByLabelText(footer(), 'Previous track').click();
    expect(current()).toBe(second);
    getByLabelText(footer(), 'Previous track').click();
    expect(current()).toBe('a.mp3');
  });

  it('turning shuffle on mid-track keeps the track and shuffles the rest', () => {
    getByText(document.body, 'b.mp3').click();
    btn().click();
    expect(current()).toBe('b.mp3');
    expect(audio.paused).toBe(false);
    finish();
    expect(current()).not.toBe('b.mp3');
  });

  it('turning shuffle off continues in folder order from the current track', () => {
    btn().click();
    getByText(document.body, 'a.mp3').click();
    finish();
    const now = current();
    btn().click(); // off
    const order = ['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3', 'e.mp3'];
    const expected = order[order.indexOf(now) + 1];
    if (expected) {
      finish();
      expect(current()).toBe(expected);
    } else {
      expect(getByLabelText(footer(), 'Next track').disabled).toBe(true);
    }
  });

  it('S toggles shuffle, but not while typing in the search box', () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }));
    expect(app.shuffle).toBe(true);
    const search = document.getElementById('search');
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }));
    expect(app.shuffle).toBe(true);
  });

  it('is remembered', () => {
    btn().click();
    expect(store.get('audioplayer.shuffle')).toBe('1');
  });
});

describe('remembered shuffle', () => {
  it('starts on if it was on last time', async () => {
    await setup({ saved: '1' });
    expect(btn().getAttribute('aria-pressed')).toBe('true');
    expect(playThrough('a.mp3')).toHaveLength(5);
  });
});

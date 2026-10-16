import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getByText, queryByRole } from '@testing-library/dom';
import { buildTree } from '../../src/fs/tree.js';
import { renderTree, countKinds } from '../../src/ui/browser.js';
import { fakeClassify } from '../helpers.js';

const tree = () =>
  buildTree(
    ['Album/01 Intro.mp3', 'Album/02 Song.ogg', 'Album/cover.jpg', 'Album/Disc 2/01.wav', 'Album/Bought.m4p', 'notes.txt'].map((path) => ({
      path,
      file: { type: '' },
    })),
  );

let el;
beforeEach(() => {
  document.body.innerHTML = '<div id="t"></div>';
  el = document.getElementById('t');
});

describe('countKinds', () => {
  it('counts each kind', () => {
    expect(countKinds(tree(), fakeClassify)).toEqual({ playable: 2, unsupported: 1, protected: 1, other: 2 });
  });
});

describe('renderTree', () => {
  it('renders folders as collapsible details, top level open', () => {
    renderTree(el, tree(), { classify: fakeClassify });
    const album = el.querySelector('li.dir[data-path="Album"] > details');
    const disc2 = el.querySelector('li.dir[data-path="Album/Disc 2"] > details');
    expect(album.open).toBe(true);
    expect(disc2.open).toBe(false);
    expect(album.querySelector('summary').textContent).toBe('Album');
  });

  it('makes playable tracks buttons and calls onSelect', () => {
    const onSelect = vi.fn();
    renderTree(el, tree(), { classify: fakeClassify, onSelect });
    const btn = getByText(el, '01 Intro.mp3');
    expect(btn.tagName).toBe('BUTTON');
    btn.click();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ path: 'Album/01 Intro.mp3' }));
    expect(btn.getAttribute('aria-current')).toBe('true');
  });

  it('moves the highlight to the newest selection', () => {
    renderTree(el, tree(), { classify: fakeClassify });
    const a = getByText(el, '01 Intro.mp3');
    const b = getByText(el, '01.wav');
    a.click();
    b.click();
    expect(a.hasAttribute('aria-current')).toBe(false);
    expect(b.getAttribute('aria-current')).toBe('true');
  });

  it('greys out non-audio files without making them clickable', () => {
    renderTree(el, tree(), { classify: fakeClassify });
    const li = el.querySelector('li.file[data-path="Album/cover.jpg"]');
    expect(li.classList.contains('other')).toBe(true);
    expect(queryByRole(li, 'button')).toBeNull();
    expect(li.querySelector('.badge')).toBeNull();
  });

  it('marks unsupported audio distinctly, with a badge and tooltip', () => {
    renderTree(el, tree(), { classify: fakeClassify });
    const li = el.querySelector('li.file[data-path="Album/02 Song.ogg"]');
    expect(li.classList.contains('unsupported')).toBe(true);
    expect(queryByRole(li, 'button')).toBeNull();
    expect(li.querySelector('.badge').textContent).toBe('unsupported');
    expect(li.title).toMatch(/not supported/);
  });

  it('marks DRM-protected audio with its own badge and tooltip', () => {
    renderTree(el, tree(), { classify: fakeClassify });
    const li = el.querySelector('li.file[data-path="Album/Bought.m4p"]');
    expect(li.classList.contains('protected')).toBe(true);
    expect(queryByRole(li, 'button')).toBeNull();
    expect(li.querySelector('.badge').textContent).toBe('protected');
    expect(li.title).toMatch(/DRM/);
  });

  it('select(path) highlights a track and opens its folders', () => {
    const view = renderTree(el, tree(), { classify: fakeClassify });
    view.select('Album/Disc 2/01.wav');
    expect(el.querySelector('li.dir[data-path="Album/Disc 2"] > details').open).toBe(true);
    expect(getByText(el, '01.wav').getAttribute('aria-current')).toBe('true');
  });
});

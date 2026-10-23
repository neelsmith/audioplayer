import { describe, it, expect } from 'vitest';
import { formatTime, displayName, trackTitle, trackSubtitle } from '../../src/ui/format.js';

describe('formatTime', () => {
  it('formats under a minute', () => expect(formatTime(7)).toBe('0:07'));
  it('formats minutes', () => expect(formatTime(125.9)).toBe('2:05'));
  it('formats hours', () => expect(formatTime(3725)).toBe('1:02:05'));
  it('handles unknown durations', () => {
    expect(formatTime(NaN)).toBe('--:--');
    expect(formatTime(Infinity)).toBe('--:--');
    expect(formatTime(-1)).toBe('--:--');
  });
});

describe('displayName', () => {
  it('drops the extension', () => expect(displayName('01 Intro.mp3')).toBe('01 Intro'));
  it('keeps names without one, and dotfiles', () => {
    expect(displayName('README')).toBe('README');
    expect(displayName('.hidden')).toBe('.hidden');
  });
  it('drops only the last extension', () => expect(displayName('a.b.flac')).toBe('a.b'));
});

describe('trackTitle / trackSubtitle', () => {
  const plain = { name: '01 Intro.mp3', path: 'Artist/Album/01 Intro.mp3' };
  it('fall back to file name and folder', () => {
    expect(trackTitle(plain)).toBe('01 Intro');
    expect(trackSubtitle(plain)).toBe('Artist/Album');
  });
  it('use catalog title and "Composer · Performer — Album" when present', () => {
    const t = { ...plain, meta: { title: 'Overture', composer: '', performer: 'X', album: '' } };
    expect(trackTitle(t)).toBe('Overture');
    expect(trackSubtitle(t)).toBe('X');
    expect(trackSubtitle({ ...plain, meta: { composer: 'Bach', performer: 'Gould', album: 'Goldberg' } }))
      .toBe('Bach · Gould — Goldberg');
    expect(trackSubtitle({ ...plain, meta: { composer: 'Bach', album: 'WTC' } })).toBe('Bach — WTC');
    expect(trackSubtitle({ ...plain, meta: { album: 'WTC' } })).toBe('WTC');
  });
});

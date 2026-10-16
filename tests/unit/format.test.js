import { describe, it, expect } from 'vitest';
import { formatTime, displayName } from '../../src/ui/format.js';

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

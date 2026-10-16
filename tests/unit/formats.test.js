import { describe, it, expect } from 'vitest';
import { getExtension, mimeFor, isAudio, isProtected, classify } from '../../src/audio/formats.js';

describe('getExtension', () => {
  it('lower-cases the last extension', () => expect(getExtension('Song.MP3')).toBe('mp3'));
  it('handles multiple dots', () => expect(getExtension('a.b.flac')).toBe('flac'));
  it('returns "" without an extension', () => {
    expect(getExtension('README')).toBe('');
    expect(getExtension('.hidden')).toBe('');
    expect(getExtension('trailing.')).toBe('');
  });
});

describe('mimeFor', () => {
  it('maps known extensions', () => {
    expect(mimeFor('a.mp3')).toBe('audio/mpeg');
    expect(mimeFor('a.m4a')).toBe('audio/mp4');
    expect(mimeFor('a.wav')).toBe('audio/wav');
    expect(mimeFor('a.flac')).toBe('audio/flac');
  });
  it('falls back to an audio/* type reported by the browser', () => {
    expect(mimeFor('weird.xyz', 'audio/x-weird')).toBe('audio/x-weird');
  });
  it('ignores non-audio reported types', () => {
    expect(mimeFor('notes.txt', 'text/plain')).toBe('');
  });
});

describe('isAudio', () => {
  it('recognises audio files', () => expect(isAudio('x.ogg')).toBe(true));
  it('rejects other files', () => {
    expect(isAudio('cover.jpg', 'image/jpeg')).toBe(false);
    expect(isAudio('notes.txt')).toBe(false);
  });
});

describe('classify', () => {
  const probe = (answers) => (mime) => answers[mime] ?? '';
  it('is "playable" when the browser says probably/maybe', () => {
    expect(classify('a.mp3', '', probe({ 'audio/mpeg': 'probably' }))).toBe('playable');
    expect(classify('a.flac', '', probe({ 'audio/flac': 'maybe' }))).toBe('playable');
  });
  it('is "unsupported" for audio the browser cannot play', () => {
    expect(classify('a.ogg', '', probe({}))).toBe('unsupported');
  });
  it('is "protected" for DRM files, whatever the browser claims', () => {
    expect(classify('Song.M4P', 'audio/mp4', probe({ 'audio/mp4': 'probably' }))).toBe('protected');
    expect(isProtected('a.m4p')).toBe(true);
    expect(isProtected('a.m4a')).toBe(false);
    expect(isAudio('a.m4p')).toBe(true);
  });
  it('is "other" for non-audio files', () => {
    expect(classify('cover.jpg', 'image/jpeg', probe({}))).toBe('other');
  });
});

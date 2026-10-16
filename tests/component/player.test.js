import { describe, it, expect, vi } from 'vitest';
import { makePlayer } from '../helpers.js';

const track = (name) => ({ name, path: `Album/${name}`, type: 'file', file: { name } });

describe('Player', () => {
  it('loads a file via an object URL and autoplays', async () => {
    const { player, audio, created } = await makePlayer();
    await player.load(track('a.mp3'));
    expect(audio.src).toBe('blob:a.mp3');
    expect(created).toEqual(['blob:a.mp3']);
    expect(player.state).toMatchObject({ playing: true, track: { name: 'a.mp3' }, error: null });
  });

  it('revokes the previous URL when loading another track', async () => {
    const { player, revoked } = await makePlayer();
    await player.load(track('a.mp3'));
    await player.load(track('b.mp3'));
    expect(revoked).toEqual(['blob:a.mp3']);
  });

  it('can load without playing', async () => {
    const { player } = await makePlayer();
    await player.load(track('a.mp3'), { autoplay: false });
    expect(player.state.playing).toBe(false);
  });

  it('notifies subscribers immediately and on media events', async () => {
    const { player, audio } = await makePlayer();
    const fn = vi.fn();
    player.subscribe(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    await player.load(track('a.mp3'));
    audio.loadMeta(120);
    audio.tick(30);
    expect(fn.mock.lastCall[0]).toMatchObject({ duration: 120, currentTime: 30 });
  });

  it('toggles play/pause and does nothing without a track', async () => {
    const { player, audio } = await makePlayer();
    await player.toggle();
    expect(audio.paused).toBe(true);
    await player.load(track('a.mp3'));
    await player.toggle();
    expect(audio.paused).toBe(true);
    await player.toggle();
    expect(audio.paused).toBe(false);
  });

  it('clamps seeking to the track length', async () => {
    const { player, audio } = await makePlayer();
    await player.load(track('a.mp3'));
    audio.loadMeta(100);
    player.seek(250);
    expect(audio.currentTime).toBe(100);
    player.seekBy(-500);
    expect(audio.currentTime).toBe(0);
    player.seekBy(5);
    expect(audio.currentTime).toBe(5);
  });

  it('clamps volume and unmutes when volume is raised', async () => {
    const { player, audio } = await makePlayer();
    player.toggleMute();
    expect(audio.muted).toBe(true);
    player.setVolume(1.5);
    expect(audio.volume).toBe(1);
    expect(audio.muted).toBe(false);
    player.setVolume(-1);
    expect(audio.volume).toBe(0);
  });

  it('reports a media error for the loaded track', async () => {
    const { player, audio } = await makePlayer();
    await player.load(track('bad.mp3'));
    audio.fire('error');
    expect(player.state.error).toBe('Could not play this file.');
    await player.load(track('good.mp3'));
    expect(player.state.error).toBeNull();
  });

  it('explains blocked playback, and ignores AbortError from an interrupted load', async () => {
    const { player, audio } = await makePlayer();
    audio.playResult = Promise.reject(new DOMException('', 'NotAllowedError'));
    await player.load(track('a.mp3'));
    expect(player.state.error).toMatch(/blocked/);
    audio.playResult = Promise.reject(new DOMException('', 'AbortError'));
    await player.load(track('b.mp3'));
    expect(player.state.error).toBeNull();
  });

  it('calls onEnded when a track finishes', async () => {
    const { player, audio } = await makePlayer();
    player.onEnded = vi.fn();
    await player.load(track('a.mp3'));
    audio.loadMeta(10);
    audio.end();
    expect(player.onEnded).toHaveBeenCalledOnce();
  });
});

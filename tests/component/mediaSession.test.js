import { describe, it, expect, vi } from 'vitest';
import { connectMediaSession } from '../../src/audio/mediaSession.js';
import { makePlayer } from '../helpers.js';

function fakeSession() {
  const handlers = {};
  return {
    handlers,
    metadata: undefined,
    playbackState: 'none',
    setActionHandler: vi.fn((a, fn) => {
      if (a === 'seekto' && fn && fakeSession.rejectSeekTo) throw new TypeError('unsupported');
      handlers[a] = fn;
    }),
    setPositionState: vi.fn(),
  };
}
const track = { name: '03 Song.m4a', path: 'Artist/Album/03 Song.m4a', type: 'file', file: { name: '03 Song.m4a' } };

describe('connectMediaSession', () => {
  it('is a no-op without the API', async () => {
    const { player } = await makePlayer();
    expect(() => connectMediaSession(player, { next() {}, prev() {} }, { mediaSession: null })()).not.toThrow();
  });

  it('publishes metadata from the file and folder names', async () => {
    const { player } = await makePlayer();
    const ms = fakeSession();
    connectMediaSession(player, { next() {}, prev() {} }, { mediaSession: ms, Metadata: null });
    expect(ms.playbackState).toBe('none');
    await player.load(track);
    expect(ms.metadata).toEqual({ title: '03 Song', album: 'Album', artist: 'Artist' });
    expect(ms.playbackState).toBe('playing');
    player.pause();
    expect(ms.playbackState).toBe('paused');
  });

  it('reports position once the duration is known', async () => {
    const { player, audio } = await makePlayer();
    const ms = fakeSession();
    connectMediaSession(player, { next() {}, prev() {} }, { mediaSession: ms, Metadata: null });
    await player.load(track);
    expect(ms.setPositionState).not.toHaveBeenCalled();
    audio.loadMeta(200);
    audio.tick(50);
    expect(ms.setPositionState).toHaveBeenLastCalledWith({ duration: 200, position: 50, playbackRate: 1 });
  });

  it('routes media keys / Control Center actions to the player', async () => {
    const { player, audio } = await makePlayer();
    const ms = fakeSession();
    const nav = { next: vi.fn(), prev: vi.fn() };
    connectMediaSession(player, nav, { mediaSession: ms, Metadata: null });
    await player.load(track);
    audio.loadMeta(100);
    ms.handlers.pause();
    expect(audio.paused).toBe(true);
    ms.handlers.play();
    expect(audio.paused).toBe(false);
    ms.handlers.nexttrack();
    ms.handlers.previoustrack();
    expect(nav.next).toHaveBeenCalled();
    expect(nav.prev).toHaveBeenCalled();
    ms.handlers.seekto({ seekTime: 40 });
    ms.handlers.seekforward({});
    expect(audio.currentTime).toBe(50);
    ms.handlers.seekbackward({ seekOffset: 30 });
    expect(audio.currentTime).toBe(20);
  });

  it('survives browsers that reject some actions, and clears handlers on disconnect', async () => {
    const { player } = await makePlayer();
    const ms = fakeSession();
    fakeSession.rejectSeekTo = true;
    const disconnect = connectMediaSession(player, { next() {}, prev() {} }, { mediaSession: ms, Metadata: null });
    fakeSession.rejectSeekTo = false;
    expect(ms.handlers.play).toBeTypeOf('function');
    disconnect();
    expect(ms.handlers.play).toBeNull();
  });
});

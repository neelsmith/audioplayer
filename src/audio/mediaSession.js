import { trackTitle } from '../ui/format.js';

/**
 * Connect the player to the Media Session API (Safari 15+, Chrome, Firefox):
 * hardware media keys, macOS Control Center / Now Playing, iOS lock screen.
 * Title, artist and album come from the track's catalog entry when it has one
 * (artist = performer, else composer: MediaMetadata has no composer field);
 * otherwise title = file name without extension, album = its folder, artist = the
 * folder above (the common Artist/Album/Track layout). No-op where unsupported.
 *
 * @param {import('./player.js').Player} player
 * @param {{ next: () => void, prev: () => void }} nav
 * @param {{ mediaSession?: MediaSession, Metadata?: typeof MediaMetadata }} [env]
 * @returns {() => void} disconnect
 */
export function connectMediaSession(player, { next, prev }, {
  mediaSession = globalThis.navigator?.mediaSession,
  Metadata = globalThis.MediaMetadata,
} = {}) {
  if (!mediaSession) return () => {};
  const ms = mediaSession;
  const actions = {
    play: () => player.play(),
    pause: () => player.pause(),
    previoustrack: () => prev(),
    nexttrack: () => next(),
    seekbackward: (d) => player.seekBy(-(d?.seekOffset || 10)),
    seekforward: (d) => player.seekBy(d?.seekOffset || 10),
    seekto: (d) => player.seek(d.seekTime),
  };
  const setHandler = (action, fn) => {
    try { ms.setActionHandler(action, fn); } catch { /* action unsupported in this browser */ }
  };
  for (const [action, fn] of Object.entries(actions)) setHandler(action, fn);

  let lastKey;
  const unsubscribe = player.subscribe((s) => {
    const info = s.track ? describe(s.track) : null;
    // Re-publish when the track changes, or its catalog data does (catalog switched).
    const key = info && `${s.track.path}\u0000${info.title}\u0000${info.artist}\u0000${info.album}`;
    if (key !== lastKey) {
      lastKey = key;
      ms.metadata = info ? (Metadata ? new Metadata(info) : info) : null;
    }
    ms.playbackState = s.track ? (s.playing ? 'playing' : 'paused') : 'none';
    if (s.track && Number.isFinite(s.duration) && s.duration > 0 && ms.setPositionState) {
      try {
        ms.setPositionState({ duration: s.duration, position: Math.min(s.currentTime, s.duration), playbackRate: 1 });
      } catch { /* ignore transient invalid states */ }
    }
  });

  function describe(track) {
    const folders = track.path.split('/').slice(0, -1);
    return {
      title: trackTitle(track),
      album: track.meta?.album || folders.at(-1) || '',
      artist: track.meta?.performer || track.meta?.composer || folders.at(-2) || '',
    };
  }

  return () => {
    unsubscribe();
    for (const action of Object.keys(actions)) setHandler(action, null);
  };
}

import { displayName } from '../ui/format.js';

/**
 * Connect the player to the Media Session API (Safari 15+, Chrome, Firefox):
 * hardware media keys, macOS Control Center / Now Playing, iOS lock screen.
 * Title = file name without extension; album = its folder; artist = the folder above
 * (matching the common Artist/Album/Track layout). No-op where unsupported.
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

  let lastTrack;
  const unsubscribe = player.subscribe((s) => {
    if (s.track !== lastTrack) {
      lastTrack = s.track;
      if (s.track) {
        const folders = s.track.path.split('/').slice(0, -1);
        const info = {
          title: displayName(s.track.name),
          album: folders.at(-1) || '',
          artist: folders.at(-2) || '',
        };
        ms.metadata = Metadata ? new Metadata(info) : info;
      } else {
        ms.metadata = null;
      }
    }
    ms.playbackState = s.track ? (s.playing ? 'playing' : 'paused') : 'none';
    if (s.track && Number.isFinite(s.duration) && s.duration > 0 && ms.setPositionState) {
      try {
        ms.setPositionState({ duration: s.duration, position: Math.min(s.currentTime, s.duration), playbackRate: 1 });
      } catch { /* ignore transient invalid states */ }
    }
  });

  return () => {
    unsubscribe();
    for (const action of Object.keys(actions)) setHandler(action, null);
  };
}

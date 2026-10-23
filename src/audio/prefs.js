/**
 * Remember volume/mute and shuffle between visits. Storage can be unavailable or throw
 * (private browsing, file:// in some browsers), so every access is guarded and
 * the app works without it.
 */
const KEY = 'audioplayer.volume';

/** localStorage if usable, else null. */
export function safeStorage() {
  try {
    const s = globalThis.localStorage;
    s.getItem(KEY);
    return s;
  } catch {
    return null;
  }
}

/** @returns {{ volume: number, muted: boolean } | null} */
export function loadVolume(storage) {
  try {
    const v = JSON.parse(storage?.getItem(KEY) ?? 'null');
    if (v && typeof v.volume === 'number' && v.volume >= 0 && v.volume <= 1) return { volume: v.volume, muted: !!v.muted };
  } catch { /* corrupt or unavailable */ }
  return null;
}

const SHUFFLE_KEY = 'audioplayer.shuffle';

/** @returns {boolean} false if never saved or unreadable */
export function loadShuffle(storage) {
  try {
    return storage?.getItem(SHUFFLE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveShuffle(storage, on) {
  try {
    storage?.setItem(SHUFFLE_KEY, on ? '1' : '0');
  } catch { /* quota or unavailable */ }
}

export function saveVolume(storage, { volume, muted }) {
  try {
    storage?.setItem(KEY, JSON.stringify({ volume, muted }));
  } catch { /* quota or unavailable */ }
}

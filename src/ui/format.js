/**
 * Format a duration in seconds as m:ss, or h:mm:ss for an hour or more.
 * Non-finite or negative input (e.g. unknown duration) yields "--:--".
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** File name without its extension, for display ("01 Intro.mp3" → "01 Intro"). */
export function displayName(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

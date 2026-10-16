import { formatTime, displayName } from './format.js';

const svg = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="${d}"/></svg>`;
const ICONS = {
  play: svg('M8 5v14l11-7z'),
  pause: svg('M6 5h4v14H6zm8 0h4v14h-4z'),
  prev: svg('M6 6h2v12H6zm3.5 6 8.5 6V6z'),
  next: svg('M16 6h2v12h-2zM6 18l8.5-6L6 6z'),
  volume: svg('M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z'),
  muted: svg('M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.9-2.9-1.4-1.4-2.9 2.9-2.9-2.9-1.4 1.4 2.9 2.9-2.9 2.9 1.4 1.4 2.9-2.9 2.9 2.9 1.4-1.4z'),
};

const TEMPLATE = `
  <div class="transport">
    <button type="button" class="prev" aria-label="Previous track" title="Previous track">${ICONS.prev}</button>
    <button type="button" class="play" aria-label="Play" title="Play (Space)" aria-keyshortcuts="Space">${ICONS.play}</button>
    <button type="button" class="next" aria-label="Next track" title="Next track">${ICONS.next}</button>
  </div>
  <div class="info" aria-live="polite">
    <span class="title">No track selected</span>
    <span class="folder"></span>
  </div>
  <div class="timeline">
    <span class="elapsed">0:00</span>
    <input type="range" class="seek" min="0" max="0" step="any" value="0" aria-label="Seek" aria-keyshortcuts="ArrowLeft ArrowRight" />
    <span class="duration">--:--</span>
  </div>
  <div class="volume">
    <button type="button" class="mute" aria-label="Mute" title="Mute">${ICONS.volume}</button>
    <input type="range" class="vol" min="0" max="1" step="0.05" value="1" aria-label="Volume" />
  </div>
  <p class="error" role="alert"></p>`;

/**
 * Render the player controls into `container`.
 * @param {HTMLElement} container
 * @param {{ toggle: Function, prev: Function, next: Function, seek: (t: number) => void,
 *           setVolume: (v: number) => void, toggleMute: Function }} actions
 * @param {{ volumeAdjustable?: boolean }} [options]  false hides the volume slider (iOS ignores it)
 * @returns {{ update: (state: import('../audio/player.js').PlayerState, nav?: { hasPrev: boolean, hasNext: boolean }) => void }}
 */
export function renderControls(container, actions, { volumeAdjustable = true } = {}) {
  container.classList.add('player');
  container.innerHTML = TEMPLATE;
  const $ = (sel) => container.querySelector(sel);
  const el = {
    prev: $('.prev'), play: $('.play'), next: $('.next'),
    title: $('.title'), folder: $('.folder'),
    elapsed: $('.elapsed'), seek: $('.seek'), duration: $('.duration'),
    mute: $('.mute'), vol: $('.vol'), error: $('.error'),
  };
  el.vol.hidden = !volumeAdjustable;
  const timeText = (t, d) => (Number.isFinite(d) && d > 0 ? `${formatTime(t)} of ${formatTime(d)}` : formatTime(t));
  let lastDuration = NaN;

  el.play.addEventListener('click', () => actions.toggle());
  el.prev.addEventListener('click', () => actions.prev());
  el.next.addEventListener('click', () => actions.next());
  el.mute.addEventListener('click', () => actions.toggleMute());
  el.vol.addEventListener('input', () => actions.setVolume(Number(el.vol.value)));

  // While the user drags the seek bar, show the preview time and don't let
  // timeupdate yank the thumb back; commit on change.
  let scrubbing = false;
  el.seek.addEventListener('input', () => {
    scrubbing = true;
    el.elapsed.textContent = formatTime(Number(el.seek.value));
    el.seek.setAttribute('aria-valuetext', timeText(Number(el.seek.value), lastDuration));
  });
  el.seek.addEventListener('change', () => {
    scrubbing = false;
    actions.seek(Number(el.seek.value));
  });

  function update(state, { hasPrev = false, hasNext = false } = {}) {
    const loaded = !!state.track;
    const known = Number.isFinite(state.duration) && state.duration > 0;

    el.play.disabled = !loaded;
    el.prev.disabled = !loaded || (!hasPrev && state.currentTime < 0.5);
    el.next.disabled = !hasNext;
    el.play.innerHTML = state.playing ? ICONS.pause : ICONS.play;
    el.play.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    el.play.title = state.playing ? 'Pause (Space)' : 'Play (Space)';

    if (loaded) {
      el.title.textContent = displayName(state.track.name);
      el.title.title = state.track.name;
      const folder = state.track.path.slice(0, Math.max(0, state.track.path.lastIndexOf('/')));
      el.folder.textContent = folder;
    } else {
      el.title.textContent = 'No track selected';
      el.folder.textContent = '';
    }

    el.seek.disabled = !known;
    el.seek.max = known ? String(state.duration) : '0';
    el.duration.textContent = known ? formatTime(state.duration) : '--:--';
    lastDuration = state.duration;
    if (!scrubbing) {
      el.seek.value = String(state.currentTime);
      el.elapsed.textContent = formatTime(state.currentTime);
      el.seek.setAttribute('aria-valuetext', timeText(state.currentTime, state.duration));
    }

    const silent = state.muted || state.volume === 0;
    el.mute.innerHTML = silent ? ICONS.muted : ICONS.volume;
    el.mute.setAttribute('aria-label', state.muted ? 'Unmute' : 'Mute');
    el.mute.title = state.muted ? 'Unmute' : 'Mute';
    el.mute.setAttribute('aria-pressed', String(state.muted));
    el.vol.value = String(state.muted ? 0 : state.volume);
    el.vol.setAttribute('aria-valuetext', state.muted ? 'Muted' : `${Math.round(state.volume * 100)}%`);

    el.error.textContent = state.error || '';
  }

  return { update };
}

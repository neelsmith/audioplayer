/**
 * Thin wrapper around an HTMLAudioElement that plays File objects via
 * object URLs and reports a plain state object to subscribers.
 * The audio element and URL functions are injectable for tests.
 *
 * @typedef {{
 *   track: import('../fs/tree.js').FileNode | null,
 *   playing: boolean, currentTime: number, duration: number,
 *   volume: number, muted: boolean, error: string | null,
 * }} PlayerState
 */

const MEDIA_EVENTS = ['play', 'pause', 'timeupdate', 'durationchange', 'loadedmetadata', 'volumechange', 'seeked'];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class Player {
  /**
   * @param {{ audio?: HTMLAudioElement, createURL?: (f: Blob) => string, revokeURL?: (u: string) => void }} [deps]
   */
  constructor({
    audio = new Audio(),
    createURL = (f) => URL.createObjectURL(f),
    revokeURL = (u) => URL.revokeObjectURL(u),
  } = {}) {
    this.audio = audio;
    this.createURL = createURL;
    this.revokeURL = revokeURL;
    this.track = null;
    this.url = null;
    this.error = null;
    /** Called when a track finishes playing. */
    this.onEnded = () => {};
    this.listeners = new Set();

    audio.preload = 'auto';
    // iOS ignores programmatic volume (it stays 1); detect so the UI can hide the slider.
    const before = audio.volume;
    audio.volume = before === 0.5 ? 0.25 : 0.5;
    /** False where the volume can't be set from script (iOS). */
    this.volumeAdjustable = audio.volume !== before;
    audio.volume = before;

    for (const type of MEDIA_EVENTS) audio.addEventListener(type, () => this.emit());
    audio.addEventListener('ended', () => {
      this.emit();
      this.onEnded();
    });
    audio.addEventListener('error', () => {
      if (!this.track) return;
      this.error = 'Could not play this file.';
      this.emit();
    });
  }

  /** @returns {PlayerState} */
  get state() {
    const a = this.audio;
    return {
      track: this.track,
      playing: !!this.track && !a.paused,
      currentTime: a.currentTime || 0,
      duration: a.duration,
      volume: a.volume,
      muted: a.muted,
      error: this.error,
    };
  }

  /** @param {(state: PlayerState) => void} fn  called now and on every change; returns unsubscribe */
  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  emit() {
    const s = this.state;
    for (const fn of this.listeners) fn(s);
  }

  /** Load a file node and (by default) start playing it. */
  load(node, { autoplay = true } = {}) {
    const previous = this.url;
    this.track = node;
    this.error = null;
    this.url = this.createURL(node.file);
    this.audio.src = this.url;
    if (previous) this.revokeURL(previous);
    this.emit();
    return autoplay ? this.play() : Promise.resolve();
  }

  play() {
    if (!this.track) return Promise.resolve();
    return Promise.resolve(this.audio.play()).catch((err) => {
      // AbortError: a newer load() interrupted this play() — expected, not a failure.
      if (err?.name === 'AbortError') return;
      this.error = err?.name === 'NotAllowedError' ? 'Playback was blocked by the browser. Press play.' : 'Could not play this file.';
      this.emit();
    });
  }

  pause() {
    this.audio.pause();
  }

  toggle() {
    if (!this.track) return Promise.resolve();
    if (this.audio.paused) return this.play();
    this.pause();
    return Promise.resolve();
  }

  /** Seek to `seconds`, clamped to the track. */
  seek(seconds) {
    if (!this.track) return;
    const d = this.audio.duration;
    this.audio.currentTime = clamp(seconds, 0, Number.isFinite(d) ? d : Infinity);
    this.emit();
  }

  seekBy(delta) {
    this.seek((this.audio.currentTime || 0) + delta);
  }

  /** Volume 0–1; raising it above 0 unmutes. */
  setVolume(v) {
    this.audio.volume = clamp(v, 0, 1);
    if (v > 0) this.audio.muted = false;
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
  }
}

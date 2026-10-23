/** Fake browser capability probe: plays mp3/m4a/wav, not ogg/flac. */
import { classify } from '../src/audio/formats.js';
const PLAYS = new Set(['audio/mpeg', 'audio/mp4', 'audio/wav']);
export const fakeClassify = (name, type) => classify(name, type, (mime) => (PLAYS.has(mime) ? 'probably' : ''));

/** File-like object with a relative path; `text` makes it readable (for .cex catalogs). */
export const fakeFile = (path, type = '', text) => ({
  name: path.split('/').pop(), webkitRelativePath: path, type,
  text: async () => { if (text === undefined) throw new Error('unreadable'); return text; },
});

/** Minimal app markup matching src/index.html. */
export function mountAppMarkup() {
  document.body.innerHTML = `
    <button type="button" id="open-folder">Open folder…</button>
    <input id="folder-input" type="file" webkitdirectory multiple hidden />
    <main id="drop-zone"><p id="status"></p>
      <div id="toolbar" hidden><input type="search" id="search" />
        <div id="catalog-bar" hidden><select id="catalog-select"></select><select id="group-select"></select></div></div>
      <details id="warnings" hidden><summary></summary><ul></ul></details>
      <nav id="tree"></nav></main>`;
  return document.body;
}

/**
 * Stand-in for HTMLAudioElement (jsdom doesn't implement playback).
 * Fires the same events the player listens to. `playResult` lets a test make play() reject.
 */
export class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.src = '';
    this.paused = true;
    this.duration = NaN;
    this._currentTime = 0;
    this._volume = 1;
    this._muted = false;
    this.preload = '';
    this.playResult = null; // e.g. Promise.reject(new DOMException('', 'NotAllowedError'))
  }
  fire(type) { this.dispatchEvent(new Event(type)); }
  play() {
    if (this.playResult) return this.playResult;
    this.paused = false;
    this.fire('play');
    return Promise.resolve();
  }
  pause() { this.paused = true; this.fire('pause'); }
  get currentTime() { return this._currentTime; }
  set currentTime(t) { this._currentTime = t; }
  get volume() { return this._volume; }
  set volume(v) { this._volume = v; this.fire('volumechange'); }
  get muted() { return this._muted; }
  set muted(m) { this._muted = m; this.fire('volumechange'); }
  /** Simulate metadata arriving. */
  loadMeta(duration) { this.duration = duration; this.fire('durationchange'); }
  /** Simulate playback progress. */
  tick(t) { this._currentTime = t; this.fire('timeupdate'); }
  end() { this._currentTime = this.duration; this.paused = true; this.fire('pause'); this.fire('ended'); }
}

/** Player wired to a FakeAudio with traceable object URLs. */
export async function makePlayer() {
  const { Player } = await import('../src/audio/player.js');
  const audio = new FakeAudio();
  const created = [];
  const revoked = [];
  const player = new Player({
    audio,
    createURL: (f) => { const u = `blob:${f?.name ?? created.length}`; created.push(u); return u; },
    revokeURL: (u) => revoked.push(u),
  });
  return { player, audio, created, revoked };
}

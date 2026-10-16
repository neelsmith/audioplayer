import { buildTree, fromFileList } from '../fs/tree.js';
import { collectDropped } from '../fs/pickFolder.js';
import { classify as defaultClassify } from '../audio/formats.js';
import { renderTree, countKinds, kindOf } from './browser.js';
import { renderControls } from './controls.js';
import { folderPlaylist, step } from '../audio/playlist.js';
import { connectMediaSession } from '../audio/mediaSession.js';
import { loadVolume, saveVolume } from '../audio/prefs.js';
import { displayName } from './format.js';

const APP_TITLE = 'Audio Player';

/** "Previous" restarts the current track if more than this many seconds in. */
const RESTART_THRESHOLD = 3;
const SEEK_STEP = 5;

/** True if keys typed at `t` are text input we must not hijack. */
function isTyping(t) {
  const tag = t?.tagName;
  return tag === 'TEXTAREA' || tag === 'SELECT' || !!t?.isContentEditable ||
    (tag === 'INPUT' && !['range', 'button', 'checkbox', 'file'].includes(t.type));
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Wire up the app inside `root`, which must contain:
 *   #folder-input (input[type=file][webkitdirectory]), #drop-zone, #tree, #status
 * optionally #open-folder (a button that opens the picker), and, when a `player`
 * is given, #player for the controls.
 * `storage` (e.g. localStorage) remembers volume; `mediaSessionEnv` is passed to
 * connectMediaSession (tests inject a fake).
 *
 * @param {HTMLElement | Document} root
 * @param {{ classify?: Function, onSelect?: Function, player?: import('../audio/player.js').Player,
 *           storage?: Storage | null, mediaSessionEnv?: object }} [opts]
 * @returns {{ show: Function, view: any, next: Function, prev: Function, destroy: Function }}
 */
export function initApp(root = document, {
  classify = defaultClassify, onSelect = () => {}, player = null, storage = null, mediaSessionEnv = undefined,
} = {}) {
  const $ = (sel) => root.querySelector(sel);
  const input = $('#folder-input');
  const dropZone = $('#drop-zone');
  const treeEl = $('#tree');
  const status = $('#status');
  const doc = root.ownerDocument || root;

  const setStatus = (text, isError = false) => {
    status.textContent = text;
    status.classList.toggle('error', isError);
  };

  let view = null;
  let tree = null;
  /** @type {{ tracks: any[], index: number }} */
  let playlist = { tracks: [], index: -1 };

  const isPlayable = (node) => kindOf(node, classify) === 'playable';
  const nav = () => ({
    hasPrev: playlist.index > 0,
    hasNext: playlist.index >= 0 && playlist.index < playlist.tracks.length - 1,
  });

  function select(node) {
    if (tree) playlist = folderPlaylist(tree, node.path, isPlayable);
    player?.load(node);
    onSelect(node);
  }

  function playAt(index) {
    const node = playlist.tracks[index];
    if (!node) return;
    playlist.index = index;
    view?.select(node.path);
    player?.load(node);
    onSelect(node);
  }

  function next() {
    const i = step(playlist.tracks.length, playlist.index, +1);
    if (i >= 0) playAt(i);
  }

  function prev() {
    if (!player?.track) return;
    const i = step(playlist.tracks.length, playlist.index, -1);
    if (player.state.currentTime > RESTART_THRESHOLD || i < 0) player.seek(0);
    else playAt(i);
  }

  let controls = null;
  const cleanups = [];
  if (player) {
    const saved = loadVolume(storage);
    if (saved) {
      player.setVolume(saved.volume);
      if (saved.muted !== player.state.muted) player.toggleMute();
    }

    controls = renderControls($('#player'), {
      toggle: () => player.toggle(),
      prev,
      next,
      seek: (t) => player.seek(t),
      setVolume: (v) => player.setVolume(v),
      toggleMute: () => player.toggleMute(),
    }, { volumeAdjustable: player.volumeAdjustable });

    let lastVol = player.state.volume;
    let lastMuted = player.state.muted;
    cleanups.push(player.subscribe((state) => {
      controls.update(state, nav());
      doc.title = state.track ? `${state.playing ? '▶ ' : ''}${displayName(state.track.name)} — ${APP_TITLE}` : APP_TITLE;
      if (state.volume !== lastVol || state.muted !== lastMuted) {
        lastVol = state.volume;
        lastMuted = state.muted;
        saveVolume(storage, state);
      }
    }));
    cleanups.push(connectMediaSession(player, { next, prev }, mediaSessionEnv));
    player.onEnded = next; // auto-advance; stops after the folder's last track

    const onKey = (e) => handleKey(e);
    // Some browsers (Firefox, Safari) activate a focused button/summary on Space *keyup*;
    // swallow that too so Space doesn't also replay the focused track or fold a folder.
    const onKeyUp = (e) => { if (e.key === ' ' && !isTyping(e.target)) e.preventDefault(); };
    doc.addEventListener('keydown', onKey);
    doc.addEventListener('keyup', onKeyUp);
    cleanups.push(() => {
      doc.removeEventListener('keydown', onKey);
      doc.removeEventListener('keyup', onKeyUp);
    });
  }

  /**
   * Space: play/pause (everywhere except text fields; Enter still activates buttons).
   * ←/→: seek ±5 s, except on sliders, which use arrows themselves.
   */
  function handleKey(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (isTyping(t)) return;
    const onSlider = t?.tagName === 'INPUT' && t.type === 'range';

    if (e.key === ' ') {
      e.preventDefault(); // stop page scroll and the focused button's own click
      player.toggle();
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !onSlider && player.track) {
      e.preventDefault();
      player.seekBy(e.key === 'ArrowRight' ? SEEK_STEP : -SEEK_STEP);
    }
  }

  function show(newTree, readErrors = 0) {
    tree = newTree;
    if (tree.children.length === 0) {
      treeEl.replaceChildren();
      setStatus('That folder is empty.');
      return;
    }
    const counts = countKinds(tree, classify);
    view = renderTree(treeEl, tree, { classify, onSelect: select });
    const parts = [plural(counts.playable, 'playable track')];
    if (counts.unsupported) parts.push(`${counts.unsupported} unsupported`);
    if (counts.protected) parts.push(`${counts.protected} protected`);
    if (counts.other) parts.push(plural(counts.other, 'other file'));
    let msg = counts.playable + counts.unsupported + counts.protected === 0 ? 'No audio files found in this folder.' : parts.join(' · ');
    if (readErrors) msg += ` (${plural(readErrors, 'item')} could not be read)`;
    setStatus(msg, readErrors > 0);
  }

  const openBtn = $('#open-folder');
  openBtn?.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    if (!input.files?.length) return;
    show(fromFileList(input.files));
  });

  // Drag and drop: accept drops anywhere in the window (a drop outside the
  // drop zone would otherwise make the browser open the file and leave the app).
  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const on = (type, fn) => {
    doc.addEventListener(type, fn);
    cleanups.push(() => doc.removeEventListener(type, fn));
  };
  on('dragenter', (e) => { stop(e); dropZone.classList.add('dragging'); });
  on('dragover', (e) => { stop(e); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
  on('dragleave', (e) => {
    stop(e);
    if (!e.relatedTarget || !doc.documentElement.contains(e.relatedTarget)) dropZone.classList.remove('dragging');
  });
  on('drop', async (e) => {
    stop(e);
    dropZone.classList.remove('dragging');
    setStatus('Reading folder…');
    try {
      const { entries, errors } = await collectDropped(e.dataTransfer);
      show(buildTree(entries), errors);
    } catch (err) {
      setStatus(`Could not read the dropped items: ${err?.message || err}`, true);
    }
  });

  return {
    show,
    next,
    prev,
    get view() { return view; },
    destroy() { for (const fn of cleanups) fn(); },
  };
}

import { buildTree, fromFileList } from '../fs/tree.js';
import { collectDropped } from '../fs/pickFolder.js';
import { classify as defaultClassify } from '../audio/formats.js';
import { renderTree, renderGroups, countKinds, kindOf } from './browser.js';
import { findCatalogs, defaultCatalog, parseCatalog, applyCatalog, clearCatalog } from '../catalog/catalog.js';
import { groupTracks, GROUP_MODES } from '../catalog/group.js';
import { matcher, filterTree, countFiles } from '../catalog/search.js';
import { renderControls } from './controls.js';
import { folderPlaylist, step } from '../audio/playlist.js';
import { connectMediaSession } from '../audio/mediaSession.js';
import { loadVolume, saveVolume } from '../audio/prefs.js';
import { trackTitle } from './format.js';

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

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** At most this many missing catalog paths are listed by name. */
const MAX_MISSING_LISTED = 10;

/**
 * Wire up the app inside `root`, which must contain:
 *   #folder-input (input[type=file][webkitdirectory]), #drop-zone, #tree, #status
 * optionally #open-folder (a button that opens the picker), #toolbar holding #search
 * (free-text filter) and #catalog-bar with #catalog-select and #group-select,
 * #warnings (a <details> with <summary> and <ul>),
 * and, when a `player` is given, #player for the controls.
 *
 * Catalogs: `.cex` files at the top of the opened folder are offered in #catalog-select
 * ("catalog.cex" is chosen by default). A catalog supplies titles etc. and enables
 * grouping by composer / performer / album.
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
  const toolbar = $('#toolbar');
  const searchEl = $('#search');
  const bar = $('#catalog-bar');
  const catSel = $('#catalog-select');
  const groupSel = $('#group-select');
  const warnEl = $('#warnings');

  const setStatus = (text, isError = false) => {
    status.textContent = text;
    status.classList.toggle('error', isError);
  };

  let view = null;
  let tree = null;
  let readErrors = 0;
  /** The tree the current playlist came from (a newly opened folder is a different tree). */
  let playlistTree = null;

  // Catalog state for the current tree.
  let catalogs = [];
  let catalogFolder = null;
  let catalogName = '';
  /** @type {{ matched: number, warnings: string[] } | null} */
  let catalogInfo = null;
  let groupMode = 'folder';
  let loadId = 0;
  let query = '';
  /** The (possibly search-filtered) tree currently shown in Folder view. */
  let shownTree = null;
  /** @type {{ tracks: any[], index: number }} */
  let playlist = { tracks: [], index: -1 };

  const isPlayable = (node) => kindOf(node, classify) === 'playable';
  const nav = () => ({
    hasPrev: playlist.index > 0,
    hasNext: playlist.index >= 0 && playlist.index < playlist.tracks.length - 1,
  });

  /** Play `node`; `tracks` is the group it was picked from (else its folder is the playlist). */
  function select(node, tracks) {
    playlistTree = tree;
    if (tracks) {
      const playable = tracks.filter(isPlayable);
      playlist = { tracks: playable, index: playable.indexOf(node) };
    } else if (shownTree) {
      // In Folder view the playlist is the track's folder as shown (search results only, if searching).
      playlist = folderPlaylist(shownTree, node.path, isPlayable);
    }
    player?.load(node);
    onSelect(node);
  }

  function playAt(index) {
    const node = playlist.tracks[index];
    if (!node) return;
    playlist.index = index;
    if (playlistTree === tree) view?.select(node.path);
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
      doc.title = state.track ? `${state.playing ? '▶ ' : ''}${trackTitle(state.track)} — ${APP_TITLE}` : APP_TITLE;
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

    if (e.key === '/' && searchEl && toolbar && !toolbar.hidden) {
      e.preventDefault();
      searchEl.focus();
    } else if (e.key === ' ') {
      e.preventDefault(); // stop page scroll and the focused button's own click
      player.toggle();
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !onSlider && player.track) {
      e.preventDefault();
      player.seekBy(e.key === 'ArrowRight' ? SEEK_STEP : -SEEK_STEP);
    }
  }

  /**
   * Show a newly opened folder. Renders right away; if the folder has a catalog.cex
   * it is then read and applied (the returned promise settles when that's done).
   */
  function show(newTree, errors = 0) {
    tree = newTree;
    readErrors = errors;
    loadId++;
    ({ folder: catalogFolder, catalogs } = findCatalogs(tree));
    catalogName = '';
    catalogInfo = null;
    groupMode = 'folder';
    query = '';
    if (searchEl) searchEl.value = '';
    updateBar();
    render();
    const def = defaultCatalog(catalogs);
    return def ? useCatalog(def) : Promise.resolve();
  }

  /** Switch to catalog `name` ("" = none), then re-render. */
  async function useCatalog(name) {
    const id = ++loadId;
    catalogName = name;
    if (!name) {
      clearCatalog(tree);
      catalogInfo = null;
      groupMode = 'folder';
    } else {
      const node = catalogs.find((c) => c.name === name);
      let warnings = [];
      let matched = 0;
      try {
        const text = await node.file.text();
        if (id !== loadId) return; // another folder or catalog was chosen meanwhile
        const { entries, errors } = parseCatalog(text);
        const r = applyCatalog(tree, catalogFolder, entries);
        matched = r.matched;
        warnings = [...errors];
        if (r.missing.length) {
          const shown = r.missing.slice(0, MAX_MISSING_LISTED).join(', ');
          const more = r.missing.length > MAX_MISSING_LISTED ? `, and ${r.missing.length - MAX_MISSING_LISTED} more` : '';
          warnings.push(`${plural(r.missing.length, 'listed file')} not found: ${shown}${more}`);
        }
      } catch (err) {
        if (id !== loadId) return;
        clearCatalog(tree);
        warnings = [`could not be read: ${err?.message || err}`];
      }
      catalogInfo = { matched, warnings };
    }
    updateBar();
    render();
    player?.emit(); // titles in the player bar / Now Playing may have changed
  }

  function updateBar() {
    if (toolbar) toolbar.hidden = !tree || tree.children.length === 0;
    if (!bar) return;
    bar.hidden = catalogs.length === 0;
    catSel.replaceChildren(new Option('No catalog', ''), ...catalogs.map((c) => new Option(c.name, c.name)));
    catSel.value = catalogName;
    groupSel.replaceChildren(new Option('Folder', 'folder'),
      ...Object.entries(GROUP_MODES).map(([k, m]) => new Option(m.label, k)));
    groupSel.value = groupMode;
    groupSel.disabled = !catalogName;
    groupSel.title = catalogName ? '' : 'Grouping uses catalog columns — choose a catalog first';
  }

  function render() {
    if (!tree) return;
    if (tree.children.length === 0) {
      treeEl.replaceChildren();
      view = null;
      setStatus('That folder is empty.');
      showWarnings([]);
      return;
    }
    const matches = matcher(query);
    const isAudio = (n) => kindOf(n, classify) !== 'other';
    // While searching, only matching audio files are shown (and everything is expanded).
    const include = matches ? (n) => isAudio(n) && matches(n) : null;
    let shownCount = 0;
    if (groupMode === 'folder') {
      shownTree = include ? filterTree(tree, include) : tree;
      shownCount = include ? countFiles(shownTree) : 0;
      view = renderTree(treeEl, shownTree, { classify, onSelect: (n) => select(n), openAll: !!include });
    } else {
      shownTree = null;
      const groups = groupTracks(tree, groupMode, include ?? isAudio);
      shownCount = include ? new Set(groups.flatMap((g) => g.tracks)).size : 0;
      view = renderGroups(treeEl, groups, { classify, onSelect: (n, tracks) => select(n, tracks), openAll: !!include });
    }
    if (include && shownCount === 0) {
      const p = doc.createElement('p');
      p.className = 'empty';
      p.textContent = `No tracks match “${query.trim()}”.`;
      treeEl.replaceChildren(p);
    }
    if (player?.track && playlistTree === tree) view.select(player.track.path);

    const counts = countKinds(tree, classify);
    const parts = [plural(counts.playable, 'playable track')];
    if (counts.unsupported) parts.push(`${counts.unsupported} unsupported`);
    if (counts.protected) parts.push(`${counts.protected} protected`);
    if (counts.other) parts.push(plural(counts.other, 'other file'));
    let msg = counts.playable + counts.unsupported + counts.protected === 0 ? 'No audio files found in this folder.' : parts.join(' · ');
    if (catalogName && catalogInfo) msg += ` · ${catalogInfo.matched} in ${catalogName}`;
    if (include) msg += ` · ${plural(shownCount, 'match', 'matches')} for “${query.trim()}”`;
    if (readErrors) msg += ` (${plural(readErrors, 'item')} could not be read)`;
    setStatus(msg, readErrors > 0);
    showWarnings(catalogInfo?.warnings.map((w) => `${catalogName}: ${w}`) ?? []);
  }

  function showWarnings(list) {
    if (!warnEl) return;
    warnEl.hidden = list.length === 0;
    warnEl.querySelector('summary').textContent = plural(list.length, 'catalog warning');
    warnEl.querySelector('ul').replaceChildren(...list.map((w) => {
      const li = doc.createElement('li');
      li.textContent = w;
      return li;
    }));
  }

  catSel?.addEventListener('change', () => useCatalog(catSel.value));
  searchEl?.addEventListener('input', () => {
    query = searchEl.value;
    render();
  });
  searchEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchEl.value) {
      e.preventDefault();
      searchEl.value = '';
      query = '';
      render();
    }
  });
  groupSel?.addEventListener('change', () => {
    groupMode = groupSel.value;
    render();
  });

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
    useCatalog,
    next,
    prev,
    get view() { return view; },
    destroy() { for (const fn of cleanups) fn(); },
  };
}

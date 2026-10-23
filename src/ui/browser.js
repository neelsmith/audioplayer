import { classify as defaultClassify } from '../audio/formats.js';

/**
 * @typedef {import('../fs/tree.js').DirNode} DirNode
 * @typedef {import('../fs/tree.js').FileNode} FileNode
 * @typedef {(name: string, type?: string) => import('../audio/formats.js').FileKind} Classifier
 */

/** Badge text and tooltip for audio that is shown but can't be played. */
const UNPLAYABLE = {
  unsupported: { badge: 'unsupported', title: 'Audio format not supported in this browser' },
  protected: { badge: 'protected', title: 'Protected (DRM) — can’t be played in a browser' },
};

/** Kind of a file node, using the File's reported MIME type when available. */
export function kindOf(node, classify = defaultClassify) {
  return classify(node.name, node.file?.type || '');
}

/** Count files of each kind in a tree. */
export function countKinds(root, classify = defaultClassify) {
  const counts = { playable: 0, unsupported: 0, protected: 0, other: 0 };
  const visit = (dir) => {
    for (const c of dir.children) {
      if (c.type === 'dir') visit(c);
      else counts[kindOf(c, classify)]++;
    }
  };
  visit(root);
  return counts;
}

/** List label: the catalog title if there is one, else the file name. */
function fileLabel(node) {
  return node.meta?.title || node.name;
}

/** Tooltip for a cataloged track: file name plus caption / credits / license. */
function catalogTooltip(node) {
  const m = node.meta;
  if (!m) return '';
  return [node.path, m.caption, m.credits, m.license].filter(Boolean).join('\n');
}

function renderFile(node, classify, onSelect) {
  const li = document.createElement('li');
  const kind = kindOf(node, classify);
  li.className = `file ${kind}`;
  li.dataset.path = node.path;

  if (kind === 'playable') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'track';
    btn.textContent = fileLabel(node);
    const tip = catalogTooltip(node);
    if (tip) btn.title = tip;
    btn.addEventListener('click', () => onSelect(node, btn));
    li.append(btn);
  } else {
    const span = document.createElement('span');
    span.textContent = fileLabel(node);
    span.setAttribute('aria-disabled', 'true');
    li.append(span);
    const info = UNPLAYABLE[kind];
    if (info) {
      li.title = info.title;
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = info.badge;
      badge.setAttribute('aria-label', info.title);
      li.append(badge);
    }
  }
  return li;
}

function renderDir(dir, classify, onSelect, depth, openAll) {
  const ul = document.createElement('ul');
  for (const child of dir.children) {
    if (child.type === 'file') {
      ul.append(renderFile(child, classify, onSelect));
      continue;
    }
    const li = document.createElement('li');
    li.className = 'dir';
    li.dataset.path = child.path;
    const details = document.createElement('details');
    details.open = openAll || depth === 0; // normally top level expanded, the rest collapsed
    const summary = document.createElement('summary');
    summary.textContent = child.name;
    details.append(summary, renderDir(child, classify, onSelect, depth + 1, openAll));
    li.append(details);
    ul.append(li);
  }
  return ul;
}

/**
 * Render a folder tree into `container`, replacing its contents.
 * Folders are native <details>/<summary> (keyboard accessible, collapsible).
 * Playable tracks are buttons; non-audio is greyed; unsupported and
 * DRM-protected audio are greyed with their own badge and tooltip.
 *
 * @param {HTMLElement} container
 * @param {DirNode} root
 * @param {{ onSelect?: (node: FileNode) => void, classify?: Classifier, openAll?: boolean }} [opts]
 *   openAll expands every folder (used for search results)
 * @returns {{ select: (path: string) => void }} lets callers move the highlight (e.g. next track)
 */
export function renderTree(container, root, { onSelect = () => {}, classify = defaultClassify, openAll = false } = {}) {
  const hl = highlighter();
  const handle = (node, btn) => {
    hl.set(btn);
    onSelect(node);
  };

  const tree = renderDir(root, classify, handle, 0, openAll);
  tree.className = 'tree';
  container.replaceChildren(tree);

  return {
    select(path) {
      hl.set(revealTrack(findTrackButton(container, path)));
    },
  };
}

/** Keeps exactly one track button marked aria-current. */
function highlighter() {
  let current = null;
  return {
    set(btn) {
      if (!btn) return;
      current?.removeAttribute('aria-current');
      current = btn;
      btn.setAttribute('aria-current', 'true');
    },
  };
}

function findTrackButton(scope, path) {
  const li = [...scope.querySelectorAll('li.file')].find((el) => el.dataset.path === path);
  return li?.querySelector('button.track') ?? null;
}

/** Open the <details> around a button so it's visible. */
function revealTrack(btn) {
  for (let d = btn?.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
  return btn;
}

/**
 * Render catalog groups (from catalog/group.js) as collapsible sections of tracks.
 * `onSelect(node, tracks)` gets the group's tracks, so playback continues within
 * the group the track was chosen from (a track can be in several tag groups).
 *
 * @param {HTMLElement} container
 * @param {{ key: string, label: string, tracks: FileNode[] }[]} groups
 * @param {{ onSelect?: (node: FileNode, tracks: FileNode[]) => void, classify?: Classifier, openAll?: boolean }} [opts]
 * @returns {{ select: (path: string) => void }}
 */
export function renderGroups(container, groups, { onSelect = () => {}, classify = defaultClassify, openAll = false } = {}) {
  const hl = highlighter();
  let activeGroup = null;

  const list = document.createElement('ul');
  list.className = 'tree groups';
  for (const g of groups) {
    const li = document.createElement('li');
    li.className = 'dir group';
    li.dataset.group = g.key;
    const details = document.createElement('details');
    details.open = openAll || groups.length === 1;
    const summary = document.createElement('summary');
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(g.tracks.length);
    count.setAttribute('aria-label', `${g.tracks.length} ${g.tracks.length === 1 ? 'track' : 'tracks'}`);
    summary.append(g.label, ' ', count);
    const ul = document.createElement('ul');
    for (const node of g.tracks) {
      ul.append(renderFile(node, classify, (n, btn) => {
        activeGroup = li;
        hl.set(btn);
        onSelect(n, g.tracks);
      }));
    }
    details.append(summary, ul);
    li.append(details);
    list.append(li);
  }
  container.replaceChildren(list);

  return {
    /** Highlight a track, preferring the group it's currently being played from. */
    select(path) {
      const btn = (activeGroup && findTrackButton(activeGroup, path)) || findTrackButton(container, path);
      if (btn) activeGroup = btn.closest('li.group');
      hl.set(revealTrack(btn));
    },
  };
}

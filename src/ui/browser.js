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

function renderFile(node, classify, onSelect) {
  const li = document.createElement('li');
  const kind = kindOf(node, classify);
  li.className = `file ${kind}`;
  li.dataset.path = node.path;

  if (kind === 'playable') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'track';
    btn.textContent = node.name;
    btn.addEventListener('click', () => onSelect(node, btn));
    li.append(btn);
  } else {
    const span = document.createElement('span');
    span.textContent = node.name;
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

function renderDir(dir, classify, onSelect, depth) {
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
    details.open = depth === 0; // top level expanded, the rest collapsed
    const summary = document.createElement('summary');
    summary.textContent = child.name;
    details.append(summary, renderDir(child, classify, onSelect, depth + 1));
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
 * @param {{ onSelect?: (node: FileNode) => void, classify?: Classifier }} [opts]
 * @returns {{ select: (path: string) => void }} lets callers move the highlight (e.g. next track)
 */
export function renderTree(container, root, { onSelect = () => {}, classify = defaultClassify } = {}) {
  let current = null;
  const highlight = (btn) => {
    current?.removeAttribute('aria-current');
    current = btn;
    btn?.setAttribute('aria-current', 'true');
  };
  const handle = (node, btn) => {
    highlight(btn);
    onSelect(node);
  };

  const tree = renderDir(root, classify, handle, 0);
  tree.className = 'tree';
  container.replaceChildren(tree);

  return {
    select(path) {
      const li = [...container.querySelectorAll('li.file')].find((el) => el.dataset.path === path);
      const btn = li?.querySelector('button.track');
      if (!btn) return;
      for (let d = btn.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
      highlight(btn);
    },
  };
}
